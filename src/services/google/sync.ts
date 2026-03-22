import { pool } from '../../db/pool.js';
import { listSyncEnabledAccounts, markFullSyncComplete, ensureValidToken } from './auth.js';
import { syncCalendarList, listSyncEnabledCalendars, getDefaultPushCalendar } from './calendars.js';
import { pullEvents, pushEventToGoogle, getEventByCommitmentId, updateEventInGoogle } from './events.js';

export interface FullSyncResult {
  accountId: string;
  calendars: number;
  events: {
    pulled: number;
    updated: number;
    deleted: number;
  };
  commitmentsPushed: number;
  errors: string[];
}

export interface SyncHistoryEntry {
  id: string;
  google_account_id: string;
  google_calendar_id: string | null;
  sync_type: 'full' | 'incremental' | 'push' | 'pull';
  status: 'started' | 'completed' | 'failed';
  events_pulled: number;
  events_pushed: number;
  events_updated: number;
  events_deleted: number;
  conflicts_found: number;
  conflicts_resolved: number;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  started_at: Date;
  completed_at: Date | null;
}

/**
 * Start a sync history entry
 */
async function startSyncHistory(
  accountId: string,
  calendarId: string | null,
  syncType: 'full' | 'incremental' | 'push' | 'pull'
): Promise<string> {
  const result = await pool.query(`
    INSERT INTO google_sync_history (
      google_account_id, google_calendar_id, sync_type, status
    ) VALUES ($1, $2, $3, 'started')
    RETURNING id
  `, [accountId, calendarId, syncType]);
  return result.rows[0].id;
}

/**
 * Complete a sync history entry
 */
async function completeSyncHistory(
  historyId: string,
  results: {
    events_pulled?: number;
    events_pushed?: number;
    events_updated?: number;
    events_deleted?: number;
    conflicts_found?: number;
    conflicts_resolved?: number;
  }
): Promise<void> {
  await pool.query(`
    UPDATE google_sync_history SET
      status = 'completed',
      events_pulled = $1,
      events_pushed = $2,
      events_updated = $3,
      events_deleted = $4,
      conflicts_found = $5,
      conflicts_resolved = $6,
      completed_at = NOW()
    WHERE id = $7
  `, [
    results.events_pulled || 0,
    results.events_pushed || 0,
    results.events_updated || 0,
    results.events_deleted || 0,
    results.conflicts_found || 0,
    results.conflicts_resolved || 0,
    historyId,
  ]);
}

/**
 * Fail a sync history entry
 */
async function failSyncHistory(
  historyId: string,
  error: Error,
  details?: Record<string, unknown>
): Promise<void> {
  await pool.query(`
    UPDATE google_sync_history SET
      status = 'failed',
      error_message = $1,
      error_details = $2,
      completed_at = NOW()
    WHERE id = $3
  `, [error.message, details ? JSON.stringify(details) : null, historyId]);
}

/**
 * Perform a full sync for an account
 * - Syncs calendar list
 * - Pulls events from all sync-enabled calendars
 * - Pushes pending commitments
 */
export async function fullSync(accountId: string): Promise<FullSyncResult> {
  const historyId = await startSyncHistory(accountId, null, 'full');
  const result: FullSyncResult = {
    accountId,
    calendars: 0,
    events: { pulled: 0, updated: 0, deleted: 0 },
    commitmentsPushed: 0,
    errors: [],
  };

  try {
    // Ensure valid token
    await ensureValidToken(accountId);

    // Sync calendar list
    const calendars = await syncCalendarList(accountId);
    result.calendars = calendars.length;

    // Get sync-enabled calendars
    const syncCalendars = await listSyncEnabledCalendars(accountId);

    // Pull events from each calendar
    for (const calendar of syncCalendars) {
      try {
        const syncResult = await pullEvents(calendar, { fullSync: true });
        result.events.pulled += syncResult.pulled;
        result.events.updated += syncResult.updated;
        result.events.deleted += syncResult.deleted;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Failed to pull from ${calendar.summary}: ${msg}`);
      }
    }

    // Push pending commitments
    const pushed = await pushPendingCommitments(accountId);
    result.commitmentsPushed = pushed;

    // Mark full sync complete
    await markFullSyncComplete(accountId);

    await completeSyncHistory(historyId, {
      events_pulled: result.events.pulled,
      events_updated: result.events.updated,
      events_deleted: result.events.deleted,
      events_pushed: result.commitmentsPushed,
    });

    return result;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    await failSyncHistory(historyId, error, { result });
    throw err;
  }
}

/**
 * Perform an incremental sync for an account
 * Uses sync tokens for efficient delta updates
 */
export async function incrementalSync(accountId: string): Promise<FullSyncResult> {
  const historyId = await startSyncHistory(accountId, null, 'incremental');
  const result: FullSyncResult = {
    accountId,
    calendars: 0,
    events: { pulled: 0, updated: 0, deleted: 0 },
    commitmentsPushed: 0,
    errors: [],
  };

  try {
    // Ensure valid token
    await ensureValidToken(accountId);

    // Sync calendar list (incremental)
    const calendars = await syncCalendarList(accountId);
    result.calendars = calendars.length;

    // Get sync-enabled calendars
    const syncCalendars = await listSyncEnabledCalendars(accountId);

    // Pull events from each calendar (incremental)
    for (const calendar of syncCalendars) {
      if (calendar.sync_direction === 'write_only') continue;

      try {
        const syncResult = await pullEvents(calendar);
        result.events.pulled += syncResult.pulled;
        result.events.updated += syncResult.updated;
        result.events.deleted += syncResult.deleted;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Failed to pull from ${calendar.summary}: ${msg}`);
      }
    }

    // Push pending commitments
    const pushed = await pushPendingCommitments(accountId);
    result.commitmentsPushed = pushed;

    await completeSyncHistory(historyId, {
      events_pulled: result.events.pulled,
      events_updated: result.events.updated,
      events_deleted: result.events.deleted,
      events_pushed: result.commitmentsPushed,
    });

    return result;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    await failSyncHistory(historyId, error, { result });
    throw err;
  }
}

/**
 * Push pending commitments to Google Calendar
 */
async function pushPendingCommitments(accountId: string): Promise<number> {
  // Get default push calendar
  const calendar = await getDefaultPushCalendar(accountId);
  if (!calendar) {
    return 0; // No calendar to push to
  }

  if (calendar.sync_direction === 'read_only') {
    return 0; // Calendar is read-only
  }

  // Find commitments that need to be pushed
  // pending_push status OR have google_account_id set but no google_event_id
  const pendingResult = await pool.query(`
    SELECT * FROM commitments
    WHERE google_account_id = $1
      AND google_sync_status = 'pending_push'
      AND due_at IS NOT NULL
      AND status IN ('open', 'in_progress')
  `, [accountId]);

  let pushed = 0;

  for (const commitment of pendingResult.rows) {
    try {
      // Check if already synced
      const existingEvent = await getEventByCommitmentId(commitment.id);

      if (existingEvent) {
        // Update existing event
        await updateEventInGoogle(calendar, existingEvent.event_id, {
          title: commitment.title,
          description: commitment.description,
          due_at: commitment.due_at,
          duration_minutes: commitment.duration_minutes,
          all_day: commitment.all_day,
          timezone: commitment.timezone,
        });
      } else {
        // Create new event
        const result = await pushEventToGoogle(calendar, {
          id: commitment.id,
          title: commitment.title,
          description: commitment.description,
          due_at: commitment.due_at,
          duration_minutes: commitment.duration_minutes,
          all_day: commitment.all_day,
          timezone: commitment.timezone,
        });

        // Update commitment with Google info
        await pool.query(`
          UPDATE commitments SET
            google_calendar_id = $1,
            google_event_id = $2,
            google_sync_status = 'synced',
            last_synced_at = NOW(),
            updated_at = NOW()
          WHERE id = $3
        `, [calendar.calendar_id, result.event_id, commitment.id]);
      }

      // Mark as synced
      await pool.query(`
        UPDATE commitments SET
          google_sync_status = 'synced',
          last_synced_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `, [commitment.id]);

      pushed++;
    } catch (err) {
      console.error(`Failed to push commitment ${commitment.id}:`, err);
      // Mark as failed but don't stop
      await pool.query(`
        UPDATE commitments SET
          google_sync_status = 'local_only',
          updated_at = NOW()
        WHERE id = $1
      `, [commitment.id]);
    }
  }

  return pushed;
}

/**
 * Sync all enabled accounts (for background worker)
 */
export async function syncAllAccounts(): Promise<Map<string, FullSyncResult>> {
  const accounts = await listSyncEnabledAccounts();
  const results = new Map<string, FullSyncResult>();

  for (const account of accounts) {
    try {
      // Use incremental sync for regular updates
      const result = await incrementalSync(account.id);
      results.set(account.id, result);
    } catch (err) {
      console.error(`Failed to sync account ${account.email}:`, err);
      results.set(account.id, {
        accountId: account.id,
        calendars: 0,
        events: { pulled: 0, updated: 0, deleted: 0 },
        commitmentsPushed: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  return results;
}

/**
 * Get sync history for an account
 */
export async function getSyncHistory(
  accountId: string,
  limit = 20
): Promise<SyncHistoryEntry[]> {
  const result = await pool.query(`
    SELECT * FROM google_sync_history
    WHERE google_account_id = $1
    ORDER BY started_at DESC
    LIMIT $2
  `, [accountId, limit]);
  return result.rows as SyncHistoryEntry[];
}

/**
 * Get last successful sync time for an account
 */
export async function getLastSuccessfulSync(accountId: string): Promise<Date | null> {
  const result = await pool.query(`
    SELECT completed_at FROM google_sync_history
    WHERE google_account_id = $1
      AND status = 'completed'
    ORDER BY completed_at DESC
    LIMIT 1
  `, [accountId]);
  return result.rows[0]?.completed_at || null;
}

