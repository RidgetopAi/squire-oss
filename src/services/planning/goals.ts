/**
 * Goals Service - Squire's Persistent Intention System
 * 
 * Manages Squire's own goals that persist between conversations
 * and drive autonomous background execution.
 */

import { pool } from '../../db/pool.js';

// === Types ===

export type GoalType = 'curiosity' | 'improvement' | 'experiment' | 'preparation';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export interface Goal {
  id: string;
  title: string;
  description: string;
  goal_type: GoalType;
  status: GoalStatus;
  priority: number;
  notes: GoalNote[];
  outcome: string | null;
  last_worked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface GoalNote {
  timestamp: string;
  content: string;
}

export interface CreateGoalInput {
  title: string;
  description: string;
  goal_type: GoalType;
  priority?: number;
}

export interface UpdateGoalInput {
  status?: GoalStatus;
  priority?: number;
  outcome?: string;
}

// === CRUD Operations ===

export async function createGoal(input: CreateGoalInput): Promise<Goal> {
  const { title, description, goal_type, priority = 3 } = input;
  const result = await pool.query(
    `INSERT INTO squire_goals (title, description, goal_type, priority)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [title, description, goal_type, priority]
  );
  return parseGoalRow(result.rows[0]);
}

export async function listGoals(options?: {
  status?: GoalStatus;
  goal_type?: GoalType;
  limit?: number;
}): Promise<Goal[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (options?.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(options.status);
  }
  if (options?.goal_type) {
    conditions.push(`goal_type = $${paramIndex++}`);
    params.push(options.goal_type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options?.limit ? `LIMIT ${options.limit}` : '';

  const result = await pool.query(
    `SELECT * FROM squire_goals ${where} ORDER BY priority ASC, updated_at DESC ${limit}`,
    params
  );
  return result.rows.map(parseGoalRow);
}

export async function updateGoal(id: string, input: UpdateGoalInput): Promise<Goal | null> {
  const updates: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    params.push(input.status);
  }
  if (input.priority !== undefined) {
    updates.push(`priority = $${paramIndex++}`);
    params.push(input.priority);
  }
  if (input.outcome !== undefined) {
    updates.push(`outcome = $${paramIndex++}`);
    params.push(input.outcome);
  }

  params.push(id);

  const result = await pool.query(
    `UPDATE squire_goals SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  );
  return result.rows[0] ? parseGoalRow(result.rows[0]) : null;
}

/**
 * Append a note to a goal's running notes log
 */
export async function addGoalNote(id: string, content: string): Promise<Goal | null> {
  const note: GoalNote = {
    timestamp: new Date().toISOString(),
    content,
  };
  
  const result = await pool.query(
    `UPDATE squire_goals 
     SET notes = notes || $1::jsonb, updated_at = NOW()
     WHERE id = $2 
     RETURNING *`,
    [JSON.stringify(note), id]
  );
  return result.rows[0] ? parseGoalRow(result.rows[0]) : null;
}

/**
 * Mark a goal as being worked on (updates last_worked_at)
 */
export async function markGoalWorkedOn(id: string): Promise<void> {
  await pool.query(
    `UPDATE squire_goals SET last_worked_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

/**
 * Get the next goal to work on during background execution.
 * Returns the highest-priority active goal that hasn't been worked on recently.
 */
export async function getNextGoal(): Promise<Goal | null> {
  const result = await pool.query(
    `SELECT * FROM squire_goals 
     WHERE status = 'active'
     ORDER BY priority ASC, last_worked_at ASC NULLS FIRST, created_at ASC
     LIMIT 1`
  );
  return result.rows[0] ? parseGoalRow(result.rows[0]) : null;
}

// === Helpers ===

function parseGoalRow(row: Record<string, unknown>): Goal {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    goal_type: row.goal_type as GoalType,
    status: row.status as GoalStatus,
    priority: row.priority as number,
    notes: (typeof row.notes === 'string' ? JSON.parse(row.notes) : row.notes) as GoalNote[],
    outcome: row.outcome as string | null,
    last_worked_at: row.last_worked_at ? new Date(row.last_worked_at as string) : null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}
