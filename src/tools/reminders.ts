/**
 * Reminder Tools
 *
 * LLM tools for creating reminders. When the user explicitly asks to create
 * a reminder (e.g., "create a reminder", "set a reminder", "remind me"),
 * this tool should be used instead of relying on passive extraction.
 */

import { createScheduledReminder, createStandaloneReminder } from '../services/planning/reminders.js';
import { config } from '../config/index.js';
import type { ToolHandler, ToolSpec } from './types.js';

// =============================================================================
// TIMEZONE HELPER - Dynamic DST-aware offset
// =============================================================================

/**
 * Returns a dynamic timezone description string for LLM tool instructions.
 * Reads the current UTC offset from Node so DST is handled automatically.
 * e.g., "EST (UTC-5)" in winter, "EDT (UTC-4)" in summer
 */
function getTimezoneInstruction(): string {
  const now = new Date();
  // Get offset in minutes (negative for west of UTC), convert to hours
  const offsetMinutes = now.getTimezoneOffset(); // e.g., 300 for EST, 240 for EDT
  const offsetHours = offsetMinutes / 60;
  const sign = offsetHours > 0 ? '-' : '+';
  const absHours = Math.abs(offsetHours);

  // Determine abbreviation using Intl
  const abbr = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    timeZoneName: 'short',
  }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? `UTC${sign}${absHours}`;

  // Example times for the description
  const nineAMUtc = offsetHours + 9;   // 9am local -> UTC
  const twoPMUtc  = offsetHours + 14;  // 2pm local -> UTC
  const defaultUtc = offsetHours + 9;  // default 9am local -> UTC

  return (
    `TIMEZONE RULE: User is in ${abbr} (UTC${sign}${absHours}). ` +
    `Convert local times to UTC by adding ${absHours} hours. ` +
    `Examples: 9am ${abbr} = ${nineAMUtc}:00 UTC, 2pm ${abbr} = ${twoPMUtc}:00 UTC. ` +
    `If user gives only a date (e.g., "Monday"), default to 9am local time (${String(defaultUtc).padStart(2,'0')}:00:00Z).`
  );
}

// =============================================================================
// CREATE REMINDER TOOL
// =============================================================================

interface CreateReminderArgs {
  title: string;
  scheduled_at?: string;      // ISO 8601 datetime for specific date/time
  delay_minutes?: number;     // Alternative: delay from now in minutes
}

/**
 * Format a date for user-friendly display
 */
function formatReminderTime(date: Date): string {
  return date.toLocaleString('en-US', {
    timeZone: config.timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Parse a datetime string, handling timezone conversion
 * The LLM should provide times in UTC (ending with Z)
 */
function parseScheduledAt(input: string): Date {
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${input}`);
  }
  return date;
}

async function handleCreateReminder(args: CreateReminderArgs): Promise<string> {
  const { title, scheduled_at, delay_minutes } = args;

  if (!title || title.trim().length === 0) {
    return JSON.stringify({
      error: 'Title is required',
      reminder: null
    });
  }

  // Must have either scheduled_at or delay_minutes
  if (!scheduled_at && delay_minutes === undefined) {
    return JSON.stringify({
      error: 'Either scheduled_at (ISO datetime) or delay_minutes must be provided',
      reminder: null
    });
  }

  try {
    let reminder;

    if (delay_minutes !== undefined && delay_minutes > 0) {
      // Use delay-based creation (e.g., "in 30 minutes")
      reminder = await createStandaloneReminder(title.trim(), delay_minutes);
    } else if (scheduled_at) {
      // Use scheduled time (e.g., "Monday at 9am")
      const scheduledDate = parseScheduledAt(scheduled_at);

      // Validate it's in the future
      if (scheduledDate <= new Date()) {
        return JSON.stringify({
          error: 'Scheduled time must be in the future',
          reminder: null
        });
      }

      reminder = await createScheduledReminder(title.trim(), scheduledDate);
    } else {
      return JSON.stringify({
        error: 'Invalid parameters: delay_minutes must be positive or scheduled_at must be provided',
        reminder: null
      });
    }

    const displayTime = formatReminderTime(reminder.scheduled_for);

    return JSON.stringify({
      message: `Reminder created: "${reminder.title}" for ${displayTime}`,
      reminder: {
        id: reminder.id,
        title: reminder.title,
        scheduled_for: reminder.scheduled_for.toISOString(),
        display_time: displayTime,
        status: reminder.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CreateReminder] Error:', error);
    return JSON.stringify({
      error: `Failed to create reminder: ${message}`,
      reminder: null
    });
  }
}

export const tools: ToolSpec[] = [{
  name: 'create_reminder',
  description: 'Create a reminder for the user. Use this tool when the user explicitly asks to be reminded about something. ' +
    'Examples: "remind me to call John tomorrow at 9am", "set a reminder for Monday to take sample to Carpet Shop", ' +
    '"create a reminder in 30 minutes to check the oven". ' +
    'IMPORTANT: Use this tool instead of just saying you\'ll create a reminder - actually call this tool.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'What to remind the user about (e.g., "Call John", "Take sample to Carpet Shop")',
      },
      scheduled_at: {
        type: 'string',
        description: 'The date/time for the reminder in ISO 8601 UTC format (e.g., "2026-01-19T14:00:00Z" for 9am local). ' +
          getTimezoneInstruction(),
      },
      delay_minutes: {
        type: 'number',
        description: 'Alternative to scheduled_at: remind in X minutes from now (e.g., 30 for "in 30 minutes")',
      },
    },
    required: ['title'],
  },
  handler: handleCreateReminder as ToolHandler,
}];
