/**
 * Lesson Service - CRUD and semantic search for agent lessons
 */

import { pool } from '../../db/pool.js';
import { generateEmbedding } from '../../providers/embeddings.js';

export interface Lesson {
  id: string;
  content: string;
  trigger?: string;
  category?: string;
  importance: number;
  createdAt: Date;
  lastUsedAt?: Date;
  useCount: number;
}

export async function storeLesson(
  content: string,
  trigger?: string,
  category?: string,
  importance: number = 5
): Promise<Lesson> {
  const embedding = await generateEmbedding(content);
  const embeddingStr = `[${embedding.join(',')}]`;

  const result = await pool.query(
    `INSERT INTO lessons (content, trigger, category, importance, embedding)
     VALUES ($1, $2, $3, $4, $5::vector)
     RETURNING id, content, trigger, category, importance, created_at, last_used_at, use_count`,
    [content, trigger, category, importance, embeddingStr]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    content: row.content,
    trigger: row.trigger,
    category: row.category,
    importance: row.importance,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    useCount: row.use_count,
  };
}

export async function searchLessons(query: string, limit: number = 5): Promise<Lesson[]> {
  const embedding = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(',')}]`;

  const result = await pool.query(
    `SELECT id, content, trigger, category, importance, created_at, last_used_at, use_count,
            1 - (embedding <=> $1::vector) as similarity
     FROM lessons
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [embeddingStr, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    content: row.content,
    trigger: row.trigger,
    category: row.category,
    importance: row.importance,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    useCount: row.use_count,
  }));
}

export async function getAllLessons(limit: number = 20): Promise<Lesson[]> {
  const result = await pool.query(
    `SELECT id, content, trigger, category, importance, created_at, last_used_at, use_count
     FROM lessons
     ORDER BY importance DESC, created_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    content: row.content,
    trigger: row.trigger,
    category: row.category,
    importance: row.importance,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    useCount: row.use_count,
  }));
}

export async function incrementUseCount(id: string): Promise<void> {
  await pool.query(
    `UPDATE lessons SET use_count = use_count + 1, last_used_at = NOW() WHERE id = $1`,
    [id]
  );
}
