/**
 * Document Semantic Search Service
 *
 * High-level service for semantic search across document chunks.
 * Combines embedding generation, pgvector search, and document metadata.
 */

import { pool } from '../../db/pool.js';
import { generateQueryEmbedding } from './chunker/chunkEmbedding.js';
import { searchChunksBySimilarity } from './chunker/chunkStorage.js';
import { DocumentChunk } from './chunker/types.js';
import { StoredObject, getObjectById } from '../objects.js';
import { config } from '../../config/index.js';

// === TYPES ===

/**
 * Search result with chunk and document metadata
 */
export interface DocumentSearchResult {
  /** The matched chunk */
  chunk: DocumentChunk;

  /** Similarity score (0-1, higher is better) */
  similarity: number;

  /** Source document info */
  document: {
    id: string;
    name: string;
    filename: string;
    mimeType: string;
    description: string | null;
  };
}

/**
 * Options for semantic search
 */
export interface SearchOptions {
  /** Maximum results to return (default: 10) */
  limit?: number;

  /** Minimum similarity threshold (default: 0.5) */
  threshold?: number;

  /** Filter to specific document ID */
  documentId?: string;

  /** Include document metadata in results (default: true) */
  includeDocumentMetadata?: boolean;
}

/**
 * Search response with results and metadata
 */
export interface SearchResponse {
  /** Search results ordered by similarity */
  results: DocumentSearchResult[];

  /** Query used for search */
  query: string;

  /** Total results found */
  totalResults: number;

  /** Time taken for search in ms */
  searchTimeMs: number;
}

// === MAIN SEARCH FUNCTION ===

/**
 * Semantic search across document chunks
 *
 * Takes a text query, generates embedding, and searches for similar chunks
 * using pgvector cosine similarity.
 *
 * @param query - Text query to search for
 * @param options - Search options
 * @returns Search response with ranked results
 */
export async function searchDocuments(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const startTime = Date.now();
  const {
    limit = 10,
    threshold = config.search.documentThreshold,
    documentId,
    includeDocumentMetadata = true,
  } = options;

  // Generate embedding for the query
  const queryEmbedding = await generateQueryEmbedding(query);

  // Search chunks by similarity
  const chunks = await searchChunksBySimilarity(queryEmbedding, {
    limit,
    threshold,
    objectId: documentId,
  });

  // Build results with document metadata
  const results: DocumentSearchResult[] = [];

  if (includeDocumentMetadata) {
    // Cache document lookups to avoid duplicate queries
    const documentCache = new Map<string, StoredObject | null>();

    for (const chunk of chunks) {
      let doc = documentCache.get(chunk.objectId);
      if (doc === undefined) {
        doc = await getObjectById(chunk.objectId);
        documentCache.set(chunk.objectId, doc);
      }

      results.push({
        chunk: {
          id: chunk.id,
          objectId: chunk.objectId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          pageNumber: chunk.pageNumber,
          sectionTitle: chunk.sectionTitle,
          chunkingStrategy: chunk.chunkingStrategy,
          metadata: chunk.metadata,
          createdAt: chunk.createdAt,
        },
        similarity: chunk.similarity,
        document: {
          id: doc?.id ?? chunk.objectId,
          name: doc?.name ?? 'Unknown',
          filename: doc?.filename ?? 'unknown',
          mimeType: doc?.mime_type ?? 'application/octet-stream',
          description: doc?.description ?? null,
        },
      });
    }
  } else {
    // Skip document metadata lookup
    for (const chunk of chunks) {
      results.push({
        chunk: {
          id: chunk.id,
          objectId: chunk.objectId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          pageNumber: chunk.pageNumber,
          sectionTitle: chunk.sectionTitle,
          chunkingStrategy: chunk.chunkingStrategy,
          metadata: chunk.metadata,
          createdAt: chunk.createdAt,
        },
        similarity: chunk.similarity,
        document: {
          id: chunk.objectId,
          name: 'Unknown',
          filename: 'unknown',
          mimeType: 'application/octet-stream',
          description: null,
        },
      });
    }
  }

  return {
    results,
    query,
    totalResults: results.length,
    searchTimeMs: Date.now() - startTime,
  };
}

// === SEARCH WITH CONTEXT ===

/**
 * Search context result - optimized for RAG injection
 */
export interface ContextChunk {
  /** Chunk content */
  content: string;

  /** Similarity score */
  similarity: number;

  /** Token count for context window management */
  tokenCount: number;

  /** Source document name */
  documentName: string;

  /** Page number if available */
  pageNumber?: number;

  /** Section title if available */
  sectionTitle?: string;

  /** Unique ID for citation */
  sourceId: string;
}

/**
 * Search for chunks optimized for RAG context injection
 *
 * Returns chunks formatted for direct injection into LLM context,
 * with token counts for managing context window limits.
 *
 * @param query - Text query to search for
 * @param options - Search options plus maxTokens budget
 * @returns Chunks optimized for context injection
 */
export async function searchForContext(
  query: string,
  options: SearchOptions & { maxTokens?: number } = {}
): Promise<{
  chunks: ContextChunk[];
  totalTokens: number;
  query: string;
}> {
  const { maxTokens = 4000, ...searchOptions } = options;

  // Get more results than needed, then trim to token budget
  const response = await searchDocuments(query, {
    ...searchOptions,
    limit: searchOptions.limit ?? 20,
    includeDocumentMetadata: true,
  });

  const chunks: ContextChunk[] = [];
  let totalTokens = 0;

  for (const result of response.results) {
    // Check if adding this chunk would exceed budget
    if (totalTokens + result.chunk.tokenCount > maxTokens) {
      // If we have at least one chunk, stop here
      if (chunks.length > 0) break;
      // Otherwise include partial (first chunk always included)
    }

    chunks.push({
      content: result.chunk.content,
      similarity: result.similarity,
      tokenCount: result.chunk.tokenCount,
      documentName: result.document.name,
      pageNumber: result.chunk.pageNumber,
      sectionTitle: result.chunk.sectionTitle,
      sourceId: `${result.document.filename}:${result.chunk.chunkIndex}`,
    });

    totalTokens += result.chunk.tokenCount;
  }

  return {
    chunks,
    totalTokens,
    query,
  };
}

// === DIRECT SQL SEARCH (Optimized) ===

/**
 * Search result row from optimized SQL query
 */
interface SearchResultRow {
  chunk_id: string;
  object_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  page_number: number | null;
  section_title: string | null;
  similarity: number;
  doc_name: string;
  doc_filename: string;
  doc_mime_type: string;
  doc_description: string | null;
}

/**
 * Optimized semantic search using a single SQL query with JOIN
 *
 * More efficient than separate queries when document metadata is always needed.
 *
 * @param query - Text query to search for
 * @param options - Search options
 * @returns Search results with document metadata
 */
export async function searchDocumentsOptimized(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const startTime = Date.now();
  const { limit = 10, threshold = config.search.documentThreshold, documentId } = options;

  // Generate embedding for the query
  const queryEmbedding = await generateQueryEmbedding(query);

  // Build optimized query with JOIN
  let sql = `
    SELECT
      dc.id as chunk_id,
      dc.object_id,
      dc.chunk_index,
      dc.content,
      dc.token_count,
      dc.page_number,
      dc.section_title,
      1 - (dc.embedding <=> $1::vector) as similarity,
      o.name as doc_name,
      o.filename as doc_filename,
      o.mime_type as doc_mime_type,
      o.description as doc_description
    FROM document_chunks dc
    JOIN objects o ON dc.object_id = o.id
    WHERE dc.embedding IS NOT NULL
      AND 1 - (dc.embedding <=> $1::vector) >= $2
  `;

  const params: unknown[] = [JSON.stringify(queryEmbedding), threshold];

  if (documentId) {
    sql += ` AND dc.object_id = $3`;
    params.push(documentId);
  }

  sql += ` ORDER BY similarity DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query<SearchResultRow>(sql, params);

  const results: DocumentSearchResult[] = result.rows.map((row) => ({
    chunk: {
      id: row.chunk_id,
      objectId: row.object_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      tokenCount: row.token_count,
      pageNumber: row.page_number ?? undefined,
      sectionTitle: row.section_title ?? undefined,
      chunkingStrategy: 'hybrid', // Not returned in optimized query
      metadata: {},
      createdAt: new Date(), // Not returned in optimized query
    },
    similarity: row.similarity,
    document: {
      id: row.object_id,
      name: row.doc_name,
      filename: row.doc_filename,
      mimeType: row.doc_mime_type,
      description: row.doc_description,
    },
  }));

  return {
    results,
    query,
    totalResults: results.length,
    searchTimeMs: Date.now() - startTime,
  };
}

// === SEARCH STATS ===

/**
 * Get search statistics for monitoring
 */
export async function getSearchStats(): Promise<{
  totalChunks: number;
  chunksWithEmbeddings: number;
  totalDocuments: number;
  avgChunksPerDocument: number;
}> {
  const result = await pool.query<{
    total_chunks: string;
    with_embeddings: string;
    total_docs: string;
  }>(`
    SELECT
      COUNT(*) as total_chunks,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embeddings,
      COUNT(DISTINCT object_id) as total_docs
    FROM document_chunks
  `);

  const row = result.rows[0];
  const totalChunks = parseInt(row?.total_chunks ?? '0', 10);
  const totalDocs = parseInt(row?.total_docs ?? '0', 10);

  return {
    totalChunks,
    chunksWithEmbeddings: parseInt(row?.with_embeddings ?? '0', 10),
    totalDocuments: totalDocs,
    avgChunksPerDocument: totalDocs > 0 ? totalChunks / totalDocs : 0,
  };
}
