/**
 * Scratchpad Service
 *
 * Short-term working memory for Squire - threads, observations, questions, ideas, context.
 * Different from notes (user-authored) and Mandrel (project context).
 */

import { pool } from '../../db/pool.js';

// =============================================================================
// TYPES
// =============================================================================

export type ScratchpadEntryType = 'thread' | 'observation' | 'question' | 'idea' | 'context';

export interface ScratchpadEntry {
  id: string;
  entry_type: ScratchpadEntryType;
  content: string;
  metadata: Record<string, unknown>;
  priority: number;
  created_at: Date;
  updated_at: Date;
  expires_at: Date | null;
  resolved_at: Date | null;
}

export interface CreateScratchpadInput {
  entry_type: ScratchpadEntryType;
  content: string;
  priority?: number;
  expires_in_hours?: number;
  metadata?: Record<string, unknown>;
}

export interface ListScratchpadOptions {
  entry_type?: ScratchpadEntryType;
  include_resolved?: boolean;
  include_expired?: boolean;
  limit?: number;
}

// =============================================================================
// CORE OPERATIONS
// =============================================================================

/**
 * Create a new scratchpad entry
 */
export async function createEntry(input: CreateScratchpadInput): Promise<ScratchpadEntry> {
  const {
    entry_type,
    content,
    priority = 3,
    expires_in_hours,
    metadata = {},
  } = input;

  // Calculate expires_at if expires_in_hours is provided
  let expiresAt: Date | null = null;
  if (expires_in_hours !== undefined && expires_in_hours > 0) {
    expiresAt = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000);
  }

  const result = await pool.query(
    `INSERT INTO scratchpad (entry_type, content, priority, expires_at, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [entry_type, content, priority, expiresAt, JSON.stringify(metadata)]
  );

  return result.rows[0] as ScratchpadEntry;
}

/**
 * List scratchpad entries with filtering options
 */
export async function listEntries(options: ListScratchpadOptions = {}): Promise<ScratchpadEntry[]> {
  const {
    entry_type,
    include_resolved = false,
    include_expired = false,
    limit = 20,
  } = options;

  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIndex = 1;

  // Filter by entry type
  if (entry_type) {
    conditions.push(`entry_type = $${paramIndex}`);
    params.push(entry_type);
    paramIndex++;
  }

  // Exclude resolved unless requested
  if (!include_resolved) {
    conditions.push('resolved_at IS NULL');
  }

  // Exclude expired unless requested
  if (!include_expired) {
    conditions.push('(expires_at IS NULL OR expires_at > NOW())');
  }

  let query = 'SELECT * FROM scratchpad';
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  // Order by priority (higher first), then by creation date (newer first)
  query += ' ORDER BY priority ASC, created_at DESC';
  query += ` LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows as ScratchpadEntry[];
}

/**
 * Resolve an entry (mark as done/closed)
 */
export async function resolveEntry(id: string): Promise<ScratchpadEntry | null> {
  const result = await pool.query(
    `UPDATE scratchpad
     SET resolved_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND resolved_at IS NULL
     RETURNING *`,
    [id]
  );
  return (result.rows[0] as ScratchpadEntry) ?? null;
}

/**
 * Resolve entry by content match (partial, case-insensitive)
 */
export async function resolveEntryByContent(contentMatch: string): Promise<ScratchpadEntry | null> {
  const result = await pool.query(
    `UPDATE scratchpad
     SET resolved_at = NOW(), updated_at = NOW()
     WHERE resolved_at IS NULL
       AND LOWER(content) LIKE LOWER($1)
     RETURNING *`,
    [`%${contentMatch}%`]
  );
  return (result.rows[0] as ScratchpadEntry) ?? null;
}

/**
 * Clean up expired entries
 */
export async function cleanupExpired(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM scratchpad
     WHERE expires_at IS NOT NULL AND expires_at < NOW()
     RETURNING id`
  );
  return result.rowCount ?? 0;
}

/**
 * Get stats about scratchpad entries
 */
export async function getStats(): Promise<{
  total: number;
  by_type: Record<ScratchpadEntryType, number>;
  active: number;
  resolved: number;
  expiring_soon: number;
}> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE resolved_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())) as active,
      COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) as resolved,
      COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW() + INTERVAL '24 hours' AND expires_at > NOW()) as expiring_soon,
      entry_type,
      COUNT(*) FILTER (WHERE entry_type = 'thread') as thread_count,
      COUNT(*) FILTER (WHERE entry_type = 'observation') as observation_count,
      COUNT(*) FILTER (WHERE entry_type = 'question') as question_count,
      COUNT(*) FILTER (WHERE entry_type = 'idea') as idea_count,
      COUNT(*) FILTER (WHERE entry_type = 'context') as context_count
    FROM scratchpad
    GROUP BY entry_type
  `);

  const stats = {
    total: 0,
    by_type: {
      thread: 0,
      observation: 0,
      question: 0,
      idea: 0,
      context: 0,
    } as Record<ScratchpadEntryType, number>,
    active: 0,
    resolved: 0,
    expiring_soon: 0,
  };

  for (const row of result.rows) {
    stats.total += parseInt(row.total, 10);
    stats.active = parseInt(row.active, 10);
    stats.resolved = parseInt(row.resolved, 10);
    stats.expiring_soon = parseInt(row.expiring_soon, 10);
    if (row.entry_type) {
      stats.by_type[row.entry_type as ScratchpadEntryType] = parseInt(row.total, 10);
    }
  }

  return stats;
}

// =============================================================================
// CONTINUITY ENTRIES (Memory Upgrade Phase 1)
// =============================================================================

type StateTransition = 'planned' | 'started' | 'blocked' | 'completed' | 'abandoned' | 'deferred';

/**
 * Create or update a scratchpad entry for continuity tracking.
 * Called from chat extraction when state transitions are detected.
 *
 * - planned/started → Create thread entry with continuity metadata
 * - blocked/deferred → Update existing thread by subject match, or create new
 * - completed/abandoned → Resolve existing thread, create observation with 48h expiry
 */
export async function createContinuityEntry(
  subject: string,
  transition: StateTransition,
  memoryId: string,
  confidence: number,
): Promise<ScratchpadEntry> {
  const meta = { continuity: true, subject, transition, memory_id: memoryId, confidence };

  // Try to find existing continuity thread for this subject
  const existing = await pool.query<ScratchpadEntry>(
    `SELECT * FROM scratchpad
     WHERE resolved_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
       AND metadata->>'continuity' = 'true'
       AND LOWER(metadata->>'subject') = LOWER($1)
     ORDER BY created_at DESC
     LIMIT 1`,
    [subject]
  );

  const existingEntry = existing.rows[0] ?? null;

  if (transition === 'completed' || transition === 'abandoned') {
    // Resolve existing thread if found
    if (existingEntry) {
      await pool.query(
        `UPDATE scratchpad SET resolved_at = NOW(), updated_at = NOW(),
         metadata = metadata || $1::jsonb
         WHERE id = $2`,
        [JSON.stringify({ last_transition: transition }), existingEntry.id]
      );
    }
    // Create observation with 48h expiry for context
    return createEntry({
      entry_type: 'observation',
      content: `[${transition.toUpperCase()}] ${subject}`,
      priority: 3,
      expires_in_hours: 48,
      metadata: meta,
    });
  }

  if (transition === 'blocked' || transition === 'deferred') {
    // Update existing thread or create new
    if (existingEntry) {
      await pool.query(
        `UPDATE scratchpad SET
           content = $1,
           updated_at = NOW(),
           metadata = metadata || $2::jsonb
         WHERE id = $3`,
        [
          `[${transition.toUpperCase()}] ${subject}`,
          JSON.stringify({ last_transition: transition }),
          existingEntry.id,
        ]
      );
      return { ...existingEntry, content: `[${transition.toUpperCase()}] ${subject}` };
    }
    // Fall through to create new
  }

  // planned/started (or new blocked/deferred): create new thread entry
  return createEntry({
    entry_type: 'thread',
    content: `[${transition.toUpperCase()}] ${subject}`,
    priority: transition === 'blocked' ? 2 : 3,
    metadata: meta,
  });
}
