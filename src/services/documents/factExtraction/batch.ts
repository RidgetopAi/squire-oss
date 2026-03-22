/**
 * Batch Fact Extraction Service
 *
 * Phase 6: Document Intelligence - Orchestrates extraction across all chunks
 * of a document with progress tracking and error handling.
 */

import { getChunksByObjectId } from '../chunker/chunkStorage.js';
import type { DocumentChunk } from '../chunker/types.js';
import { extractFactsFromChunk } from './extractor.js';
import { storeFacts, createBatch, updateBatchProgress, getFactStats } from './storage.js';
import type {
  FactExtractionOptions,
  DocumentExtractionResult,
  ChunkExtractionResult,
} from './types.js';

// === BATCH EXTRACTION ===

/**
 * Extract facts from all chunks of a document
 *
 * Creates a batch tracking record and processes each chunk sequentially,
 * storing results and updating progress as it goes.
 */
export async function extractFactsFromDocument(
  objectId: string,
  options: Partial<FactExtractionOptions> = {}
): Promise<DocumentExtractionResult> {
  const startTime = Date.now();

  // Get all chunks for the document
  const chunks = await getChunksByObjectId(objectId);

  if (chunks.length === 0) {
    return {
      success: true,
      objectId,
      batchId: '',
      chunksProcessed: 0,
      factsExtracted: 0,
      factsAutoApproved: 0,
      chunkResults: [],
      totalDurationMs: Date.now() - startTime,
      errors: [],
    };
  }

  // Create batch tracking record
  const batch = await createBatch(objectId, chunks.length, options);

  // Update batch status to processing
  await updateBatchProgress(batch.id, { status: 'processing' });

  const chunkResults: ChunkExtractionResult[] = [];
  const errors: string[] = [];
  const failedChunks: string[] = [];
  let totalFacts = 0;
  let totalAutoApproved = 0;

  // Process each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] as DocumentChunk;

    try {
      // Extract facts from chunk
      const result = await extractFactsFromChunk(chunk, objectId, options);
      chunkResults.push(result);

      if (result.success && result.facts.length > 0) {
        // Store the extracted facts
        const storedFacts = await storeFacts(result.facts);
        totalFacts += storedFacts.length;

        // Count auto-approved
        const autoApproved = storedFacts.filter((f) => f.status === 'auto_approved').length;
        totalAutoApproved += autoApproved;
      } else if (!result.success && result.error) {
        errors.push(`Chunk ${chunk.id}: ${result.error}`);
        failedChunks.push(chunk.id);
      }

      // Update batch progress periodically (every 5 chunks or at end)
      if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
        await updateBatchProgress(batch.id, {
          processedChunks: i + 1,
          factsExtracted: totalFacts,
          factsAutoApproved: totalAutoApproved,
          failedChunks,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Chunk ${chunk.id}: ${errorMsg}`);
      failedChunks.push(chunk.id);

      chunkResults.push({
        success: false,
        chunkId: chunk.id,
        facts: [],
        totalEntities: 0,
        totalDates: 0,
        totalRelationships: 0,
        processingDurationMs: 0,
        error: errorMsg,
      });
    }
  }

  // Determine final status
  const finalStatus = failedChunks.length === chunks.length ? 'failed' : 'completed';
  const errorMessage = errors.length > 0 ? errors.join('; ') : undefined;

  // Update final batch status
  await updateBatchProgress(batch.id, {
    status: finalStatus,
    processedChunks: chunks.length,
    factsExtracted: totalFacts,
    factsAutoApproved: totalAutoApproved,
    failedChunks,
    errorMessage,
  });

  console.log(
    `[BatchExtraction] Document ${objectId}: ${totalFacts} facts from ${chunks.length} chunks ` +
      `(${totalAutoApproved} auto-approved, ${failedChunks.length} failed)`
  );

  return {
    success: failedChunks.length < chunks.length,
    objectId,
    batchId: batch.id,
    chunksProcessed: chunks.length,
    factsExtracted: totalFacts,
    factsAutoApproved: totalAutoApproved,
    chunkResults,
    totalDurationMs: Date.now() - startTime,
    errors,
  };
}

/**
 * Get extraction progress for a document
 */
export async function getExtractionProgress(objectId: string): Promise<{
  hasBeenExtracted: boolean;
  totalFacts: number;
  pendingReview: number;
  approved: number;
  rejected: number;
  autoApproved: number;
  avgConfidence: number;
}> {
  const stats = await getFactStats(objectId);

  return {
    hasBeenExtracted: stats.total > 0,
    totalFacts: stats.total,
    pendingReview: stats.byStatus.pending,
    approved: stats.byStatus.approved,
    rejected: stats.byStatus.rejected,
    autoApproved: stats.byStatus.auto_approved,
    avgConfidence: stats.avgConfidence,
  };
}
