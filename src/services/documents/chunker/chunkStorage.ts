/**
 * Document Chunk Storage Service
 *
 * CRUD operations for the document_chunks table.
 * Handles storing, retrieving, and searching chunks.
 */

import { pool } from '../../../db/pool.js';
import {
  DocumentChunk,
  DocumentChunkRow,
  ChunkingStrategy,
  rowToChunk,
} from './types.js';

// === STORE CHUNKS ===

/**
 * Store multiple chunks for a document (batch insert)
 */
export async function storeChunks(chunks: DocumentChunk[]): Promise<void> {
  if (chunks.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Build batch insert
    const values: unknown[] = [];
    const placeholders: string[] = [];

    chunks.forEach((chunk, idx) => {
      const offset = idx * 9;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`
      );
      values.push(
        chunk.id,
        chunk.objectId,
        chunk.chunkIndex,
        chunk.content,
        chunk.tokenCount,
        chunk.pageNumber ?? null,
        chunk.sectionTitle ?? null,
        chunk.chunkingStrategy,
        JSON.stringify(chunk.metadata)
      );
    });

    const query = `
      INSERT INTO document_chunks (
        id, object_id, chunk_index, content, token_count,
        page_number, section_title, chunking_strategy, metadata
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (object_id, chunk_index) DO UPDATE SET
        content = EXCLUDED.content,
        token_count = EXCLUDED.token_count,
        page_number = EXCLUDED.page_number,
        section_title = EXCLUDED.section_title,
        chunking_strategy = EXCLUDED.chunking_strategy,
        metadata = EXCLUDED.metadata
    `;

    await client.query(query, values);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// === GET CHUNKS ===

/**
 * Get all chunks for a document
 */
export async function getChunksByObjectId(objectId: string): Promise<DocumentChunk[]> {
  const result = await pool.query<DocumentChunkRow>(
    `SELECT * FROM document_chunks
     WHERE object_id = $1
     ORDER BY chunk_index ASC`,
    [objectId]
  );

  return result.rows.map(rowToChunk);
}

/**
 * Get a single chunk by ID
 */
export async function getChunkById(chunkId: string): Promise<DocumentChunk | null> {
  const result = await pool.query<DocumentChunkRow>(
    'SELECT * FROM document_chunks WHERE id = $1',
    [chunkId]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return row ? rowToChunk(row) : null;
}

// === UPDATE CHUNKS ===

/**
 * Batch update embeddings for multiple chunks
 */
export async function updateChunkEmbeddings(
  updates: Array<{ chunkId: string; embedding: number[] }>
): Promise<void> {
  if (updates.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const update of updates) {
      await client.query(
        `UPDATE document_chunks
         SET embedding = $2
         WHERE id = $1`,
        [update.chunkId, JSON.stringify(update.embedding)]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// === DELETE CHUNKS ===

/**
 * Delete all chunks for a document
 */
export async function deleteChunksByObjectId(objectId: string): Promise<number> {
  const result = await pool.query(
    'DELETE FROM document_chunks WHERE object_id = $1',
    [objectId]
  );

  return result.rowCount ?? 0;
}

// === SEARCH CHUNKS ===

/**
 * Search chunks by semantic similarity
 */
export async function searchChunksBySimilarity(
  queryEmbedding: number[],
  options: {
    limit?: number;
    threshold?: number;
    objectId?: string;
  } = {}
): Promise<Array<DocumentChunk & { similarity: number }>> {
  const { limit = 10, threshold = 0.5, objectId } = options;

  let query = `
    SELECT *,
      1 - (embedding <=> $1::vector) as similarity
    FROM document_chunks
    WHERE embedding IS NOT NULL
      AND 1 - (embedding <=> $1::vector) >= $2
  `;

  const params: unknown[] = [JSON.stringify(queryEmbedding), threshold];

  if (objectId) {
    query += ` AND object_id = $3`;
    params.push(objectId);
  }

  query += ` ORDER BY similarity DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query<DocumentChunkRow & { similarity: number }>(
    query,
    params
  );

  return result.rows.map((row) => ({
    ...rowToChunk(row),
    similarity: row.similarity,
  }));
}

/**
 * Search chunks by text content (full-text search)
 */
export async function searchChunksByText(
  searchText: string,
  options: {
    limit?: number;
    objectId?: string;
  } = {}
): Promise<DocumentChunk[]> {
  const { limit = 10, objectId } = options;

  let query = `
    SELECT *
    FROM document_chunks
    WHERE content ILIKE $1
  `;

  const params: unknown[] = [`%${searchText}%`];

  if (objectId) {
    query += ` AND object_id = $2`;
    params.push(objectId);
  }

  query += ` ORDER BY chunk_index ASC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query<DocumentChunkRow>(query, params);

  return result.rows.map(rowToChunk);
}

/**
 * Get chunking statistics for a document
 */
export async function getChunkStats(objectId: string): Promise<{
  chunkCount: number;
  totalTokens: number;
  avgTokensPerChunk: number;
  hasEmbeddings: boolean;
  chunkingStrategy: ChunkingStrategy | null;
}> {
  const result = await pool.query<{
    chunk_count: string;
    total_tokens: string;
    avg_tokens: string;
    has_embeddings: boolean;
    chunking_strategy: ChunkingStrategy | null;
  }>(
    `SELECT
      COUNT(*) as chunk_count,
      COALESCE(SUM(token_count), 0) as total_tokens,
      COALESCE(AVG(token_count), 0) as avg_tokens,
      BOOL_OR(embedding IS NOT NULL) as has_embeddings,
      (SELECT chunking_strategy FROM document_chunks WHERE object_id = $1 LIMIT 1) as chunking_strategy
    FROM document_chunks
    WHERE object_id = $1`,
    [objectId]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      chunkCount: 0,
      totalTokens: 0,
      avgTokensPerChunk: 0,
      hasEmbeddings: false,
      chunkingStrategy: null,
    };
  }

  return {
    chunkCount: parseInt(row.chunk_count, 10),
    totalTokens: parseInt(row.total_tokens, 10),
    avgTokensPerChunk: parseFloat(row.avg_tokens),
    hasEmbeddings: row.has_embeddings ?? false,
    chunkingStrategy: row.chunking_strategy,
  };
}

