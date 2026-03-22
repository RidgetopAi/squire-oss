/**
 * Calendar Tools
 *
 * LLM tools for reading and creating user calendar events in Google Calendar.
 * Queries the google_events table (synced from Google) for actual calendar events.
 * Can create new events directly in Google Calendar.
 *
 * IMPORTANT: All responses include pre-computed date labels and local times
 * so the LLM doesn't need to do timezone math. The LLM should use the
 * `date_label` and `time_local` fields directly when presenting events.
 */

import { getAllEvents, pushEventToGoogle, type GoogleEvent } from '../services/google/events.js';
import { getDefaultPushCalendar } from '../services/google/calendars.js';
import { listSyncEnabledAccounts } from '../services/google/auth.js';
import { config } from '../config/index.js';
import type { ToolHandler, ToolSpec } from './types.js';

// =============================================================================
// DATE/TIME FORMATTING HELPERS
// =============================================================================

/**
 * Get today's date string (YYYY-MM-DD) in the configured timezone
 */
function getTodayDateString(): string {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: config.timezone }); // en-CA gives YYYY-MM-DD
}

/**
 * Get tomorrow's date string (YYYY-MM-DD) in the configured timezone
 */
function getTomorrowDateString(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return tomorrow.toLocaleDateString('en-CA', { timeZone: config.timezone });
}

/**
 * Get the date string (YYYY-MM-DD) for an event in the configured timezone
 */
function getEventDateString(eventTime: Date, allDay: boolean): string {
  if (allDay) {
    // All-day events are stored as midnight UTC on the date
    // Use UTC date to avoid timezone shift issues
    return eventTime.toISOString().substring(0, 10);
  }
  // For timed events, convert to user's timezone
  return eventTime.toLocaleDateString('en-CA', { timeZone: config.timezone });
}

/**
 * Compute a human-friendly date label for an event
 * Returns "Today", "Tomorrow", or "Wednesday, January 9"
 */
function getDateLabel(eventTime: Date | null, allDay: boolean): string {
  if (!eventTime) return 'Unknown date';

  const eventDateStr = getEventDateString(eventTime, allDay);
  const todayStr = getTodayDateString();
  const tomorrowStr = getTomorrowDateString();

  if (eventDateStr === todayStr) {
    return 'Today';
  } else if (eventDateStr === tomorrowStr) {
    return 'Tomorrow';
  } else {
    // Return "Wednesday, January 9"
    if (allDay) {
      // Parse the UTC date string to avoid timezone issues
      const [year, month, day] = eventDateStr.split('-').map(Number);
      const date = new Date(year!, month! - 1, day!);
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    }
    return eventTime.toLocaleDateString('en-US', {
      timeZone: config.timezone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }
}

/**
 * Format time in the user's local timezone
 * Returns "10:00 AM EST" or null for all-day events
 */
function getLocalTime(eventTime: Date | null, allDay: boolean): string | null {
  if (!eventTime || allDay) return null;
  return eventTime.toLocaleTimeString('en-US', {
    timeZone: config.timezone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Get the day of week for an event in the user's timezone
 */
function getDayOfWeek(eventTime: Date | null, allDay: boolean): string | null {
  if (!eventTime) return null;
  if (allDay) {
    // Parse the UTC date string to avoid timezone issues
    const dateStr = eventTime.toISOString().substring(0, 10);
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year!, month! - 1, day!);
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return eventTime.toLocaleDateString('en-US', {
    timeZone: config.timezone,
    weekday: 'long',
  });
}

/**
 * Format event time for LLM consumption (raw ISO timestamp).
 * All-day events return just the date (YYYY-MM-DD) to avoid timezone confusion.
 * Timed events return the full ISO timestamp.
 */
function formatEventTime(time: Date | null, allDay: boolean): string | null {
  if (!time) return null;
  if (allDay) {
    // For all-day events, extract just the date portion
    // The time is stored as midnight UTC, so we use UTC methods to get the correct date
    const iso = time.toISOString();
    return iso.substring(0, 10); // YYYY-MM-DD
  }
  return time.toISOString();
}

/**
 * Get current date/time context for LLM
 */
function getCurrentContext() {
  const now = new Date();
  return {
    current_time: now.toLocaleString('en-US', {
      timeZone: config.timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }),
    timezone: config.timezone,
    today_date: getTodayDateString(),
  };
}

// =============================================================================
// GET UPCOMING EVENTS TOOL
// =============================================================================

interface GetUpcomingEventsArgs {
  days?: number;
  limit?: number;
  include_completed?: boolean;
}

async function handleGetUpcomingEvents(args: GetUpcomingEventsArgs | null): Promise<string> {
  const { days = 7, limit = 50 } = args ?? {};

  try {
    // Calculate date range
    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Query actual Google Calendar events
    const events = await getAllEvents({
      timeMin: now,
      timeMax: endDate,
    });

    // Apply limit
    const limitedEvents = events.slice(0, limit);

    const context = getCurrentContext();

    if (limitedEvents.length === 0) {
      return JSON.stringify({
        message: `No calendar events in the next ${days} day(s)`,
        ...context,
        date_range: {
          from: now.toISOString(),
          to: endDate.toISOString(),
        },
        events: [],
      });
    }

    // Format for LLM consumption with pre-computed date labels
    const formatEvent = (e: GoogleEvent & { calendar_name?: string }) => ({
      id: e.id,
      title: e.summary,
      description: e.description,
      // Raw timestamps (for reference)
      start_time: formatEventTime(e.start_time, e.all_day),
      end_time: formatEventTime(e.end_time, e.all_day),
      // PRE-COMPUTED LABELS - LLM should use these directly
      date_label: getDateLabel(e.start_time, e.all_day),
      time_local: getLocalTime(e.start_time, e.all_day),
      day_of_week: getDayOfWeek(e.start_time, e.all_day),
      all_day: e.all_day,
      location: e.location,
      status: e.status,
      is_recurring: !!e.rrule || !!e.recurring_event_id,
      calendar: e.calendar_name,
    });

    return JSON.stringify({
      ...context,
      date_range: {
        from: now.toISOString(),
        to: endDate.toISOString(),
      },
      count: limitedEvents.length,
      // Instructions for LLM
      usage_note: 'Use date_label and time_local fields when presenting events. These are pre-computed for the user\'s timezone.',
      events: limitedEvents.map(formatEvent),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to get upcoming events: ${message}`, events: [] });
  }
}

// Exported in tools array below

// =============================================================================
// GET TODAY'S EVENTS TOOL
// =============================================================================

interface GetTodaysEventsArgs {
  include_overdue?: boolean;
}

async function handleGetTodaysEvents(args: GetTodaysEventsArgs | null): Promise<string> {
  // include_overdue not applicable for calendar events
  void args;

  try {
    // Calculate today's range in the configured timezone
    const now = new Date();
    const todayStr = getTodayDateString();

    // Parse today's date to get start/end of day in local timezone
    const [year, month, day] = todayStr.split('-').map(Number);

    // Create start/end of day - these will be in server's local time
    // which should match config.timezone if server is configured correctly
    const startOfDay = new Date(year!, month! - 1, day!, 0, 0, 0, 0);
    const endOfDay = new Date(year!, month! - 1, day!, 23, 59, 59, 999);

    // Get today's Google Calendar events
    const events = await getAllEvents({
      timeMin: startOfDay,
      timeMax: endOfDay,
    });

    const context = getCurrentContext();

    if (events.length === 0) {
      return JSON.stringify({
        message: 'No calendar events for today',
        ...context,
        events: [],
      });
    }

    // Format for LLM consumption with pre-computed labels
    const formatEvent = (e: GoogleEvent & { calendar_name?: string }) => {
      const startTime = e.start_time ? new Date(e.start_time) : null;
      const isPast = startTime && !e.all_day && startTime < now;

      return {
        id: e.id,
        title: e.summary,
        description: e.description,
        // Raw timestamps
        start_time: formatEventTime(e.start_time, e.all_day),
        end_time: formatEventTime(e.end_time, e.all_day),
        // PRE-COMPUTED LABELS
        date_label: 'Today',
        time_local: getLocalTime(e.start_time, e.all_day),
        day_of_week: getDayOfWeek(e.start_time, e.all_day),
        all_day: e.all_day,
        location: e.location,
        status: e.status,
        is_past: isPast,
        calendar: e.calendar_name,
      };
    };

    const formattedEvents = events.map(formatEvent);
    const upcomingCount = formattedEvents.filter((e) => !e.is_past).length;

    return JSON.stringify({
      ...context,
      count: formattedEvents.length,
      upcoming_count: upcomingCount,
      usage_note: 'All events are for today. Use time_local field when presenting times.',
      events: formattedEvents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to get today's events: ${message}`, events: [] });
  }
}

// Exported in tools array below

// =============================================================================
// GET EVENTS DUE SOON TOOL
// =============================================================================

interface GetEventsDueSoonArgs {
  within_hours?: number;
}

async function handleGetEventsDueSoon(args: GetEventsDueSoonArgs | null): Promise<string> {
  const { within_hours = 24 } = args ?? {};

  try {
    const now = new Date();
    const endTime = new Date(now.getTime() + within_hours * 60 * 60 * 1000);

    // Get Google Calendar events within the time window
    const events = await getAllEvents({
      timeMin: now,
      timeMax: endTime,
    });

    const context = getCurrentContext();

    if (events.length === 0) {
      return JSON.stringify({
        message: `No calendar events within the next ${within_hours} hour(s)`,
        ...context,
        within_hours,
        events: [],
      });
    }

    // Format for LLM consumption with pre-computed labels
    const formattedEvents = events.map((e: GoogleEvent & { calendar_name?: string }) => {
      const startTime = e.start_time ? new Date(e.start_time) : null;
      // For all-day events, don't calculate minutes (not meaningful)
      const minutesUntilStart = startTime && !e.all_day
        ? Math.round((startTime.getTime() - now.getTime()) / (1000 * 60))
        : null;

      return {
        id: e.id,
        title: e.summary,
        description: e.description,
        // Raw timestamps
        start_time: formatEventTime(e.start_time, e.all_day),
        end_time: formatEventTime(e.end_time, e.all_day),
        // PRE-COMPUTED LABELS
        date_label: getDateLabel(e.start_time, e.all_day),
        time_local: getLocalTime(e.start_time, e.all_day),
        day_of_week: getDayOfWeek(e.start_time, e.all_day),
        all_day: e.all_day,
        location: e.location,
        minutes_until_start: minutesUntilStart,
        status: e.status,
        calendar: e.calendar_name,
      };
    });

    return JSON.stringify({
      ...context,
      count: formattedEvents.length,
      within_hours,
      usage_note: 'Use date_label and time_local fields when presenting events.',
      events: formattedEvents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to get events due soon: ${message}`, events: [] });
  }
}

// Exported in tools array below

// =============================================================================
// CREATE CALENDAR EVENT TOOL
// =============================================================================

interface CreateCalendarEventArgs {
  title: string;
  start_time: string;
  duration_minutes?: number;
  all_day?: boolean;
  description?: string;
  location?: string;
}

/**
 * Parse a date/time string flexibly
 * Supports ISO 8601, or date strings like "2026-01-09" with optional time
 */
function parseDateTime(input: string, allDay: boolean): Date {
  // If all-day, just parse the date portion
  if (allDay) {
    // Handle YYYY-MM-DD format
    const dateMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      return new Date(parseInt(year!, 10), parseInt(month!, 10) - 1, parseInt(day!, 10));
    }
  }

  // Try parsing as ISO 8601 first
  const date = new Date(input);
  if (!isNaN(date.getTime())) {
    return date;
  }

  throw new Error(`Unable to parse date/time: ${input}`);
}

async function handleCreateCalendarEvent(args: CreateCalendarEventArgs): Promise<string> {
  const {
    title,
    start_time,
    duration_minutes = 60,
    all_day = false,
    description,
    location
  } = args;

  if (!title || title.trim().length === 0) {
    return JSON.stringify({ error: 'Title is required', event: null });
  }

  if (!start_time) {
    return JSON.stringify({ error: 'Start time is required', event: null });
  }

  try {
    // Get the first sync-enabled Google account
    const accounts = await listSyncEnabledAccounts();
    if (accounts.length === 0) {
      return JSON.stringify({
        error: 'No Google account connected. Please connect a Google account first.',
        event: null
      });
    }
    const account = accounts[0]!;

    // Get the default calendar for pushing events
    const calendar = await getDefaultPushCalendar(account.id);
    if (!calendar) {
      return JSON.stringify({
        error: 'No calendar available for creating events. Please configure a default calendar.',
        event: null
      });
    }

    // Check if calendar supports writes
    if (calendar.sync_direction === 'read_only') {
      return JSON.stringify({
        error: `Calendar "${calendar.summary}" is read-only. Please configure a writable calendar.`,
        event: null
      });
    }

    // Parse the start time
    let startDate: Date;
    try {
      startDate = parseDateTime(start_time, all_day);
    } catch (parseError) {
      return JSON.stringify({
        error: `Invalid start_time format: ${start_time}. Use ISO 8601 format (e.g., "2026-01-09T08:00:00" or "2026-01-09" for all-day).`,
        event: null
      });
    }

    // Create the event in Google Calendar
    // Note: Not linking to a commitment - this is a standalone calendar event
    const result = await pushEventToGoogle(calendar, {
      title: title.trim(),
      description: description?.trim(),
      due_at: startDate,
      duration_minutes: all_day ? 24 * 60 : duration_minutes, // All-day = 24 hours
      all_day,
      timezone: config.timezone,
    });

    // Calculate end time for response
    const endDate = new Date(startDate.getTime() + (all_day ? 24 * 60 : duration_minutes) * 60 * 1000);

    return JSON.stringify({
      message: `Event "${title}" created successfully in "${calendar.summary}"`,
      event: {
        id: result.event_id,
        title: title.trim(),
        description: description?.trim() || null,
        location: location || null,
        start_time: all_day ? startDate.toISOString().split('T')[0] : startDate.toISOString(),
        end_time: all_day ? endDate.toISOString().split('T')[0] : endDate.toISOString(),
        // Include pre-computed labels for confirmation
        date_label: getDateLabel(startDate, all_day),
        time_local: getLocalTime(startDate, all_day),
        all_day,
        calendar: calendar.summary,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CreateCalendarEvent] Error:', error);
    return JSON.stringify({ error: `Failed to create calendar event: ${message}`, event: null });
  }
}

// =============================================================================
// TOOL SPECS EXPORT
// =============================================================================

export const tools: ToolSpec[] = [
  {
    name: 'get_upcoming_events',
    description:
      'Get the user\'s upcoming scheduled items (commitments, tasks with due dates, and calendar events if synced). Use when user asks "what\'s coming up?", "what do I have planned?", or "what\'s on my schedule?" Returns scheduled items for the next N days. IMPORTANT: Use the date_label and time_local fields directly when presenting events - these are pre-computed for the user\'s timezone.',
    parameters: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days ahead to look (default: 7, max: 30)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return (default: 50)',
        },
        include_completed: {
          type: 'boolean',
          description: 'Include completed events (default: false)',
        },
      },
      required: [],
    },
    handler: handleGetUpcomingEvents as ToolHandler,
  },
  {
    name: 'get_todays_events',
    description:
      'Get the user\'s scheduled items for TODAY plus any overdue items. Use when user asks "what do I have today?", "what\'s on my schedule today?", or "anything due today?" IMPORTANT: Use the time_local field when presenting event times.',
    parameters: {
      type: 'object',
      properties: {
        include_overdue: {
          type: 'boolean',
          description: 'Include overdue events from previous days (default: true)',
        },
      },
      required: [],
    },
    handler: handleGetTodaysEvents as ToolHandler,
  },
  {
    name: 'get_events_due_soon',
    description:
      'Get events that are due soon (within a specified number of hours). Use this when the user asks "what\'s coming up soon?", "do I have anything urgent?", or needs to know about imminent deadlines. IMPORTANT: Use date_label and time_local fields when presenting events.',
    parameters: {
      type: 'object',
      properties: {
        within_hours: {
          type: 'number',
          description: 'Hours ahead to look for due events (default: 24)',
        },
      },
      required: [],
    },
    handler: handleGetEventsDueSoon as ToolHandler,
  },
  {
    name: 'create_calendar_event',
    description:
      'Create a new event in the user\'s Google Calendar. Use this when the user asks to add something to their calendar, schedule an event, or block time. Examples: "add a meeting to my calendar", "schedule dentist appointment", "block Friday 8am-5pm for Pad-A-Thon".',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title/name of the event (e.g., "Team Meeting", "Dentist Appointment")',
        },
        start_time: {
          type: 'string',
          description: 'The start date/time in ISO 8601 format. For timed events use full datetime (e.g., "2026-01-09T08:00:00"). For all-day events use date only (e.g., "2026-01-09").',
        },
        duration_minutes: {
          type: 'number',
          description: 'Duration in minutes (default: 60). For multi-hour events, calculate minutes (e.g., 8am-5pm = 540 minutes).',
        },
        all_day: {
          type: 'boolean',
          description: 'Whether this is an all-day event (default: false). If true, only the date portion of start_time is used.',
        },
        description: {
          type: 'string',
          description: 'Optional description or notes for the event.',
        },
        location: {
          type: 'string',
          description: 'Optional location for the event.',
        },
      },
      required: ['title', 'start_time'],
    },
    handler: handleCreateCalendarEvent as ToolHandler,
  },
];
