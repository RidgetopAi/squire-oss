import { pool } from '../db/pool.js';
import { config } from '../config/index.js';

// Reminder status values (from schema constraints)
export type ReminderStatus = 'pending' | 'sent' | 'acknowledged' | 'snoozed' | 'canceled' | 'failed';
export type ReminderChannel = 'push' | 'in_app' | 'sms' | 'email';
export type OffsetType = 'before' | 'after' | 'exact';

export interface Reminder {
  id: string;
  commitment_id: string | null;
  title: string | null;
  body: string | null;
  scheduled_for: Date;
  timezone: string;
  offset_type: OffsetType | null;
  offset_minutes: number | null;
  channel: ReminderChannel;
  status: ReminderStatus;
  sent_at: Date | null;
  acknowledged_at: Date | null;
  failure_reason: string | null;
  retry_count: number;
  next_retry_at: Date | null;
  snoozed_until: Date | null;
  original_scheduled_for: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateReminderInput {
  // Either commitment_id or title must be provided
  commitment_id?: string;
  title?: string;
  body?: string;
  scheduled_for: Date;
  timezone?: string;
  offset_type?: OffsetType;
  offset_minutes?: number;
  channel?: ReminderChannel;
  metadata?: Record<string, unknown>;
}

export interface UpdateReminderInput {
  title?: string;
  body?: string;
  scheduled_for?: Date;
  timezone?: string;
  channel?: ReminderChannel;
  status?: ReminderStatus;
  metadata?: Record<string, unknown>;
}

export interface ListRemindersOptions {
  limit?: number;
  offset?: number;
  status?: ReminderStatus | ReminderStatus[];
  commitment_id?: string;
  scheduled_before?: Date;
  scheduled_after?: Date;
  channel?: ReminderChannel;
}

export interface SnoozeReminderInput {
  snooze_until: Date;
}

/**
 * Create a new reminder
 */
export async function createReminder(input: CreateReminderInput): Promise<Reminder> {
  const {
    commitment_id,
    title,
    body,
    scheduled_for,
    timezone = config.timezone,
    offset_type,
    offset_minutes,
    channel = 'push',
    metadata = {},
  } = input;

  // Validate: must have either commitment_id or title
  if (!commitment_id && !title) {
    throw new Error('Reminder must have either commitment_id or title');
  }

  // Deduplication: check for existing reminder with same title/commitment and same date
  // This prevents duplicates when extraction runs on both real-time and consolidation paths
  if (title) {
    const existing = await pool.query(
      `SELECT * FROM reminders
       WHERE title = $1 AND DATE(scheduled_for) = DATE($2)
       AND status NOT IN ('canceled', 'acknowledged')`,
      [title, scheduled_for]
    );
    if (existing.rows.length > 0) {
      console.log(`[Reminders] Skipping duplicate reminder: "${title}" on ${scheduled_for.toDateString()}`);
      return existing.rows[0] as Reminder;
    }
  }

  if (commitment_id) {
    const existing = await pool.query(
      `SELECT * FROM reminders
       WHERE commitment_id = $1 AND DATE(scheduled_for) = DATE($2)
       AND status NOT IN ('canceled', 'acknowledged')`,
      [commitment_id, scheduled_for]
    );
    if (existing.rows.length > 0) {
      console.log(`[Reminders] Skipping duplicate commitment reminder for ${commitment_id}`);
      return existing.rows[0] as Reminder;
    }
  }

  const result = await pool.query(
    `INSERT INTO reminders (
      commitment_id, title, body,
      scheduled_for, timezone,
      offset_type, offset_minutes,
      channel, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      commitment_id ?? null,
      title ?? null,
      body ?? null,
      scheduled_for,
      timezone,
      offset_type ?? null,
      offset_minutes ?? null,
      channel,
      JSON.stringify(metadata),
    ]
  );

  return result.rows[0] as Reminder;
}

/**
 * Create a standalone reminder (e.g., "remind me in 2 hours")
 */
export async function createStandaloneReminder(
  title: string,
  delayMinutes: number,
  options: { body?: string; timezone?: string } = {}
): Promise<Reminder> {
  const { body, timezone = config.timezone } = options;

  const scheduledFor = new Date(Date.now() + delayMinutes * 60000);

  return createReminder({
    title,
    body,
    scheduled_for: scheduledFor,
    offset_type: 'exact',
    timezone,
    channel: 'push',
  });
}

/**
 * Create a reminder for a specific date/time (e.g., "remind me on January 5, 2026")
 */
export async function createScheduledReminder(
  title: string,
  scheduledAt: Date,
  options: { body?: string; timezone?: string } = {}
): Promise<Reminder> {
  const { body, timezone = config.timezone } = options;

  // Validate the scheduled date is in the future
  if (scheduledAt <= new Date()) {
    throw new Error('Scheduled time must be in the future');
  }

  return createReminder({
    title,
    body,
    scheduled_for: scheduledAt,
    offset_type: 'exact',
    timezone,
    channel: 'push',
  });
}

/**
 * Get a single reminder by ID
 */
export async function getReminder(id: string): Promise<Reminder | null> {
  const result = await pool.query(
    'SELECT * FROM reminders WHERE id = $1',
    [id]
  );
  return (result.rows[0] as Reminder) ?? null;
}

/**
 * List reminders with filtering options
 */
export async function listReminders(options: ListRemindersOptions = {}): Promise<Reminder[]> {
  const {
    limit = 50,
    offset = 0,
    status,
    commitment_id,
    scheduled_before,
    scheduled_after,
    channel,
  } = options;

  const conditions: string[] = [];
  const params: (string | number | Date | string[])[] = [];
  let paramIndex = 1;

  // Filter by status
  if (status) {
    if (Array.isArray(status)) {
      conditions.push(`status = ANY($${paramIndex})`);
      params.push(status);
    } else {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
    }
    paramIndex++;
  }

  // Filter by commitment
  if (commitment_id) {
    conditions.push(`commitment_id = $${paramIndex}`);
    params.push(commitment_id);
    paramIndex++;
  }

  // Filter by scheduled time range
  if (scheduled_before) {
    conditions.push(`scheduled_for <= $${paramIndex}`);
    params.push(scheduled_before);
    paramIndex++;
  }

  if (scheduled_after) {
    conditions.push(`scheduled_for >= $${paramIndex}`);
    params.push(scheduled_after);
    paramIndex++;
  }

  // Filter by channel
  if (channel) {
    conditions.push(`channel = $${paramIndex}`);
    params.push(channel);
    paramIndex++;
  }

  let query = 'SELECT * FROM reminders';
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ` ORDER BY scheduled_for ASC`;
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows as Reminder[];
}

/**
 * Update a reminder
 */
export async function updateReminder(
  id: string,
  input: UpdateReminderInput
): Promise<Reminder | null> {
  const updates: string[] = [];
  const params: (string | number | Date | null)[] = [];
  let paramIndex = 1;

  if (input.title !== undefined) {
    updates.push(`title = $${paramIndex}`);
    params.push(input.title);
    paramIndex++;
  }
  if (input.body !== undefined) {
    updates.push(`body = $${paramIndex}`);
    params.push(input.body);
    paramIndex++;
  }
  if (input.scheduled_for !== undefined) {
    updates.push(`scheduled_for = $${paramIndex}`);
    params.push(input.scheduled_for);
    paramIndex++;
  }
  if (input.timezone !== undefined) {
    updates.push(`timezone = $${paramIndex}`);
    params.push(input.timezone);
    paramIndex++;
  }
  if (input.channel !== undefined) {
    updates.push(`channel = $${paramIndex}`);
    params.push(input.channel);
    paramIndex++;
  }
  if (input.status !== undefined) {
    updates.push(`status = $${paramIndex}`);
    params.push(input.status);
    paramIndex++;
  }
  if (input.metadata !== undefined) {
    updates.push(`metadata = $${paramIndex}`);
    params.push(JSON.stringify(input.metadata));
    paramIndex++;
  }

  if (updates.length === 0) {
    return getReminder(id);
  }

  updates.push('updated_at = NOW()');

  params.push(id);
  const query = `UPDATE reminders SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

  const result = await pool.query(query, params);
  return (result.rows[0] as Reminder) ?? null;
}

/**
 * Delete a reminder
 */
export async function deleteReminder(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM reminders WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Cancel a reminder
 */
export async function cancelReminder(id: string): Promise<Reminder | null> {
  const result = await pool.query(
    `UPDATE reminders
     SET status = 'canceled', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return (result.rows[0] as Reminder) ?? null;
}

/**
 * Mark a reminder as sent
 */
export async function markReminderSent(id: string): Promise<Reminder | null> {
  const result = await pool.query(
    `UPDATE reminders
     SET status = 'sent',
         sent_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return (result.rows[0] as Reminder) ?? null;
}

/**
 * Mark a reminder as acknowledged (user saw/acted on it)
 */
export async function markReminderAcknowledged(id: string): Promise<Reminder | null> {
  const result = await pool.query(
    `UPDATE reminders
     SET status = 'acknowledged',
         acknowledged_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return (result.rows[0] as Reminder) ?? null;
}

/**
 * Mark a reminder as failed with reason
 */
export async function markReminderFailed(
  id: string,
  reason: string,
  scheduleRetry: boolean = true
): Promise<Reminder | null> {
  // Exponential backoff: 1min, 5min, 15min, 1hr, then give up
  const RETRY_DELAYS = [1, 5, 15, 60]; // minutes

  const current = await getReminder(id);
  if (!current) return null;

  const retryCount = current.retry_count + 1;
  let nextRetryAt: Date | null = null;

  if (scheduleRetry && retryCount <= RETRY_DELAYS.length) {
    const delayMinutes = RETRY_DELAYS[retryCount - 1] ?? 60; // Default to 1 hour
    nextRetryAt = new Date(Date.now() + delayMinutes * 60000);
  }

  const result = await pool.query(
    `UPDATE reminders
     SET status = 'failed',
         failure_reason = $1,
         retry_count = $2,
         next_retry_at = $3,
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [reason, retryCount, nextRetryAt, id]
  );

  return (result.rows[0] as Reminder) ?? null;
}

/**
 * Snooze a reminder
 */
export async function snoozeReminder(
  id: string,
  input: SnoozeReminderInput
): Promise<Reminder | null> {
  const { snooze_until } = input;

  const current = await getReminder(id);
  if (!current) return null;

  // Preserve original scheduled time if not already snoozed
  const originalScheduledFor = current.original_scheduled_for ?? current.scheduled_for;

  const result = await pool.query(
    `UPDATE reminders
     SET status = 'snoozed',
         snoozed_until = $1,
         original_scheduled_for = $2,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [snooze_until, originalScheduledFor, id]
  );

  return (result.rows[0] as Reminder) ?? null;
}

/**
 * Unsnooze a reminder (wake it up at snoozed_until time)
 */
export async function unsnoozeReminder(id: string): Promise<Reminder | null> {
  const current = await getReminder(id);
  if (!current || current.status !== 'snoozed' || !current.snoozed_until) {
    return null;
  }

  const result = await pool.query(
    `UPDATE reminders
     SET status = 'pending',
         scheduled_for = snoozed_until,
         snoozed_until = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  return (result.rows[0] as Reminder) ?? null;
}

// ========================================
// Scheduler query functions
// ========================================

/**
 * Get pending reminders that are due (for scheduler)
 */
export async function getPendingReminders(
  options: { limit?: number; beforeTime?: Date } = {}
): Promise<Reminder[]> {
  const { limit = 100, beforeTime = new Date() } = options;

  const result = await pool.query(
    `SELECT * FROM reminders
     WHERE status = 'pending'
       AND scheduled_for <= $1
     ORDER BY scheduled_for ASC
     LIMIT $2`,
    [beforeTime, limit]
  );

  return result.rows as Reminder[];
}

/**
 * Get failed reminders ready for retry
 */
export async function getRetryableReminders(
  options: { limit?: number } = {}
): Promise<Reminder[]> {
  const { limit = 50 } = options;

  const result = await pool.query(
    `SELECT * FROM reminders
     WHERE status = 'failed'
       AND next_retry_at IS NOT NULL
       AND next_retry_at <= NOW()
     ORDER BY next_retry_at ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows as Reminder[];
}

/**
 * Get snoozed reminders that should wake up
 */
export async function getSnoozedRemindersToWake(
  options: { limit?: number } = {}
): Promise<Reminder[]> {
  const { limit = 50 } = options;

  const result = await pool.query(
    `SELECT * FROM reminders
     WHERE status = 'snoozed'
       AND snoozed_until IS NOT NULL
       AND snoozed_until <= NOW()
     ORDER BY snoozed_until ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows as Reminder[];
}

/**
 * Reset a failed reminder to pending for retry
 */
export async function resetReminderForRetry(id: string): Promise<Reminder | null> {
  const result = await pool.query(
    `UPDATE reminders
     SET status = 'pending',
         next_retry_at = NULL,
         updated_at = NOW()
     WHERE id = $1 AND status = 'failed'
     RETURNING *`,
    [id]
  );

  return (result.rows[0] as Reminder) ?? null;
}

/**
 * Get reminder statistics
 */
export async function getReminderStats(): Promise<{
  by_status: Record<ReminderStatus, number>;
  pending_count: number;
  upcoming_24h: number;
  failed_count: number;
}> {
  const [statusResult, upcomingResult] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*) as count FROM reminders GROUP BY status`
    ),
    pool.query(
      `SELECT COUNT(*) as count FROM reminders
       WHERE status = 'pending'
         AND scheduled_for <= NOW() + INTERVAL '24 hours'`
    ),
  ]);

  const byStatus: Record<string, number> = {
    pending: 0,
    sent: 0,
    acknowledged: 0,
    snoozed: 0,
    canceled: 0,
    failed: 0,
  };

  for (const row of statusResult.rows) {
    byStatus[row.status] = parseInt(row.count, 10);
  }

  return {
    by_status: byStatus as Record<ReminderStatus, number>,
    pending_count: byStatus.pending ?? 0,
    upcoming_24h: parseInt(upcomingResult.rows[0]?.count ?? '0', 10),
    failed_count: byStatus.failed ?? 0,
  };
}

/**
 * Get reminders for a commitment (with optional status filter)
 */
export async function getCommitmentReminders(
  commitmentId: string,
  options: { status?: ReminderStatus | ReminderStatus[] } = {}
): Promise<Reminder[]> {
  const { status } = options;

  if (status) {
    const statusArray = Array.isArray(status) ? status : [status];
    const result = await pool.query(
      `SELECT * FROM reminders
       WHERE commitment_id = $1 AND status = ANY($2)
       ORDER BY scheduled_for ASC`,
      [commitmentId, statusArray]
    );
    return result.rows as Reminder[];
  }

  const result = await pool.query(
    `SELECT * FROM reminders
     WHERE commitment_id = $1
     ORDER BY scheduled_for ASC`,
    [commitmentId]
  );
  return result.rows as Reminder[];
}
