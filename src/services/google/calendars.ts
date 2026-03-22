import { google, calendar_v3 } from 'googleapis';
import { pool } from '../../db/pool.js';
import { getAuthenticatedClient, updateCalendarsSyncToken } from './auth.js';

export interface GoogleCalendar {
  id: string;
  google_account_id: string;
  calendar_id: string;
  summary: string | null;
  description: string | null;
  color_id: string | null;
  background_color: string | null;
  foreground_color: string | null;
  timezone: string | null;
  access_role: string | null;
  sync_enabled: boolean;
  sync_direction: 'read_only' | 'write_only' | 'bidirectional';
  events_sync_token: string | null;
  last_synced_at: Date | null;
  is_default_for_push: boolean;
  is_primary: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CalendarSyncSettings {
  sync_enabled?: boolean;
  sync_direction?: 'read_only' | 'write_only' | 'bidirectional';
  is_default_for_push?: boolean;
}

/**
 * Fetch calendar list from Google and sync to local database
 */
export async function syncCalendarList(accountId: string): Promise<GoogleCalendar[]> {
  const authClient = await getAuthenticatedClient(accountId);
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  // Get account for sync token
  const accountResult = await pool.query(
    'SELECT calendars_sync_token FROM google_accounts WHERE id = $1',
    [accountId]
  );
  const syncToken = accountResult.rows[0]?.calendars_sync_token;

  let calendars: calendar_v3.Schema$CalendarListEntry[] = [];
  let nextPageToken: string | undefined;
  let nextSyncToken: string | undefined;

  try {
    // Incremental sync if we have a token
    if (syncToken) {
      const response = await calendar.calendarList.list({
        syncToken: syncToken,
      });
      calendars = response.data.items || [];
      nextSyncToken = response.data.nextSyncToken || undefined;
    } else {
      // Full sync - paginate through all calendars
      do {
        const response = await calendar.calendarList.list({
          pageToken: nextPageToken,
          showHidden: true,
        });
        calendars.push(...(response.data.items || []));
        nextPageToken = response.data.nextPageToken || undefined;
        nextSyncToken = response.data.nextSyncToken || undefined;
      } while (nextPageToken);
    }
  } catch (err: unknown) {
    // If sync token is invalid, do full sync
    if (err instanceof Error && 'code' in err && (err as { code: number }).code === 410) {
      // Token expired, do full sync
      await updateCalendarsSyncToken(accountId, null);
      return syncCalendarList(accountId);
    }
    throw err;
  }

  // Upsert each calendar
  const synced: GoogleCalendar[] = [];
  for (const cal of calendars) {
    if (!cal.id) continue;

    // Check if calendar was deleted
    if (cal.deleted) {
      await pool.query(`
        DELETE FROM google_calendars
        WHERE google_account_id = $1 AND calendar_id = $2
      `, [accountId, cal.id]);
      continue;
    }

    const result = await pool.query(`
      INSERT INTO google_calendars (
        google_account_id,
        calendar_id,
        summary,
        description,
        color_id,
        background_color,
        foreground_color,
        timezone,
        access_role,
        is_primary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (google_account_id, calendar_id) DO UPDATE SET
        summary = EXCLUDED.summary,
        description = EXCLUDED.description,
        color_id = EXCLUDED.color_id,
        background_color = EXCLUDED.background_color,
        foreground_color = EXCLUDED.foreground_color,
        timezone = EXCLUDED.timezone,
        access_role = EXCLUDED.access_role,
        is_primary = EXCLUDED.is_primary,
        updated_at = NOW()
      RETURNING *
    `, [
      accountId,
      cal.id,
      cal.summary || null,
      cal.description || null,
      cal.colorId || null,
      cal.backgroundColor || null,
      cal.foregroundColor || null,
      cal.timeZone || null,
      cal.accessRole || null,
      cal.primary || false,
    ]);

    synced.push(result.rows[0] as GoogleCalendar);
  }

  // Update sync token
  if (nextSyncToken) {
    await updateCalendarsSyncToken(accountId, nextSyncToken);
  }

  return synced;
}

/**
 * Get all calendars for an account
 */
export async function listCalendars(accountId: string): Promise<GoogleCalendar[]> {
  const result = await pool.query(`
    SELECT * FROM google_calendars
    WHERE google_account_id = $1
    ORDER BY is_primary DESC, summary ASC
  `, [accountId]);
  return result.rows as GoogleCalendar[];
}

/**
 * Get sync-enabled calendars for an account
 */
export async function listSyncEnabledCalendars(accountId: string): Promise<GoogleCalendar[]> {
  const result = await pool.query(`
    SELECT * FROM google_calendars
    WHERE google_account_id = $1 AND sync_enabled = TRUE
    ORDER BY is_primary DESC, summary ASC
  `, [accountId]);
  return result.rows as GoogleCalendar[];
}

/**
 * Get a calendar by ID
 */
export async function getCalendar(calendarId: string): Promise<GoogleCalendar | null> {
  const result = await pool.query(
    'SELECT * FROM google_calendars WHERE id = $1',
    [calendarId]
  );
  return result.rows[0] as GoogleCalendar || null;
}

/**
 * Get the default calendar for pushing new Squire events
 */
export async function getDefaultPushCalendar(accountId: string): Promise<GoogleCalendar | null> {
  // First try explicit default
  let result = await pool.query(`
    SELECT * FROM google_calendars
    WHERE google_account_id = $1 AND is_default_for_push = TRUE
    LIMIT 1
  `, [accountId]);

  if (result.rows[0]) {
    return result.rows[0] as GoogleCalendar;
  }

  // Fall back to primary calendar
  result = await pool.query(`
    SELECT * FROM google_calendars
    WHERE google_account_id = $1 AND is_primary = TRUE
    LIMIT 1
  `, [accountId]);

  return result.rows[0] as GoogleCalendar || null;
}

/**
 * Update calendar sync settings
 */
export async function updateCalendarSettings(
  calendarId: string,
  settings: CalendarSyncSettings
): Promise<GoogleCalendar> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (settings.sync_enabled !== undefined) {
    updates.push(`sync_enabled = $${paramIndex++}`);
    values.push(settings.sync_enabled);
  }

  if (settings.sync_direction !== undefined) {
    updates.push(`sync_direction = $${paramIndex++}`);
    values.push(settings.sync_direction);
  }

  if (settings.is_default_for_push !== undefined) {
    // If setting as default, clear other defaults first
    if (settings.is_default_for_push) {
      const calendar = await getCalendar(calendarId);
      if (calendar) {
        await pool.query(`
          UPDATE google_calendars
          SET is_default_for_push = FALSE
          WHERE google_account_id = $1 AND id != $2
        `, [calendar.google_account_id, calendarId]);
      }
    }
    updates.push(`is_default_for_push = $${paramIndex++}`);
    values.push(settings.is_default_for_push);
  }

  if (updates.length === 0) {
    const calendar = await getCalendar(calendarId);
    if (!calendar) throw new Error(`Calendar not found: ${calendarId}`);
    return calendar;
  }

  updates.push(`updated_at = NOW()`);
  values.push(calendarId);

  const result = await pool.query(`
    UPDATE google_calendars
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `, values);

  if (result.rows.length === 0) {
    throw new Error(`Calendar not found: ${calendarId}`);
  }

  return result.rows[0] as GoogleCalendar;
}

/**
 * Update events sync token for a calendar
 */
export async function updateEventsSyncToken(
  calendarId: string,
  syncToken: string | null
): Promise<void> {
  await pool.query(`
    UPDATE google_calendars
    SET events_sync_token = $1,
        last_synced_at = NOW(),
        updated_at = NOW()
    WHERE id = $2
  `, [syncToken, calendarId]);
}

/**
 * Get calendar statistics for an account
 */
export async function getCalendarStats(accountId: string): Promise<{
  total: number;
  syncEnabled: number;
  lastSyncedAt: Date | null;
}> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE sync_enabled = TRUE) as sync_enabled,
      MAX(last_synced_at) as last_synced_at
    FROM google_calendars
    WHERE google_account_id = $1
  `, [accountId]);

  const row = result.rows[0];
  return {
    total: parseInt(row.total, 10),
    syncEnabled: parseInt(row.sync_enabled, 10),
    lastSyncedAt: row.last_synced_at,
  };
}
