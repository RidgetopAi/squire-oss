/**
 * Document Chunking Module
 *
 * Exports types and implementations for splitting documents
 * into semantic chunks for RAG storage.
 */

// Types
export * from './types.js';

// Chunker implementations
export { fixedChunker, countTokens, truncateToTokens } from './fixedChunker.js';
export { semanticChunker, detectSections } from './semanticChunker.js';
export { hybridChunker } from './hybridChunker.js';

// Storage
export {
  storeChunks,
  getChunksByObjectId,
  getChunkById,
  updateChunkEmbeddings,
  deleteChunksByObjectId,
  searchChunksBySimilarity,
  searchChunksByText,
  getChunkStats,
} from './chunkStorage.js';

// Embeddings
export {
  generateChunkEmbeddings,
  embedAndStoreChunks,
  generateQueryEmbedding,
} from './chunkEmbedding.js';
