import { google, calendar_v3 } from 'googleapis';
import { pool } from '../../db/pool.js';
import { getAuthenticatedClient } from './auth.js';
import { GoogleCalendar, updateEventsSyncToken } from './calendars.js';
import { config } from '../../config/index.js';

export interface GoogleEvent {
  id: string;
  google_calendar_id: string;
  event_id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  html_link: string | null;
  start_time: Date | null;
  end_time: Date | null;
  all_day: boolean;
  timezone: string | null;
  rrule: string | null;
  recurring_event_id: string | null;
  original_start_time: Date | null;
  status: 'confirmed' | 'tentative' | 'cancelled';
  visibility: 'default' | 'public' | 'private' | 'confidential';
  etag: string | null;
  organizer_email: string | null;
  attendee_count: number;
  user_response_status: string | null;
  commitment_id: string | null;
  raw: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface SyncResult {
  pulled: number;
  updated: number;
  deleted: number;
  nextSyncToken: string | null;
}

export interface PushResult {
  created: boolean;
  event_id: string;
  etag: string;
}

/**
 * Pull events from Google Calendar and cache locally
 */
export async function pullEvents(
  calendar: GoogleCalendar,
  options: {
    timeMin?: Date;
    timeMax?: Date;
    fullSync?: boolean;
  } = {}
): Promise<SyncResult> {
  const authClient = await getAuthenticatedClient(calendar.google_account_id);
  const calendarApi = google.calendar({ version: 'v3', auth: authClient });

  const syncToken = options.fullSync ? null : calendar.events_sync_token;
  let events: calendar_v3.Schema$Event[] = [];
  let nextPageToken: string | undefined;
  let nextSyncToken: string | null = null;

  try {
    if (syncToken) {
      // Incremental sync
      const response = await calendarApi.events.list({
        calendarId: calendar.calendar_id,
        syncToken: syncToken,
      });
      events = response.data.items || [];
      nextSyncToken = response.data.nextSyncToken || null;
    } else {
      // Full sync - paginate through events
      const timeMin = options.timeMin || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const timeMax = options.timeMax || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year ahead

      do {
        const response = await calendarApi.events.list({
          calendarId: calendar.calendar_id,
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: false, // Get recurring event templates
          showDeleted: true,
          pageToken: nextPageToken,
          maxResults: 250,
        });
        events.push(...(response.data.items || []));
        nextPageToken = response.data.nextPageToken || undefined;
        nextSyncToken = response.data.nextSyncToken || null;
      } while (nextPageToken);
    }
  } catch (err: unknown) {
    // If sync token is invalid (410 Gone), do full sync
    if (err instanceof Error && 'code' in err && (err as { code: number }).code === 410) {
      await updateEventsSyncToken(calendar.id, null);
      return pullEvents(calendar, { ...options, fullSync: true });
    }
    throw err;
  }

  let pulled = 0;
  let updated = 0;
  let deleted = 0;

  for (const event of events) {
    if (!event.id) continue;

    // Handle deleted events
    if (event.status === 'cancelled') {
      const result = await pool.query(`
        DELETE FROM google_events
        WHERE google_calendar_id = $1 AND event_id = $2
      `, [calendar.id, event.id]);
      if ((result.rowCount ?? 0) > 0) deleted++;
      continue;
    }

    // Parse timing
    const startTime = event.start?.dateTime
      ? new Date(event.start.dateTime)
      : event.start?.date
        ? new Date(event.start.date)
        : null;

    const endTime = event.end?.dateTime
      ? new Date(event.end.dateTime)
      : event.end?.date
        ? new Date(event.end.date)
        : null;

    const allDay = !!(event.start?.date && !event.start?.dateTime);
    const timezone = event.start?.timeZone || null;

    // Extract recurrence rule
    const rrule = event.recurrence?.find(r => r.startsWith('RRULE:'))?.replace('RRULE:', '') || null;

    // Get organizer and attendee info
    const organizerEmail = event.organizer?.email || null;
    const attendeeCount = event.attendees?.length || 0;
    const userResponse = event.attendees?.find(a => a.self)?.responseStatus || null;

    // Check if exists
    const existing = await pool.query(`
      SELECT id FROM google_events
      WHERE google_calendar_id = $1 AND event_id = $2
    `, [calendar.id, event.id]);

    if (existing.rows.length > 0) {
      // Update
      await pool.query(`
        UPDATE google_events SET
          summary = $1,
          description = $2,
          location = $3,
          html_link = $4,
          start_time = $5,
          end_time = $6,
          all_day = $7,
          timezone = $8,
          rrule = $9,
          recurring_event_id = $10,
          original_start_time = $11,
          status = $12,
          visibility = $13,
          etag = $14,
          organizer_email = $15,
          attendee_count = $16,
          user_response_status = $17,
          raw = $18,
          updated_at = NOW()
        WHERE google_calendar_id = $19 AND event_id = $20
      `, [
        event.summary || null,
        event.description || null,
        event.location || null,
        event.htmlLink || null,
        startTime,
        endTime,
        allDay,
        timezone,
        rrule,
        event.recurringEventId || null,
        event.originalStartTime?.dateTime ? new Date(event.originalStartTime.dateTime) : null,
        event.status || 'confirmed',
        event.visibility || 'default',
        event.etag || null,
        organizerEmail,
        attendeeCount,
        userResponse,
        JSON.stringify(event),
        calendar.id,
        event.id,
      ]);
      updated++;
    } else {
      // Insert
      await pool.query(`
        INSERT INTO google_events (
          google_calendar_id, event_id, summary, description, location,
          html_link, start_time, end_time, all_day, timezone,
          rrule, recurring_event_id, original_start_time,
          status, visibility, etag, organizer_email, attendee_count,
          user_response_status, raw
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      `, [
        calendar.id,
        event.id,
        event.summary || null,
        event.description || null,
        event.location || null,
        event.htmlLink || null,
        startTime,
        endTime,
        allDay,
        timezone,
        rrule,
        event.recurringEventId || null,
        event.originalStartTime?.dateTime ? new Date(event.originalStartTime.dateTime) : null,
        event.status || 'confirmed',
        event.visibility || 'default',
        event.etag || null,
        organizerEmail,
        attendeeCount,
        userResponse,
        JSON.stringify(event),
      ]);
      pulled++;
    }
  }

  // Update sync token
  if (nextSyncToken) {
    await updateEventsSyncToken(calendar.id, nextSyncToken);
  }

  return { pulled, updated, deleted, nextSyncToken };
}

/**
 * Push an event to Google Calendar
 * Can optionally link to a Squire commitment via commitment_id
 */
export async function pushEventToGoogle(
  calendar: GoogleCalendar,
  event: {
    id?: string; // Optional commitment ID to link to
    title: string;
    description?: string;
    due_at: Date;
    duration_minutes?: number;
    all_day?: boolean;
    timezone?: string;
  }
): Promise<PushResult> {
  const authClient = await getAuthenticatedClient(calendar.google_account_id);
  const calendarApi = google.calendar({ version: 'v3', auth: authClient });

  const duration = event.duration_minutes || 60; // Default 1 hour
  const endTime = new Date(event.due_at.getTime() + duration * 60 * 1000);

  const eventResource: calendar_v3.Schema$Event = {
    summary: event.title,
    description: event.description,
  };

  if (event.all_day) {
    // All-day event uses date format
    eventResource.start = {
      date: event.due_at.toISOString().split('T')[0],
      timeZone: event.timezone || config.timezone,
    };
    eventResource.end = {
      date: endTime.toISOString().split('T')[0],
      timeZone: event.timezone || config.timezone,
    };
  } else {
    // Timed event uses dateTime
    eventResource.start = {
      dateTime: event.due_at.toISOString(),
      timeZone: event.timezone || config.timezone,
    };
    eventResource.end = {
      dateTime: endTime.toISOString(),
      timeZone: event.timezone || config.timezone,
    };
  }

  const response = await calendarApi.events.insert({
    calendarId: calendar.calendar_id,
    requestBody: eventResource,
  });

  if (!response.data.id || !response.data.etag) {
    throw new Error('Failed to create event in Google Calendar');
  }

  // Cache the event locally
  await pool.query(`
    INSERT INTO google_events (
      google_calendar_id, event_id, summary, description,
      start_time, end_time, all_day, timezone, status, etag,
      commitment_id, raw
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (google_calendar_id, event_id) DO UPDATE SET
      summary = EXCLUDED.summary,
      description = EXCLUDED.description,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      all_day = EXCLUDED.all_day,
      etag = EXCLUDED.etag,
      commitment_id = EXCLUDED.commitment_id,
      raw = EXCLUDED.raw,
      updated_at = NOW()
  `, [
    calendar.id,
    response.data.id,
    event.title,
    event.description || null,
    event.due_at,
    endTime,
    event.all_day || false,
    event.timezone || config.timezone,
    'confirmed',
    response.data.etag,
    event.id || null,  // commitment_id is optional
    JSON.stringify(response.data),
  ]);

  return {
    created: true,
    event_id: response.data.id,
    etag: response.data.etag,
  };
}

/**
 * Update an existing Google Calendar event
 */
export async function updateEventInGoogle(
  calendar: GoogleCalendar,
  eventId: string,
  updates: {
    title?: string;
    description?: string;
    due_at?: Date;
    duration_minutes?: number;
    all_day?: boolean;
    timezone?: string;
  }
): Promise<{ etag: string }> {
  const authClient = await getAuthenticatedClient(calendar.google_account_id);
  const calendarApi = google.calendar({ version: 'v3', auth: authClient });

  // Get existing event first
  const existing = await calendarApi.events.get({
    calendarId: calendar.calendar_id,
    eventId: eventId,
  });

  const eventResource = { ...existing.data };

  if (updates.title !== undefined) {
    eventResource.summary = updates.title;
  }
  if (updates.description !== undefined) {
    eventResource.description = updates.description;
  }
  if (updates.due_at !== undefined) {
    const duration = updates.duration_minutes || 60;
    const endTime = new Date(updates.due_at.getTime() + duration * 60 * 1000);

    if (updates.all_day) {
      eventResource.start = {
        date: updates.due_at.toISOString().split('T')[0],
        timeZone: updates.timezone || config.timezone,
      };
      eventResource.end = {
        date: endTime.toISOString().split('T')[0],
        timeZone: updates.timezone || config.timezone,
      };
    } else {
      eventResource.start = {
        dateTime: updates.due_at.toISOString(),
        timeZone: updates.timezone || config.timezone,
      };
      eventResource.end = {
        dateTime: endTime.toISOString(),
        timeZone: updates.timezone || config.timezone,
      };
    }
  }

  const response = await calendarApi.events.update({
    calendarId: calendar.calendar_id,
    eventId: eventId,
    requestBody: eventResource,
  });

  // Update local cache
  await pool.query(`
    UPDATE google_events SET
      summary = $1,
      description = $2,
      start_time = $3,
      end_time = $4,
      all_day = $5,
      etag = $6,
      raw = $7,
      updated_at = NOW()
    WHERE google_calendar_id = $8 AND event_id = $9
  `, [
    eventResource.summary,
    eventResource.description,
    eventResource.start?.dateTime ? new Date(eventResource.start.dateTime) : null,
    eventResource.end?.dateTime ? new Date(eventResource.end.dateTime) : null,
    !!(eventResource.start?.date),
    response.data.etag,
    JSON.stringify(response.data),
    calendar.id,
    eventId,
  ]);

  return { etag: response.data.etag || '' };
}

/**
 * Get all events across all calendars within a time range
 */
export async function getAllEvents(options: {
  timeMin?: Date;
  timeMax?: Date;
  accountId?: string;
}): Promise<GoogleEvent[]> {
  const conditions = [`status != 'cancelled'`];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (options.timeMin) {
    conditions.push(`ge.end_time >= $${paramIndex++}`);
    values.push(options.timeMin);
  }

  if (options.timeMax) {
    conditions.push(`ge.start_time <= $${paramIndex++}`);
    values.push(options.timeMax);
  }

  if (options.accountId) {
    conditions.push(`gc.google_account_id = $${paramIndex++}`);
    values.push(options.accountId);
  }

  const result = await pool.query(`
    SELECT ge.*, gc.summary as calendar_name, gc.background_color
    FROM google_events ge
    JOIN google_calendars gc ON ge.google_calendar_id = gc.id
    WHERE ${conditions.join(' AND ')} AND gc.sync_enabled = TRUE
    ORDER BY ge.start_time ASC
  `, values);

  return result.rows as GoogleEvent[];
}

/**
 * Get an event by commitment ID
 */
export async function getEventByCommitmentId(commitmentId: string): Promise<GoogleEvent | null> {
  const result = await pool.query(
    'SELECT * FROM google_events WHERE commitment_id = $1',
    [commitmentId]
  );
  return result.rows[0] as GoogleEvent || null;
}

