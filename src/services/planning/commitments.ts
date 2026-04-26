import { pool } from '../../db/pool.js';
import { generateEmbedding } from '../../providers/embeddings.js';
import { expandRecurrence, getNextOccurrence } from './recurrence.js';
import { config } from '../../config/index.js';
import { refreshCommitmentsSummary } from '../summaries.js';

// Commitment status values (from IMPLEMENTATION-TRACKER.md locked naming)
// Phase 4: Added 'candidate', 'dismissed', 'expired' for confirmation workflow
export type CommitmentStatus = 'candidate' | 'open' | 'in_progress' | 'completed' | 'canceled' | 'snoozed' | 'dismissed' | 'expired';
export type ResolutionType = 'completed' | 'canceled' | 'no_longer_relevant' | 'superseded';
export type SourceType = 'chat' | 'manual' | 'google_sync';
export type GoogleSyncStatus = 'local_only' | 'synced' | 'pending_push' | 'pending_pull' | 'conflict';

export interface Commitment {
  id: string;
  memory_id: string | null;
  title: string;
  description: string | null;
  source_type: SourceType;
  due_at: Date | null;
  timezone: string;
  all_day: boolean;
  duration_minutes: number | null;
  rrule: string | null;
  recurrence_end_at: Date | null;
  parent_commitment_id: string | null;
  original_due_at: Date | null;
  status: CommitmentStatus;
  resolved_at: Date | null;
  resolution_type: ResolutionType | null;
  resolution_memory_id: string | null;
  google_account_id: string | null;
  google_calendar_id: string | null;
  google_event_id: string | null;
  google_sync_status: GoogleSyncStatus;
  google_etag: string | null;
  last_synced_at: Date | null;
  tags: string[];
  metadata: Record<string, unknown>;
  embedding: number[] | null;
  // Phase 4: Candidate workflow fields
  confirmation_offered_at: Date | null;
  auto_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCommitmentInput {
  title: string;
  description?: string;
  memory_id?: string;
  source_type?: SourceType;
  due_at?: Date;
  timezone?: string;
  all_day?: boolean;
  duration_minutes?: number;
  rrule?: string;
  recurrence_end_at?: Date;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateCommitmentInput {
  title?: string;
  description?: string;
  due_at?: Date | null;
  timezone?: string;
  all_day?: boolean;
  duration_minutes?: number | null;
  rrule?: string | null;
  recurrence_end_at?: Date | null;
  status?: CommitmentStatus;
  tags?: string[];
  metadata?: Record<string, unknown>;
  google_sync_status?: GoogleSyncStatus;
}

export interface ListCommitmentsOptions {
  limit?: number;
  offset?: number;
  status?: CommitmentStatus | CommitmentStatus[];
  due_before?: Date;
  due_after?: Date;
  include_resolved?: boolean;
  parent_commitment_id?: string;
}

export interface ResolveCommitmentInput {
  resolution_type: ResolutionType;
  resolution_memory_id?: string;
}

export interface SnoozeCommitmentInput {
  snooze_until: Date;
}

/**
 * Create a new commitment with embedding for resolution matching
 */
export async function createCommitment(input: CreateCommitmentInput): Promise<Commitment> {
  const {
    title,
    description,
    memory_id,
    source_type = 'manual',
    due_at,
    timezone = config.timezone,
    all_day = false,
    duration_minutes,
    rrule,
    recurrence_end_at,
    tags = [],
    metadata = {},
  } = input;

  // Deduplication: check for existing commitment with same title and same date
  // This prevents duplicates when extraction runs on both real-time and consolidation paths
  if (due_at) {
    const existing = await pool.query(
      `SELECT * FROM commitments
       WHERE title = $1 AND DATE(due_at) = DATE($2)
       AND status NOT IN ('completed', 'canceled')`,
      [title, due_at]
    );
    if (existing.rows.length > 0) {
      console.log(`[Commitments] Skipping duplicate commitment: "${title}" on ${due_at.toDateString()}`);
      return existing.rows[0] as Commitment;
    }
  } else {
    // No due date - check for exact title match within last hour (to catch rapid duplicates)
    const existing = await pool.query(
      `SELECT * FROM commitments
       WHERE title = $1 AND due_at IS NULL
       AND status NOT IN ('completed', 'canceled')
       AND created_at > NOW() - INTERVAL '1 hour'`,
      [title]
    );
    if (existing.rows.length > 0) {
      console.log(`[Commitments] Skipping duplicate commitment (no date): "${title}"`);
      return existing.rows[0] as Commitment;
    }
  }

  // Generate embedding for resolution matching (combine title + description)
  const textForEmbedding = description ? `${title}. ${description}` : title;
  const embedding = await generateEmbedding(textForEmbedding);
  const embeddingStr = `[${embedding.join(',')}]`;

  // Phase 4: Commitments from chat start as 'candidate', others start as 'open'
  // Candidates auto-expire after 24 hours if not confirmed
  const initialStatus = source_type === 'chat' ? 'candidate' : 'open';
  const autoExpiresAt = source_type === 'chat' 
    ? new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    : null;

  const result = await pool.query(
    `INSERT INTO commitments (
      title, description, memory_id, source_type,
      due_at, timezone, all_day, duration_minutes,
      rrule, recurrence_end_at, original_due_at,
      tags, metadata, embedding, status, auto_expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $5, $11, $12, $13, $14, $15)
    RETURNING *`,
    [
      title,
      description ?? null,
      memory_id ?? null,
      source_type,
      due_at ?? null,
      timezone,
      all_day,
      duration_minutes ?? null,
      rrule ?? null,
      recurrence_end_at ?? null,
      tags,
      JSON.stringify(metadata),
      embeddingStr,
      initialStatus,
      autoExpiresAt,
    ]
  );

  if (initialStatus === 'candidate') {
    console.log(`[Commitments] Created CANDIDATE: "${title}" (expires in 24h)`);
  }

  const commitment = result.rows[0] as Commitment;

  // Commitments stay local_only by default.
  // Squire model handles Google Calendar event creation explicitly via tool calls,
  // preventing duplicate events with mismatched times.

  return commitment;
}

/**
 * Get a single commitment by ID
 */
export async function getCommitment(id: string): Promise<Commitment | null> {
  const result = await pool.query(
    'SELECT * FROM commitments WHERE id = $1',
    [id]
  );
  return (result.rows[0] as Commitment) ?? null;
}

/**
 * List commitments with filtering options
 */
export async function listCommitments(options: ListCommitmentsOptions = {}): Promise<Commitment[]> {
  const {
    limit = 50,
    offset = 0,
    status,
    due_before,
    due_after,
    include_resolved = false,
    parent_commitment_id,
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
  } else if (!include_resolved) {
    // Default: exclude resolved commitments
    conditions.push(`status NOT IN ('completed', 'canceled')`);
  }

  // Filter by due date range
  if (due_before) {
    conditions.push(`due_at <= $${paramIndex}`);
    params.push(due_before);
    paramIndex++;
  }

  if (due_after) {
    conditions.push(`due_at >= $${paramIndex}`);
    params.push(due_after);
    paramIndex++;
  }

  // Filter by parent (for recurring instances)
  if (parent_commitment_id) {
    conditions.push(`parent_commitment_id = $${paramIndex}`);
    params.push(parent_commitment_id);
    paramIndex++;
  }

  let query = 'SELECT * FROM commitments';
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ` ORDER BY
    CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,
    due_at ASC,
    created_at DESC`;
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows as Commitment[];
}

/**
 * Update a commitment
 */
export async function updateCommitment(
  id: string,
  input: UpdateCommitmentInput
): Promise<Commitment | null> {
  const updates: string[] = [];
  const params: (string | number | Date | boolean | string[] | null)[] = [];
  let paramIndex = 1;

  // Build dynamic update query
  if (input.title !== undefined) {
    updates.push(`title = $${paramIndex}`);
    params.push(input.title);
    paramIndex++;
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex}`);
    params.push(input.description);
    paramIndex++;
  }
  if (input.due_at !== undefined) {
    updates.push(`due_at = $${paramIndex}`);
    params.push(input.due_at);
    paramIndex++;
  }
  if (input.timezone !== undefined) {
    updates.push(`timezone = $${paramIndex}`);
    params.push(input.timezone);
    paramIndex++;
  }
  if (input.all_day !== undefined) {
    updates.push(`all_day = $${paramIndex}`);
    params.push(input.all_day);
    paramIndex++;
  }
  if (input.duration_minutes !== undefined) {
    updates.push(`duration_minutes = $${paramIndex}`);
    params.push(input.duration_minutes);
    paramIndex++;
  }
  if (input.rrule !== undefined) {
    updates.push(`rrule = $${paramIndex}`);
    params.push(input.rrule);
    paramIndex++;
  }
  if (input.recurrence_end_at !== undefined) {
    updates.push(`recurrence_end_at = $${paramIndex}`);
    params.push(input.recurrence_end_at);
    paramIndex++;
  }
  if (input.status !== undefined) {
    updates.push(`status = $${paramIndex}`);
    params.push(input.status);
    paramIndex++;
  }
  if (input.tags !== undefined) {
    updates.push(`tags = $${paramIndex}`);
    params.push(input.tags);
    paramIndex++;
  }
  if (input.metadata !== undefined) {
    updates.push(`metadata = $${paramIndex}`);
    params.push(JSON.stringify(input.metadata));
    paramIndex++;
  }
  if (input.google_sync_status !== undefined) {
    updates.push(`google_sync_status = $${paramIndex}`);
    params.push(input.google_sync_status);
    paramIndex++;
  }

  if (updates.length === 0) {
    return getCommitment(id);
  }

  // Always update updated_at
  updates.push('updated_at = NOW()');

  // Re-generate embedding if title or description changed
  if (input.title !== undefined || input.description !== undefined) {
    // Fetch current to merge with updates
    const current = await getCommitment(id);
    if (current) {
      const newTitle = input.title ?? current.title;
      const newDesc = input.description ?? current.description;
      const textForEmbedding = newDesc ? `${newTitle}. ${newDesc}` : newTitle;
      const embedding = await generateEmbedding(textForEmbedding);
      const embeddingStr = `[${embedding.join(',')}]`;
      updates.push(`embedding = $${paramIndex}`);
      params.push(embeddingStr);
      paramIndex++;
    }
  }

  params.push(id);
  const query = `UPDATE commitments SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

  const result = await pool.query(query, params);
  return (result.rows[0] as Commitment) ?? null;
}

/**
 * Delete a commitment
 */
export async function deleteCommitment(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM commitments WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Resolve a commitment (mark as completed, canceled, etc.)
 * Also triggers a refresh of the commitments living summary to prevent staleness.
 */
export async function resolveCommitment(
  id: string,
  input: ResolveCommitmentInput
): Promise<Commitment | null> {
  const { resolution_type, resolution_memory_id } = input;

  // Map resolution type to status
  const statusMap: Record<ResolutionType, CommitmentStatus> = {
    completed: 'completed',
    canceled: 'canceled',
    no_longer_relevant: 'canceled',
    superseded: 'canceled',
  };

  const result = await pool.query(
    `UPDATE commitments
     SET status = $1,
         resolved_at = NOW(),
         resolution_type = $2,
         resolution_memory_id = $3,
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [statusMap[resolution_type], resolution_type, resolution_memory_id ?? null, id]
  );

  const resolved = (result.rows[0] as Commitment) ?? null;

  // Trigger background refresh of commitments summary to prevent staleness
  // Fire-and-forget to not slow down the resolution
  if (resolved) {
    refreshCommitmentsSummary().catch((err) => {
      console.error('[Commitments] Failed to refresh summary after resolution:', err);
    });
  }

  return resolved;
}

/**
 * Snooze a commitment (postpone to later)
 */
export async function snoozeCommitment(
  id: string,
  input: SnoozeCommitmentInput
): Promise<Commitment | null> {
  const { snooze_until } = input;

  const result = await pool.query(
    `UPDATE commitments
     SET status = 'snoozed',
         due_at = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [snooze_until, id]
  );

  return (result.rows[0] as Commitment) ?? null;
}

/**
 * Unsnooze a commitment (return to open status)
 */
export async function unsnoozeCommitment(id: string): Promise<Commitment | null> {
  const result = await pool.query(
    `UPDATE commitments
     SET status = 'open',
         updated_at = NOW()
     WHERE id = $1 AND status = 'snoozed'
     RETURNING *`,
    [id]
  );

  return (result.rows[0] as Commitment) ?? null;
}

/**
 * Find open commitments that match a given text (for resolution detection)
 * Uses embedding similarity search
 */
export async function findMatchingCommitments(
  text: string,
  options: { limit?: number; minSimilarity?: number } = {}
): Promise<(Commitment & { similarity: number })[]> {
  const { limit = 5, minSimilarity = 0.5 } = options;

  const embedding = await generateEmbedding(text);
  const embeddingStr = `[${embedding.join(',')}]`;

  const result = await pool.query(
    `SELECT *,
       1 - (embedding <=> $1::vector) as similarity
     FROM commitments
     WHERE status IN ('open', 'in_progress')
       AND embedding IS NOT NULL
       AND 1 - (embedding <=> $1::vector) >= $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [embeddingStr, minSimilarity, limit]
  );

  return result.rows as (Commitment & { similarity: number })[];
}

/**
 * Get commitments due within a time window (for reminders/notifications)
 */
export async function getUpcomingCommitments(
  withinMinutes: number,
  options: { status?: CommitmentStatus[] } = {}
): Promise<Commitment[]> {
  const { status = ['open', 'in_progress'] } = options;

  const result = await pool.query(
    `SELECT * FROM commitments
     WHERE status = ANY($1)
       AND due_at IS NOT NULL
       AND due_at <= NOW() + INTERVAL '1 minute' * $2
       AND due_at >= NOW()
     ORDER BY due_at ASC`,
    [status, withinMinutes]
  );

  return result.rows as Commitment[];
}

/**
 * Get overdue commitments
 */
export async function getOverdueCommitments(): Promise<Commitment[]> {
  const result = await pool.query(
    `SELECT * FROM commitments
     WHERE status IN ('open', 'in_progress')
       AND due_at IS NOT NULL
       AND due_at < NOW()
     ORDER BY due_at ASC`
  );

  return result.rows as Commitment[];
}

/**
 * Count commitments by status
 */
export async function countCommitmentsByStatus(): Promise<Record<CommitmentStatus, number>> {
  const result = await pool.query(
    `SELECT status, COUNT(*) as count
     FROM commitments
     GROUP BY status`
  );

  const counts: Record<string, number> = {
    open: 0,
    in_progress: 0,
    completed: 0,
    canceled: 0,
    snoozed: 0,
  };

  for (const row of result.rows) {
    counts[row.status] = parseInt(row.count, 10);
  }

  return counts as Record<CommitmentStatus, number>;
}

// ============================================
// Recurrence Expansion
// ============================================

/**
 * An expanded occurrence of a recurring commitment.
 * This is a "virtual" commitment that represents one instance.
 */
export interface ExpandedCommitment extends Commitment {
  /** Whether this is a virtual occurrence (not persisted) */
  is_occurrence: boolean;
  /** The index of this occurrence in the series (0-based) */
  occurrence_index: number;
  /** The original recurring commitment ID */
  recurring_commitment_id: string;
  /** The original due_at from the template */
  template_due_at: Date | null;
}

/**
 * Options for listing commitments with recurrence expansion
 */
export interface ListExpandedOptions extends ListCommitmentsOptions {
  /** Expand recurring commitments into individual occurrences */
  expand_recurring?: boolean;
  /** Maximum occurrences per recurring commitment (default: 50) */
  max_occurrences?: number;
}

/**
 * Expand a single recurring commitment into its occurrences within a date range
 */
export function expandCommitmentOccurrences(
  commitment: Commitment,
  options: { after?: Date; before: Date; limit?: number }
): ExpandedCommitment[] {
  const { after = new Date(), before, limit = 50 } = options;

  // Non-recurring commitments return as-is (single occurrence)
  if (!commitment.rrule || !commitment.due_at) {
    return [{
      ...commitment,
      is_occurrence: false,
      occurrence_index: 0,
      recurring_commitment_id: commitment.id,
      template_due_at: commitment.due_at,
    }];
  }

  // Expand the recurrence rule
  const expansion = expandRecurrence(commitment.rrule, commitment.due_at, {
    after,
    before,
    limit,
  });

  // Create an ExpandedCommitment for each occurrence
  return expansion.occurrences.map((occurrenceDate, index) => {
    return {
      ...commitment,
      // Override the due_at with the occurrence date
      due_at: occurrenceDate,
      // Generate a unique ID for this occurrence (commitment_id:occurrence_date)
      id: `${commitment.id}:${occurrenceDate.toISOString()}`,
      is_occurrence: true,
      occurrence_index: index,
      recurring_commitment_id: commitment.id,
      template_due_at: commitment.due_at,
    };
  });
}

/**
 * List commitments with optional recurrence expansion.
 * Recurring commitments are expanded into individual occurrences within the date range.
 */
export async function listCommitmentsExpanded(
  options: ListExpandedOptions = {}
): Promise<ExpandedCommitment[]> {
  const {
    expand_recurring = true,
    max_occurrences = 50,
    due_before,
    due_after,
    ...listOptions
  } = options;

  // Fetch base commitments (including recurring templates)
  const commitments = await listCommitments({
    ...listOptions,
    // For recurring, we need all templates regardless of due_at filter
    // (their rrule may generate occurrences in the range)
    due_before: undefined,
    due_after: undefined,
  });

  if (!expand_recurring) {
    // Return as ExpandedCommitment without expansion
    return commitments.map(c => ({
      ...c,
      is_occurrence: false,
      occurrence_index: 0,
      recurring_commitment_id: c.id,
      template_due_at: c.due_at,
    }));
  }

  // Expand each commitment
  const expanded: ExpandedCommitment[] = [];
  const now = new Date();
  const rangeStart = due_after ?? now;
  const rangeEnd = due_before ?? new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // Default 90 days ahead

  for (const commitment of commitments) {
    if (commitment.rrule && commitment.due_at) {
      // Recurring: expand into occurrences
      const occurrences = expandCommitmentOccurrences(commitment, {
        after: rangeStart,
        before: rangeEnd,
        limit: max_occurrences,
      });
      expanded.push(...occurrences);
    } else {
      // Non-recurring: include if within date range (or no due date)
      const inRange = !commitment.due_at ||
        (commitment.due_at >= rangeStart && commitment.due_at <= rangeEnd);

      if (inRange) {
        expanded.push({
          ...commitment,
          is_occurrence: false,
          occurrence_index: 0,
          recurring_commitment_id: commitment.id,
          template_due_at: commitment.due_at,
        });
      }
    }
  }

  // Sort by due_at
  expanded.sort((a, b) => {
    if (!a.due_at && !b.due_at) return 0;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return a.due_at.getTime() - b.due_at.getTime();
  });

  // Apply limit if specified
  if (listOptions.limit) {
    return expanded.slice(0, listOptions.limit);
  }

  return expanded;
}

/**
 * Get the next occurrence of a recurring commitment
 */
export async function getNextCommitmentOccurrence(
  id: string,
  after: Date = new Date()
): Promise<Date | null> {
  const commitment = await getCommitment(id);
  if (!commitment || !commitment.rrule || !commitment.due_at) {
    return null;
  }

  return getNextOccurrence(commitment.rrule, commitment.due_at, after);
}

/**
 * Check if a commitment is recurring
 */
export function isRecurring(commitment: Commitment): boolean {
  return !!commitment.rrule && !!commitment.due_at;
}

/**
 * Get the parent commitment for an occurrence ID.
 * Occurrence IDs have format: "commitment_id:iso_date"
 */
export function parseOccurrenceId(occurrenceId: string): {
  commitmentId: string;
  occurrenceDate: Date | null;
  isOccurrence: boolean;
} {
  const parts = occurrenceId.split(':');

  // Check if this looks like an occurrence ID (UUID:ISO date)
  if (parts.length >= 2) {
    // UUID has 5 parts separated by -, so reconstruct
    const uuidParts = parts.slice(0, 5);
    const datePart = parts.slice(5).join(':');

    // Try to parse as UUID:date format
    const potentialUuid = uuidParts.join('-');
    const potentialDate = new Date(datePart);

    if (!isNaN(potentialDate.getTime()) && potentialUuid.length === 36) {
      return {
        commitmentId: potentialUuid,
        occurrenceDate: potentialDate,
        isOccurrence: true,
      };
    }
  }

  // Not an occurrence ID, return as regular commitment ID
  return {
    commitmentId: occurrenceId,
    occurrenceDate: null,
    isOccurrence: false,
  };
}

// ============================================================
// PHASE 4: COMMITMENT CANDIDATE WORKFLOW
// ============================================================

/**
 * Mark a candidate as having been offered for confirmation.
 * Prevents the same candidate from being surfaced multiple times.
 */
export async function markConfirmationOffered(commitmentId: string): Promise<void> {
  await pool.query(
    `UPDATE commitments 
     SET confirmation_offered_at = NOW()
     WHERE id = $1 AND status = 'candidate'`,
    [commitmentId]
  );
}

/**
 * Confirm a candidate, promoting it to 'open' status.
 * Called when user responds positively to "Would you like me to track this?"
 */
export async function confirmCandidate(commitmentId: string): Promise<Commitment | null> {
  const result = await pool.query(
    `UPDATE commitments 
     SET status = 'open', auto_expires_at = NULL, updated_at = NOW()
     WHERE id = $1 AND status = 'candidate'
     RETURNING *`,
    [commitmentId]
  );
  
  if (result.rows.length > 0) {
    console.log(`[Commitments] Candidate CONFIRMED: "${result.rows[0].title}"`);
    // Refresh summaries since we have a new active commitment
    try {
      await refreshCommitmentsSummary();
    } catch {
      // Non-critical
    }
    return result.rows[0] as Commitment;
  }
  return null;
}

/**
 * Dismiss a candidate (user said no).
 * Called when user responds negatively to confirmation prompt.
 */
export async function dismissCandidate(commitmentId: string): Promise<Commitment | null> {
  const result = await pool.query(
    `UPDATE commitments 
     SET status = 'dismissed', auto_expires_at = NULL, updated_at = NOW()
     WHERE id = $1 AND status = 'candidate'
     RETURNING *`,
    [commitmentId]
  );
  
  if (result.rows.length > 0) {
    console.log(`[Commitments] Candidate DISMISSED: "${result.rows[0].title}"`);
    return result.rows[0] as Commitment;
  }
  return null;
}

/**
 * Expire candidates that have passed their auto_expires_at time.
 * Called by scheduler on a regular interval.
 */
export async function expireCandidates(): Promise<number> {
  const result = await pool.query(
    `UPDATE commitments 
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'candidate'
       AND auto_expires_at IS NOT NULL
       AND auto_expires_at < NOW()
     RETURNING id, title`
  );
  
  const count = result.rowCount ?? 0;
  if (count > 0) {
    console.log(`[Commitments] Expired ${count} unconfirmed candidates`);
    for (const row of result.rows) {
      console.log(`  - "${row.title}"`);
    }
  }
  return count;
}

/**
 * Get the most recently offered candidate (for response detection).
 * Used to match user's "yes/no" response to the right candidate.
 *
 * IMPORTANT: Only returns candidates offered within the last 2 minutes
 * to avoid confirming stale offers when user says "yes" to something else.
 */
export async function getLastOfferedCandidate(): Promise<Commitment | null> {
  const result = await pool.query(
    `SELECT * FROM commitments
     WHERE status = 'candidate'
       AND confirmation_offered_at IS NOT NULL
       AND confirmation_offered_at > NOW() - INTERVAL '2 minutes'
       AND (auto_expires_at IS NULL OR auto_expires_at > NOW())
     ORDER BY confirmation_offered_at DESC
     LIMIT 1`
  );
  return result.rows[0] as Commitment | null;
}
