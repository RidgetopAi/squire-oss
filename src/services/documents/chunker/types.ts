/**
 * Document Chunking Types
 *
 * Types and interfaces for splitting documents into semantic chunks
 * for RAG (Retrieval Augmented Generation) storage and retrieval.
 */

// === CHUNKING STRATEGIES ===

export const CHUNKING_STRATEGIES = ['fixed', 'semantic', 'hybrid'] as const;
export type ChunkingStrategy = (typeof CHUNKING_STRATEGIES)[number];

// === CHUNKING OPTIONS ===

/**
 * Options for document chunking
 */
export interface ChunkingOptions {
  /** Chunking strategy to use */
  strategy: ChunkingStrategy;

  /** Maximum tokens per chunk (default: 512) */
  maxTokens: number;

  /** Overlap tokens between consecutive chunks (default: 50) */
  overlapTokens: number;

  /** Try to preserve paragraph boundaries when possible */
  preserveParagraphs: boolean;

  /** Try to preserve sentence boundaries within chunks */
  preserveSentences: boolean;

  /** Minimum tokens per chunk (avoid tiny chunks) */
  minTokens: number;
}

/**
 * Default chunking options (optimized for RAG retrieval)
 */
export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  strategy: 'hybrid',
  maxTokens: 512,
  overlapTokens: 50,
  preserveParagraphs: true,
  preserveSentences: true,
  minTokens: 50,
};

// === DOCUMENT CHUNK ===

/**
 * A single chunk from a document
 */
export interface DocumentChunk {
  /** Unique chunk ID (UUID) */
  id: string;

  /** Source document object ID */
  objectId: string;

  /** Order of this chunk within the document (0-indexed) */
  chunkIndex: number;

  /** Text content of the chunk */
  content: string;

  /** Token count for this chunk */
  tokenCount: number;

  /** Page number in source document (1-indexed, if available) */
  pageNumber?: number;

  /** Section/heading this chunk belongs to (if detected) */
  sectionTitle?: string;

  /** Chunking strategy used to create this chunk */
  chunkingStrategy: ChunkingStrategy;

  /** Vector embedding (768-dim for nomic-embed-text) */
  embedding?: number[];

  /** Additional metadata */
  metadata: ChunkMetadata;

  /** Creation timestamp */
  createdAt: Date;
}

/**
 * Metadata for a document chunk
 */
export interface ChunkMetadata {
  /** Start character position in source document */
  startChar?: number;

  /** End character position in source document */
  endChar?: number;

  /** Whether this chunk overlaps with the previous chunk */
  hasOverlapBefore?: boolean;

  /** Whether this chunk overlaps with the next chunk */
  hasOverlapAfter?: boolean;

  /** Word count */
  wordCount?: number;

  /** Additional custom metadata */
  [key: string]: unknown;
}

// === CHUNKING RESULT ===

/**
 * Result of chunking a document
 */
export interface ChunkingResult {
  /** Whether chunking succeeded */
  success: boolean;

  /** Chunks generated (if success) */
  chunks: DocumentChunk[];

  /** Total token count across all chunks */
  totalTokens: number;

  /** Error message (if failure) */
  error?: string;

  /** Error code for programmatic handling */
  errorCode?: ChunkingErrorCode;

  /** Processing duration in milliseconds */
  processingDurationMs: number;
}

export const CHUNKING_ERROR_CODES = [
  'EMPTY_TEXT',
  'TEXT_TOO_SHORT',
  'TOKENIZATION_FAILED',
  'INVALID_OPTIONS',
  'UNKNOWN_ERROR',
] as const;

export type ChunkingErrorCode = (typeof CHUNKING_ERROR_CODES)[number];

// === SECTION DETECTION ===

/**
 * A detected section/heading in a document
 */
export interface DocumentSection {
  /** Section title/heading text */
  title: string;

  /** Heading level (1 = H1, 2 = H2, etc.) */
  level: number;

  /** Start character position */
  startChar: number;

  /** End character position (start of next section or end of doc) */
  endChar: number;

  /** Page number where section starts (if available) */
  pageNumber?: number;
}

// === CHUNKER INTERFACE ===

/**
 * Interface for chunking implementations
 */
export interface DocumentChunker {
  /** Strategy this chunker implements */
  strategy: ChunkingStrategy;

  /**
   * Chunk a document's text into semantic chunks
   *
   * @param text - Full document text
   * @param objectId - Source document object ID
   * @param options - Chunking options
   * @returns Chunking result with chunks array
   */
  chunk(
    text: string,
    objectId: string,
    options?: Partial<ChunkingOptions>
  ): Promise<ChunkingResult>;
}

// === DATABASE ROW TYPE ===

/**
 * Row type matching the document_chunks table
 */
export interface DocumentChunkRow {
  id: string;
  object_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  page_number: number | null;
  section_title: string | null;
  chunking_strategy: ChunkingStrategy;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// === CONVERSION HELPERS ===

/**
 * Convert a database row to a DocumentChunk
 */
export function rowToChunk(row: DocumentChunkRow): DocumentChunk {
  return {
    id: row.id,
    objectId: row.object_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    tokenCount: row.token_count,
    pageNumber: row.page_number ?? undefined,
    sectionTitle: row.section_title ?? undefined,
    chunkingStrategy: row.chunking_strategy,
    embedding: row.embedding ?? undefined,
    metadata: row.metadata as ChunkMetadata,
    createdAt: row.created_at,
  };
}

