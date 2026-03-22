import { pool } from '../db/pool.js';

export interface Session {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  session_type: 'interactive' | 'batch' | 'system';
  metadata: Record<string, unknown>;
  consolidation_status: 'pending' | 'in_progress' | 'completed' | 'failed';
  consolidated_at: Date | null;
  stats: SessionStats;
}

export interface SessionStats {
  memories_created?: number;
  memories_decayed?: number;
  memories_strengthened?: number;
  edges_created?: number;
  edges_reinforced?: number;
  edges_pruned?: number;
  duration_minutes?: number;
}

export interface CreateSessionInput {
  session_type?: 'interactive' | 'batch' | 'system';
  metadata?: Record<string, unknown>;
}

/**
 * Start a new session
 */
export async function startSession(input: CreateSessionInput = {}): Promise<Session> {
  const { session_type = 'interactive', metadata = {} } = input;

  const result = await pool.query(
    `INSERT INTO sessions (session_type, metadata)
     VALUES ($1, $2)
     RETURNING *`,
    [session_type, JSON.stringify(metadata)]
  );

  return result.rows[0] as Session;
}

/**
 * End a session (marks it ready for consolidation)
 */
export async function endSession(sessionId: string): Promise<Session | null> {
  // First get the session to calculate stats
  const sessionResult = await pool.query(
    `SELECT * FROM sessions WHERE id = $1`,
    [sessionId]
  );

  if (sessionResult.rows.length === 0) {
    return null;
  }

  const session = sessionResult.rows[0] as Session;

  // Count memories created during this session
  const memCountResult = await pool.query(
    `SELECT COUNT(*) as count FROM memories WHERE session_id = $1`,
    [sessionId]
  );
  const memoriesCreated = parseInt(memCountResult.rows[0]?.count ?? '0', 10);

  // Calculate duration
  const durationMs = Date.now() - new Date(session.started_at).getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  // Update the session
  const result = await pool.query(
    `UPDATE sessions
     SET ended_at = NOW(),
         stats = jsonb_set(
           COALESCE(stats, '{}'),
           '{memories_created}',
           $2::jsonb
         ) || jsonb_build_object('duration_minutes', $3::int)
     WHERE id = $1
     RETURNING *`,
    [sessionId, memoriesCreated.toString(), durationMinutes]
  );

  return (result.rows[0] as Session) ?? null;
}

/**
 * Get the current active session (most recent unclosed session)
 */
export async function getCurrentSession(): Promise<Session | null> {
  const result = await pool.query(
    `SELECT * FROM sessions
     WHERE ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`
  );

  return (result.rows[0] as Session) ?? null;
}

/**
 * Get or create a session for the current context
 * If no active session exists, creates a new one
 */
export async function getOrCreateSession(): Promise<Session> {
  const current = await getCurrentSession();
  if (current) {
    return current;
  }
  return startSession();
}

/**
 * List sessions with optional filtering
 */
export async function listSessions(options: {
  limit?: number;
  status?: 'pending' | 'completed' | 'failed';
  includeActive?: boolean;
} = {}): Promise<Session[]> {
  const { limit = 20, status, includeActive = true } = options;

  let query = `SELECT * FROM sessions WHERE 1=1`;
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (status) {
    query += ` AND consolidation_status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (!includeActive) {
    query += ` AND ended_at IS NOT NULL`;
  }

  query += ` ORDER BY started_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows as Session[];
}

/**
 * Get sessions pending consolidation
 */
export async function getPendingConsolidationSessions(): Promise<Session[]> {
  const result = await pool.query(
    `SELECT * FROM sessions
     WHERE ended_at IS NOT NULL
       AND consolidation_status = 'pending'
     ORDER BY ended_at ASC`
  );
  return result.rows as Session[];
}

/**
 * Update session consolidation status
 */
export async function updateConsolidationStatus(
  sessionId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  stats?: Partial<SessionStats>
): Promise<Session | null> {
  let query = `UPDATE sessions SET consolidation_status = $2`;
  const params: (string | Record<string, unknown>)[] = [sessionId, status];
  let paramIndex = 3;

  if (status === 'completed') {
    query += `, consolidated_at = NOW()`;
  }

  if (stats) {
    query += `, stats = COALESCE(stats, '{}') || $${paramIndex}::jsonb`;
    params.push(JSON.stringify(stats));
  }

  query += ` WHERE id = $1 RETURNING *`;

  const result = await pool.query(query, params);
  return (result.rows[0] as Session) ?? null;
}

/**
 * Get session statistics summary
 */
export async function getSessionStats(): Promise<{
  total: number;
  active: number;
  pending: number;
  completed: number;
  averageDuration: number;
}> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE ended_at IS NULL) as active,
      COUNT(*) FILTER (WHERE consolidation_status = 'pending' AND ended_at IS NOT NULL) as pending,
      COUNT(*) FILTER (WHERE consolidation_status = 'completed') as completed,
      AVG((stats->>'duration_minutes')::int) FILTER (WHERE stats->>'duration_minutes' IS NOT NULL) as avg_duration
    FROM sessions
  `);

  const row = result.rows[0];
  return {
    total: parseInt(row.total ?? '0', 10),
    active: parseInt(row.active ?? '0', 10),
    pending: parseInt(row.pending ?? '0', 10),
    completed: parseInt(row.completed ?? '0', 10),
    averageDuration: parseFloat(row.avg_duration ?? '0'),
  };
}
