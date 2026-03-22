/**
 * Fact Extraction Module
 *
 * Phase 6: Document Intelligence - LLM-based extraction of facts, entities,
 * dates, and relationships from document chunks.
 *
 * Main exports:
 * - extractFactsFromChunk: Extract facts from a single chunk
 * - extractFactsFromDocument: Batch extract from all document chunks
 * - Fact storage CRUD operations
 * - Types and interfaces
 */

// Types
export * from './types.js';

// Core extraction
export { extractFactsFromChunk } from './extractor.js';

// Batch extraction
export { extractFactsFromDocument, getExtractionProgress } from './batch.js';

// Storage operations
export {
  // Create
  storeFacts,
  // Read
  getFact,
  getFactsByDocument,
  getPendingFacts,
  // Update
  updateFactStatus,
  bulkUpdateFactStatus,
  updateFactContent,
  // Delete
  deleteFact,
  // Batch tracking
  createBatch,
  updateBatchProgress,
  getBatch,
  getBatchesByDocument,
  // Statistics
  getFactStats,
} from './storage.js';
