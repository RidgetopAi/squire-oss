/**
 * Preference Service - Agent self-tuning preferences
 */

import { pool } from '../../db/pool.js';

export interface Preference {
  id: string;
  key: string;
  value: string;
  reasoning?: string;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function getPreference(key: string): Promise<Preference | null> {
  const result = await pool.query(
    `SELECT id, key, value, reasoning, confidence, created_at, updated_at
     FROM preferences
     WHERE key = $1`,
    [key]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    reasoning: row.reasoning,
    confidence: row.confidence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAllPreferences(): Promise<Preference[]> {
  const result = await pool.query(
    `SELECT id, key, value, reasoning, confidence, created_at, updated_at
     FROM preferences
     ORDER BY confidence DESC, updated_at DESC`
  );

  return result.rows.map(row => ({
    id: row.id,
    key: row.key,
    value: row.value,
    reasoning: row.reasoning,
    confidence: row.confidence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updatePreference(
  key: string,
  value: string,
  reasoning?: string
): Promise<Preference> {
  // Upsert: insert or update, increase confidence on update
  const result = await pool.query(
    `INSERT INTO preferences (key, value, reasoning, confidence)
     VALUES ($1, $2, $3, 0.5)
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       reasoning = COALESCE(EXCLUDED.reasoning, preferences.reasoning),
       confidence = LEAST(preferences.confidence + 0.1, 1.0),
       updated_at = NOW()
     RETURNING id, key, value, reasoning, confidence, created_at, updated_at`,
    [key, value, reasoning]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    reasoning: row.reasoning,
    confidence: row.confidence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

