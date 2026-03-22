import { Router, Request, Response } from 'express';
import { listCommitmentsExpanded, ExpandedCommitment, updateCommitment, getCommitment } from '../../services/commitments.js';
import { getAllEvents, updateEventInGoogle, GoogleEvent } from '../../services/google/events.js';
import { listSyncEnabledAccounts } from '../../services/google/auth.js';
import { getCalendar } from '../../services/google/calendars.js';
import { syncAllAccounts } from '../../services/google/sync.js';
import { pool } from '../../db/pool.js';

const router = Router();

/**
 * Adjust all-day event times to noon UTC to prevent timezone date-shifting.
 * All-day events are stored as midnight UTC, which can display as the previous
 * day in western timezones. Setting to noon UTC keeps the date stable.
 */
function adjustAllDayTime(time: Date | null, allDay: boolean): Date | null {
  if (!time || !allDay) return time;
  const adjusted = new Date(time);
  adjusted.setUTCHours(12, 0, 0, 0);
  return adjusted;
}

export interface CalendarEvent {
  id: string;
  source: 'squire' | 'google';
  title: string;
  description: string | null;
  start: Date;
  end: Date | null;
  allDay: boolean;
  timezone: string | null;
  status: string;
  color: string | null;
  // Source-specific data
  commitmentId?: string;
  googleEventId?: string;
  googleCalendarName?: string;
  location?: string | null;
  htmlLink?: string | null;
  // Recurrence data
  isRecurring?: boolean;
  isOccurrence?: boolean;
  occurrenceIndex?: number;
  rrule?: string | null;
}

/**
 * GET /api/calendar/events
 * Get merged calendar events (Squire commitments + Google events)
 */
router.get('/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const start = req.query.start
      ? new Date(req.query.start as string)
      : new Date();
    const end = req.query.end
      ? new Date(req.query.end as string)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default

    const events: CalendarEvent[] = [];

    // Get Squire commitments with recurring ones expanded
    const commitments = await listCommitmentsExpanded({
      due_after: start,
      due_before: end,
      include_resolved: false,
      expand_recurring: true,
      max_occurrences: 100,
      limit: 500,
    });

    for (const commitment of commitments) {
      if (!commitment.due_at) continue;

      events.push(commitmentToCalendarEvent(commitment));
    }

    // Get Google events
    try {
      const accounts = await listSyncEnabledAccounts();
      if (accounts.length > 0) {
        const googleEvents = await getAllEvents({
          timeMin: start,
          timeMax: end,
        });

        for (const event of googleEvents) {
          if (!event.start_time) continue;

          events.push({
            id: `google-${event.id}`,
            source: 'google',
            title: event.summary || '(No title)',
            description: event.description || null,
            start: adjustAllDayTime(event.start_time, event.all_day) || event.start_time,
            end: adjustAllDayTime(event.end_time, event.all_day),
            allDay: event.all_day,
            timezone: event.timezone || null,
            status: event.status,
            color: (event as unknown as { background_color?: string }).background_color || '#4285f4',
            googleEventId: event.event_id,
            googleCalendarName: (event as unknown as { calendar_name?: string }).calendar_name,
            location: event.location,
            htmlLink: event.html_link,
            // Link to commitment if synced
            commitmentId: event.commitment_id || undefined,
          });
        }
      }
    } catch (err) {
      console.error('Failed to get Google events:', err);
      // Continue without Google events
    }

    // Sort by start time
    events.sort((a, b) => a.start.getTime() - b.start.getTime());

    res.json({
      events,
      count: events.length,
      range: { start, end },
    });
  } catch (error) {
    console.error('Error getting calendar events:', error);
    res.status(500).json({ error: 'Failed to get calendar events' });
  }
});

/**
 * GET /api/calendar/week
 * Get events for current week (or specified week)
 */
router.get('/week', async (req: Request, res: Response): Promise<void> => {
  try {
    const dateParam = req.query.date as string | undefined;
    const baseDate = dateParam ? new Date(dateParam) : new Date();

    // Get start of week (Sunday)
    const start = new Date(baseDate);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);

    // Get end of week (Saturday)
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    // Reuse events endpoint logic
    const eventsRes = await getEventsInRange(start, end);

    // Group by day
    const days: Record<string, CalendarEvent[]> = {};
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      const key = day.toISOString().split('T')[0] as string;
      days[key] = [];
    }

    for (const event of eventsRes) {
      const key = event.start.toISOString().split('T')[0] as string;
      if (days[key]) {
        days[key].push(event);
      }
    }

    res.json({
      week: {
        start: start.toISOString().split('T')[0],
        end: new Date(end.getTime() - 1).toISOString().split('T')[0],
      },
      days,
      totalEvents: eventsRes.length,
    });
  } catch (error) {
    console.error('Error getting week view:', error);
    res.status(500).json({ error: 'Failed to get week view' });
  }
});

/**
 * GET /api/calendar/month
 * Get events for current month (or specified month)
 */
router.get('/month', async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

    // Get start of month
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);

    // Get end of month
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    // Get events
    const events = await getEventsInRange(start, end);

    // Group by day
    const days: Record<string, CalendarEvent[]> = {};
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let i = 1; i <= daysInMonth; i++) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days[key] = [];
    }

    for (const event of events) {
      const key = event.start.toISOString().split('T')[0] as string;
      if (days[key]) {
        days[key].push(event);
      }
    }

    res.json({
      month: {
        year,
        month,
        name: start.toLocaleString('default', { month: 'long' }),
      },
      days,
      totalEvents: events.length,
    });
  } catch (error) {
    console.error('Error getting month view:', error);
    res.status(500).json({ error: 'Failed to get month view' });
  }
});

/**
 * GET /api/calendar/today
 * Get events for today
 */
router.get('/today', async (_req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);

    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    const events = await getEventsInRange(start, end);

    res.json({
      date: today.toISOString().split('T')[0],
      events,
      count: events.length,
    });
  } catch (error) {
    console.error('Error getting today view:', error);
    res.status(500).json({ error: 'Failed to get today view' });
  }
});

/**
 * GET /api/calendar/upcoming
 * Get upcoming events (next 7 days)
 */
router.get('/upcoming', async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const limit = parseInt(req.query.limit as string) || 20;

    const start = new Date();
    const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const events = await getEventsInRange(start, end);

    res.json({
      events: events.slice(0, limit),
      count: Math.min(events.length, limit),
      total: events.length,
      range: { start, end },
    });
  } catch (error) {
    console.error('Error getting upcoming events:', error);
    res.status(500).json({ error: 'Failed to get upcoming events' });
  }
});

/**
 * POST /api/calendar/sync-now
 * Trigger an immediate incremental sync for all accounts
 */
router.post('/sync-now', async (_req: Request, res: Response): Promise<void> => {
  try {
    const accounts = await listSyncEnabledAccounts();
    if (accounts.length === 0) {
      res.json({ synced: false, message: 'No sync-enabled accounts' });
      return;
    }

    const results = await syncAllAccounts();
    const summary = {
      synced: true,
      accounts: accounts.length,
      totalPulled: 0,
      totalUpdated: 0,
      totalDeleted: 0,
    };

    for (const result of results.values()) {
      summary.totalPulled += result.events.pulled;
      summary.totalUpdated += result.events.updated;
      summary.totalDeleted += result.events.deleted;
    }

    res.json(summary);
  } catch (error) {
    console.error('Error triggering sync:', error);
    res.status(500).json({ error: 'Failed to sync' });
  }
});

/**
 * PATCH /api/calendar/events/:id
 * Update a calendar event (handles both Squire commitments and Google events)
 * ID format: "google-{dbId}" or "squire-{commitmentId}"
 */
router.patch('/events/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const fullId = req.params.id as string;
    const { title, description, startDate, startTime, endTime, allDay } = req.body;

    if (!fullId) {
      res.status(400).json({ error: 'Event ID is required' });
      return;
    }

    if (fullId.startsWith('squire-')) {
      // --- Squire commitment update ---
      const commitmentId = fullId.replace('squire-', '');
      const existing = await getCommitment(commitmentId);
      if (!existing) {
        res.status(404).json({ error: 'Commitment not found' });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (allDay !== undefined) updates.all_day = allDay;

      if (startDate !== undefined) {
        if (allDay) {
          updates.due_at = new Date(startDate + 'T00:00:00');
        } else if (startTime) {
          updates.due_at = new Date(startDate + 'T' + startTime);
        }
      }

      if (startTime !== undefined && startDate) {
        updates.due_at = new Date(startDate + 'T' + startTime);
      }

      if (endTime && startTime && startDate) {
        const start = new Date(startDate + 'T' + startTime);
        const end = new Date(startDate + 'T' + endTime);
        const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
        if (durationMinutes > 0) {
          updates.duration_minutes = durationMinutes;
        }
      }

      const updated = await updateCommitment(commitmentId, updates);
      if (!updated) {
        res.status(404).json({ error: 'Commitment not found' });
        return;
      }

      res.json({ success: true, source: 'squire', id: commitmentId });

    } else if (fullId.startsWith('google-')) {
      // --- Google event update ---
      const dbId = fullId.replace('google-', '');

      // Look up event in our cache
      const eventResult = await pool.query(
        'SELECT * FROM google_events WHERE id = $1',
        [dbId]
      );
      const event = eventResult.rows[0] as GoogleEvent | undefined;
      if (!event) {
        res.status(404).json({ error: 'Google event not found' });
        return;
      }

      // Get the calendar
      const calendar = await getCalendar(event.google_calendar_id);
      if (!calendar) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
      }

      // Check sync direction
      if (calendar.sync_direction === 'read_only') {
        res.status(403).json({ error: 'This calendar is read-only. Change sync direction in settings to enable editing.' });
        return;
      }

      // Build update payload
      const updates: {
        title?: string;
        description?: string;
        due_at?: Date;
        duration_minutes?: number;
        all_day?: boolean;
        timezone?: string;
      } = {};

      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (allDay !== undefined) updates.all_day = allDay;

      if (startDate !== undefined) {
        if (allDay) {
          updates.due_at = new Date(startDate + 'T00:00:00');
        } else if (startTime) {
          updates.due_at = new Date(startDate + 'T' + startTime);
        }
      }

      if (endTime && startTime && startDate) {
        const start = new Date(startDate + 'T' + startTime);
        const end = new Date(startDate + 'T' + endTime);
        const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
        if (durationMinutes > 0) {
          updates.duration_minutes = durationMinutes;
        }
      }

      // Push update to Google Calendar
      await updateEventInGoogle(calendar, event.event_id, updates);

      res.json({ success: true, source: 'google', id: dbId, eventId: event.event_id });

    } else {
      res.status(400).json({ error: 'Invalid event ID format. Expected "google-{id}" or "squire-{id}"' });
    }
  } catch (error) {
    console.error('Error updating calendar event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Helper function to convert a commitment to a CalendarEvent
function commitmentToCalendarEvent(commitment: ExpandedCommitment): CalendarEvent {
  const duration = commitment.duration_minutes || 60;
  const endTime = commitment.due_at
    ? new Date(commitment.due_at.getTime() + duration * 60 * 1000)
    : null;

  return {
    id: `squire-${commitment.id}`,
    source: 'squire',
    title: commitment.title,
    description: commitment.description || null,
    start: commitment.due_at!,
    end: endTime,
    allDay: commitment.all_day || false,
    timezone: commitment.timezone || null,
    status: commitment.status,
    color: getStatusColor(commitment.status),
    commitmentId: commitment.recurring_commitment_id,
    // Recurrence data
    isRecurring: !!commitment.rrule,
    isOccurrence: commitment.is_occurrence,
    occurrenceIndex: commitment.occurrence_index,
    rrule: commitment.rrule,
  };
}

// Helper function to get events in a range
async function getEventsInRange(start: Date, end: Date): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];

  // Get Squire commitments with recurring ones expanded
  const commitments = await listCommitmentsExpanded({
    due_after: start,
    due_before: end,
    include_resolved: false,
    expand_recurring: true,
    max_occurrences: 100,
    limit: 500,
  });

  for (const commitment of commitments) {
    if (!commitment.due_at) continue;

    events.push(commitmentToCalendarEvent(commitment));
  }

  // Get Google events
  try {
    const accounts = await listSyncEnabledAccounts();
    if (accounts.length > 0) {
      const googleEvents = await getAllEvents({
        timeMin: start,
        timeMax: end,
      });

      for (const event of googleEvents) {
        if (!event.start_time) continue;

        events.push({
          id: `google-${event.id}`,
          source: 'google',
          title: event.summary || '(No title)',
          description: event.description || null,
          start: adjustAllDayTime(event.start_time, event.all_day) || event.start_time,
          end: adjustAllDayTime(event.end_time, event.all_day),
          allDay: event.all_day,
          timezone: event.timezone || null,
          status: event.status,
          color: (event as unknown as { background_color?: string }).background_color || '#4285f4',
          googleEventId: event.event_id,
          googleCalendarName: (event as unknown as { calendar_name?: string }).calendar_name,
          location: event.location,
          htmlLink: event.html_link,
          commitmentId: event.commitment_id || undefined,
        });
      }
    }
  } catch (err) {
    console.error('Failed to get Google events:', err);
  }

  // Sort by start time
  events.sort((a, b) => a.start.getTime() - b.start.getTime());

  return events;
}

// Helper function to get color for commitment status
function getStatusColor(status: string): string {
  switch (status) {
    case 'open':
      return '#3b82f6'; // Blue
    case 'in_progress':
      return '#f59e0b'; // Amber
    case 'completed':
      return '#10b981'; // Green
    case 'canceled':
      return '#6b7280'; // Gray
    case 'snoozed':
      return '#8b5cf6'; // Purple
    default:
      return '#3b82f6';
  }
}

export default router;
