/**
 * Fact Storage Service
 *
 * Phase 6: Document Intelligence - CRUD operations for extracted facts.
 * Handles persistence, retrieval, and status updates for extracted facts.
 */

import { pool } from '../../../db/pool.js';
import {
  type ExtractedFact,
  type ExtractedFactRow,
  type FactStatus,
  type FactType,
  type FactExtractionBatchRow,
  rowToFact,
} from './types.js';

// === CREATE ===

/**
 * Store multiple extracted facts in a batch
 */
export async function storeFacts(
  facts: Array<Omit<ExtractedFact, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<ExtractedFact[]> {
  if (facts.length === 0) return [];

  // Build batch INSERT using unnest for efficiency
  const values = facts.map((fact) => [
    fact.chunkId,
    fact.objectId,
    fact.factType,
    fact.content,
    fact.rawText,
    fact.confidence,
    fact.status,
    JSON.stringify(fact.entities),
    JSON.stringify(fact.dates),
    JSON.stringify(fact.relationships),
    fact.sourcePage ?? null,
    fact.sourceSection ?? null,
    fact.positionStart ?? null,
    fact.positionEnd ?? null,
    fact.extractionModel ?? null,
    fact.extractionPromptVersion ?? null,
    JSON.stringify(fact.metadata),
  ]);

  // Use parameterized query with array
  const placeholders = values
    .map(
      (_, i) =>
        `($${i * 17 + 1}, $${i * 17 + 2}, $${i * 17 + 3}, $${i * 17 + 4}, $${i * 17 + 5}, $${i * 17 + 6}, $${i * 17 + 7}, $${i * 17 + 8}, $${i * 17 + 9}, $${i * 17 + 10}, $${i * 17 + 11}, $${i * 17 + 12}, $${i * 17 + 13}, $${i * 17 + 14}, $${i * 17 + 15}, $${i * 17 + 16}, $${i * 17 + 17})`
    )
    .join(', ');

  const flatValues = values.flat();

  const result = await pool.query<ExtractedFactRow>(
    `INSERT INTO extracted_facts (
      chunk_id, object_id, fact_type, content, raw_text,
      confidence, status, entities, dates, relationships,
      source_page, source_section, position_start, position_end,
      extraction_model, extraction_prompt_version, metadata
    ) VALUES ${placeholders}
    RETURNING *`,
    flatValues
  );

  return result.rows.map(rowToFact);
}

// === READ ===

/**
 * Get a fact by ID
 */
export async function getFact(factId: string): Promise<ExtractedFact | null> {
  const result = await pool.query<ExtractedFactRow>(
    `SELECT * FROM extracted_facts WHERE id = $1`,
    [factId]
  );

  return result.rows[0] ? rowToFact(result.rows[0]) : null;
}

/**
 * Get facts for a document (object)
 */
export async function getFactsByDocument(
  objectId: string,
  options: {
    status?: FactStatus | FactStatus[];
    factType?: FactType | FactType[];
    minConfidence?: number;
    limit?: number;
    offset?: number;
  } = {}
): Promise<ExtractedFact[]> {
  let query = `SELECT * FROM extracted_facts WHERE object_id = $1`;
  const params: unknown[] = [objectId];
  let paramIndex = 2;

  if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    query += ` AND status = ANY($${paramIndex})`;
    params.push(statuses);
    paramIndex++;
  }

  if (options.factType) {
    const types = Array.isArray(options.factType) ? options.factType : [options.factType];
    query += ` AND fact_type = ANY($${paramIndex})`;
    params.push(types);
    paramIndex++;
  }

  if (options.minConfidence !== undefined) {
    query += ` AND confidence >= $${paramIndex}`;
    params.push(options.minConfidence);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC`;

  if (options.limit) {
    query += ` LIMIT $${paramIndex}`;
    params.push(options.limit);
    paramIndex++;
  }

  if (options.offset) {
    query += ` OFFSET $${paramIndex}`;
    params.push(options.offset);
  }

  const result = await pool.query<ExtractedFactRow>(query, params);
  return result.rows.map(rowToFact);
}

/**
 * Get pending facts for review
 */
export async function getPendingFacts(
  options: {
    objectId?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<ExtractedFact[]> {
  let query = `SELECT * FROM extracted_facts WHERE status = 'pending'`;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (options.objectId) {
    query += ` AND object_id = $${paramIndex}`;
    params.push(options.objectId);
    paramIndex++;
  }

  query += ` ORDER BY confidence DESC, created_at ASC`;

  if (options.limit) {
    query += ` LIMIT $${paramIndex}`;
    params.push(options.limit);
    paramIndex++;
  }

  if (options.offset) {
    query += ` OFFSET $${paramIndex}`;
    params.push(options.offset);
  }

  const result = await pool.query<ExtractedFactRow>(query, params);
  return result.rows.map(rowToFact);
}

// === UPDATE ===

/**
 * Update fact status (approve/reject)
 */
export async function updateFactStatus(
  factId: string,
  status: FactStatus,
  notes?: string
): Promise<ExtractedFact | null> {
  const result = await pool.query<ExtractedFactRow>(
    `UPDATE extracted_facts
     SET status = $2,
         reviewed_at = NOW(),
         reviewer_notes = COALESCE($3, reviewer_notes)
     WHERE id = $1
     RETURNING *`,
    [factId, status, notes ?? null]
  );

  return result.rows[0] ? rowToFact(result.rows[0]) : null;
}

/**
 * Bulk update fact statuses
 */
export async function bulkUpdateFactStatus(
  factIds: string[],
  status: FactStatus,
  notes?: string
): Promise<number> {
  if (factIds.length === 0) return 0;

  const result = await pool.query(
    `UPDATE extracted_facts
     SET status = $2,
         reviewed_at = NOW(),
         reviewer_notes = COALESCE($3, reviewer_notes)
     WHERE id = ANY($1)`,
    [factIds, status, notes ?? null]
  );

  return result.rowCount ?? 0;
}

/**
 * Update fact content (for manual editing during review)
 */
export async function updateFactContent(
  factId: string,
  content: string,
  notes?: string
): Promise<ExtractedFact | null> {
  const result = await pool.query<ExtractedFactRow>(
    `UPDATE extracted_facts
     SET content = $2,
         reviewer_notes = COALESCE($3, reviewer_notes),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [factId, content, notes ?? null]
  );

  return result.rows[0] ? rowToFact(result.rows[0]) : null;
}

// === DELETE ===

/**
 * Delete a fact
 */
export async function deleteFact(factId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM extracted_facts WHERE id = $1`,
    [factId]
  );

  return (result.rowCount ?? 0) > 0;
}

// === BATCH TRACKING ===

/**
 * Create a new extraction batch
 */
export async function createBatch(
  objectId: string,
  totalChunks: number,
  config: Record<string, unknown> = {}
): Promise<FactExtractionBatchRow> {
  const result = await pool.query<FactExtractionBatchRow>(
    `INSERT INTO fact_extraction_batches (object_id, total_chunks, config)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [objectId, totalChunks, JSON.stringify(config)]
  );

  return result.rows[0]!;
}

/**
 * Update batch progress
 */
export async function updateBatchProgress(
  batchId: string,
  progress: {
    processedChunks?: number;
    factsExtracted?: number;
    factsAutoApproved?: number;
    status?: 'processing' | 'completed' | 'failed';
    errorMessage?: string;
    failedChunks?: string[];
  }
): Promise<FactExtractionBatchRow | null> {
  const updates: string[] = [];
  const params: unknown[] = [batchId];
  let paramIndex = 2;

  if (progress.processedChunks !== undefined) {
    updates.push(`processed_chunks = $${paramIndex}`);
    params.push(progress.processedChunks);
    paramIndex++;
  }

  if (progress.factsExtracted !== undefined) {
    updates.push(`facts_extracted = $${paramIndex}`);
    params.push(progress.factsExtracted);
    paramIndex++;
  }

  if (progress.factsAutoApproved !== undefined) {
    updates.push(`facts_auto_approved = $${paramIndex}`);
    params.push(progress.factsAutoApproved);
    paramIndex++;
  }

  if (progress.status) {
    updates.push(`status = $${paramIndex}`);
    params.push(progress.status);
    paramIndex++;

    if (progress.status === 'processing') {
      updates.push('started_at = COALESCE(started_at, NOW())');
    } else if (progress.status === 'completed' || progress.status === 'failed') {
      updates.push('completed_at = NOW()');
    }
  }

  if (progress.errorMessage !== undefined) {
    updates.push(`error_message = $${paramIndex}`);
    params.push(progress.errorMessage);
    paramIndex++;
  }

  if (progress.failedChunks !== undefined) {
    updates.push(`failed_chunks = $${paramIndex}`);
    params.push(JSON.stringify(progress.failedChunks));
    paramIndex++;
  }

  if (updates.length === 0) return null;

  const result = await pool.query<FactExtractionBatchRow>(
    `UPDATE fact_extraction_batches
     SET ${updates.join(', ')}
     WHERE id = $1
     RETURNING *`,
    params
  );

  return result.rows[0] ?? null;
}

/**
 * Get batch by ID
 */
export async function getBatch(batchId: string): Promise<FactExtractionBatchRow | null> {
  const result = await pool.query<FactExtractionBatchRow>(
    `SELECT * FROM fact_extraction_batches WHERE id = $1`,
    [batchId]
  );

  return result.rows[0] ?? null;
}

/**
 * Get batches for a document
 */
export async function getBatchesByDocument(
  objectId: string
): Promise<FactExtractionBatchRow[]> {
  const result = await pool.query<FactExtractionBatchRow>(
    `SELECT * FROM fact_extraction_batches WHERE object_id = $1 ORDER BY created_at DESC`,
    [objectId]
  );

  return result.rows;
}

// === STATISTICS ===

/**
 * Get fact extraction statistics for a document
 */
export async function getFactStats(objectId: string): Promise<{
  total: number;
  byStatus: Record<FactStatus, number>;
  byType: Record<FactType, number>;
  avgConfidence: number;
  totalEntities: number;
  totalDates: number;
  totalRelationships: number;
}> {
  const result = await pool.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'pending') as pending,
       COUNT(*) FILTER (WHERE status = 'approved') as approved,
       COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
       COUNT(*) FILTER (WHERE status = 'merged') as merged,
       COUNT(*) FILTER (WHERE status = 'auto_approved') as auto_approved,
       COUNT(*) FILTER (WHERE fact_type = 'biographical') as biographical,
       COUNT(*) FILTER (WHERE fact_type = 'event') as event,
       COUNT(*) FILTER (WHERE fact_type = 'relationship') as relationship,
       COUNT(*) FILTER (WHERE fact_type = 'preference') as preference,
       COUNT(*) FILTER (WHERE fact_type = 'statement') as statement,
       COUNT(*) FILTER (WHERE fact_type = 'date') as date_type,
       COUNT(*) FILTER (WHERE fact_type = 'location') as location,
       COUNT(*) FILTER (WHERE fact_type = 'organization') as organization,
       AVG(confidence) as avg_confidence,
       SUM(jsonb_array_length(entities)) as total_entities,
       SUM(jsonb_array_length(dates)) as total_dates,
       SUM(jsonb_array_length(relationships)) as total_relationships
     FROM extracted_facts
     WHERE object_id = $1`,
    [objectId]
  );

  const row = result.rows[0];

  return {
    total: parseInt(row.total ?? '0', 10),
    byStatus: {
      pending: parseInt(row.pending ?? '0', 10),
      approved: parseInt(row.approved ?? '0', 10),
      rejected: parseInt(row.rejected ?? '0', 10),
      merged: parseInt(row.merged ?? '0', 10),
      auto_approved: parseInt(row.auto_approved ?? '0', 10),
    },
    byType: {
      biographical: parseInt(row.biographical ?? '0', 10),
      event: parseInt(row.event ?? '0', 10),
      relationship: parseInt(row.relationship ?? '0', 10),
      preference: parseInt(row.preference ?? '0', 10),
      statement: parseInt(row.statement ?? '0', 10),
      date: parseInt(row.date_type ?? '0', 10),
      location: parseInt(row.location ?? '0', 10),
      organization: parseInt(row.organization ?? '0', 10),
    },
    avgConfidence: parseFloat(row.avg_confidence ?? '0'),
    totalEntities: parseInt(row.total_entities ?? '0', 10),
    totalDates: parseInt(row.total_dates ?? '0', 10),
    totalRelationships: parseInt(row.total_relationships ?? '0', 10),
  };
}
