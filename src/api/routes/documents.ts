/**
 * Document Extraction & Chunking API Routes
 *
 * Provides endpoints for extracting text and metadata from documents,
 * chunking documents for RAG storage, and searching chunks.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  extractFromBuffer,
  isSupported,
  getSupportedMimeTypes,
  ExtractionOptions,
  // Chunking
  hybridChunker,
  fixedChunker,
  semanticChunker,
  ChunkingOptions,
  storeChunks,
  getChunksByObjectId,
  getChunkStats,
  deleteChunksByObjectId,
  searchChunksBySimilarity,
  searchChunksByText,
  generateChunkEmbeddings,
  embedAndStoreChunks,
  generateQueryEmbedding,
  // High-level search
  searchDocumentsOptimized,
  getSearchStats,
  // Ephemeral processing
  summarizeDocument,
  askDocument,
  getCacheStats as getEphemeralCacheStats,
} from '../../services/documents/index.js';
import { getObjectById, createObject } from '../../services/objects.js';
import { pool } from '../../db/pool.js';

const router = Router();

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// ============================================================================
// EXTRACTION ENDPOINTS
// ============================================================================

/**
 * POST /api/documents/extract
 * Extract text and metadata from an uploaded document
 *
 * Body: multipart/form-data with 'file' field
 * Query params:
 *   - maxTextLength: number (optional)
 *   - preservePageBreaks: boolean (optional)
 *   - ocrLanguage: string (optional, default 'eng')
 *   - ocrConfidenceThreshold: number (optional, 0-1)
 */
router.post('/extract', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Check if MIME type is supported
    if (!isSupported(file.mimetype)) {
      res.status(400).json({
        error: `Unsupported file type: ${file.mimetype}`,
        supportedTypes: getSupportedMimeTypes(),
      });
      return;
    }

    // Build extraction options from query params
    const options: ExtractionOptions = {};

    if (req.query.maxTextLength) {
      options.maxTextLength = parseInt(req.query.maxTextLength as string, 10);
    }

    if (req.query.preservePageBreaks !== undefined) {
      options.preservePageBreaks = req.query.preservePageBreaks === 'true';
    }

    if (req.query.ocrLanguage) {
      options.ocrLanguage = req.query.ocrLanguage as string;
    }

    if (req.query.ocrConfidenceThreshold) {
      options.ocrConfidenceThreshold = parseFloat(req.query.ocrConfidenceThreshold as string);
    }

    // Perform extraction
    const result = await extractFromBuffer(file.buffer, file.mimetype, options);

    if (!result.success) {
      res.status(422).json({
        error: result.error,
        errorCode: result.errorCode,
      });
      return;
    }

    // Store as an object in the database
    const { object, isDuplicate } = await createObject({
      name: file.originalname,
      filename: file.originalname,
      mimeType: file.mimetype,
      data: file.buffer,
      source: 'upload',
      metadata: {
        extraction: {
          pageCount: result.document?.metadata?.pageCount,
          wordCount: result.document?.metadata?.wordCount,
          format: result.document?.format,
        },
      },
    });

    // Update object with extracted text (processing complete)
    await pool.query(
      `UPDATE objects
       SET extracted_text = $1,
           processing_status = 'completed',
           processed_at = NOW()
       WHERE id = $2`,
      [result.document?.text || '', object.id]
    );

    res.json({
      objectId: object.id,
      extraction: result.document,
      isDuplicate,
      file: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      },
    });
  } catch (error) {
    console.error('Document extraction error:', error);
    res.status(500).json({
      error: 'Internal server error during extraction',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/documents/supported-types
 * Get list of supported MIME types for extraction
 */
router.get('/supported-types', (_req: Request, res: Response) => {
  res.json({
    mimeTypes: getSupportedMimeTypes(),
  });
});

/**
 * POST /api/documents/check-support
 * Check if a MIME type is supported
 *
 * Body: { mimeType: string }
 */
router.post('/check-support', (req: Request, res: Response) => {
  const { mimeType } = req.body;

  if (!mimeType || typeof mimeType !== 'string') {
    res.status(400).json({ error: 'mimeType is required' });
    return;
  }

  res.json({
    mimeType,
    supported: isSupported(mimeType),
  });
});

// ============================================================================
// CHUNKING ENDPOINTS
// ============================================================================

/**
 * POST /api/documents/:id/chunk
 * Chunk a document by object ID
 *
 * Params:
 *   - id: object UUID
 *
 * Body (all optional):
 *   - strategy: 'fixed' | 'semantic' | 'hybrid' (default: 'hybrid')
 *   - maxTokens: number (default: 512)
 *   - overlapTokens: number (default: 50)
 *   - generateEmbeddings: boolean (default: true)
 *   - replaceExisting: boolean (default: true)
 */
router.post('/:id/chunk', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    const {
      strategy = 'hybrid',
      maxTokens,
      overlapTokens,
      generateEmbeddings: shouldEmbed = true,
      replaceExisting = true,
    } = req.body;

    // Get the object
    const object = await getObjectById(id);
    if (!object) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Check if object has extracted text
    if (!object.extracted_text) {
      res.status(400).json({
        error: 'Document has no extracted text. Run extraction first.',
      });
      return;
    }

    // Delete existing chunks if replacing
    if (replaceExisting) {
      await deleteChunksByObjectId(id);
    }

    // Select chunker based on strategy
    const chunker =
      strategy === 'fixed' ? fixedChunker :
      strategy === 'semantic' ? semanticChunker :
      hybridChunker;

    // Build options
    const options: Partial<ChunkingOptions> = {};
    if (maxTokens !== undefined) options.maxTokens = maxTokens;
    if (overlapTokens !== undefined) options.overlapTokens = overlapTokens;

    // Chunk the document
    const result = await chunker.chunk(object.extracted_text, id, options);

    if (!result.success) {
      res.status(422).json({
        error: result.error,
        errorCode: result.errorCode,
      });
      return;
    }

    // Generate embeddings if requested
    if (shouldEmbed && result.chunks.length > 0) {
      await generateChunkEmbeddings(result.chunks);
    }

    // Store chunks
    await storeChunks(result.chunks);

    res.json({
      success: true,
      objectId: id,
      chunks: result.chunks,
      totalTokens: result.totalTokens,
      strategy,
      hasEmbeddings: shouldEmbed,
      processingDurationMs: result.processingDurationMs,
    });
  } catch (error) {
    console.error('Document chunking error:', error);
    res.status(500).json({
      error: 'Internal server error during chunking',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/documents/:id/chunks
 * Get all chunks for a document
 *
 * Params:
 *   - id: object UUID
 *
 * Query:
 *   - includeContent: boolean (default: true)
 *   - includeEmbeddings: boolean (default: false)
 */
router.get('/:id/chunks', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    const includeContent = req.query.includeContent !== 'false';
    const includeEmbeddings = req.query.includeEmbeddings === 'true';

    const chunks = await getChunksByObjectId(id);

    // Optionally strip content/embeddings to reduce payload
    const result = chunks.map((chunk) => ({
      id: chunk.id,
      chunkIndex: chunk.chunkIndex,
      tokenCount: chunk.tokenCount,
      pageNumber: chunk.pageNumber,
      sectionTitle: chunk.sectionTitle,
      chunkingStrategy: chunk.chunkingStrategy,
      hasEmbedding: chunk.embedding != null,
      ...(includeContent && { content: chunk.content }),
      ...(includeEmbeddings && { embedding: chunk.embedding }),
      metadata: chunk.metadata,
      createdAt: chunk.createdAt,
    }));

    const stats = await getChunkStats(id);

    res.json({
      objectId: id,
      chunks: result,
      stats,
    });
  } catch (error) {
    console.error('Get chunks error:', error);
    res.status(500).json({
      error: 'Internal server error getting chunks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/documents/:id/chunks
 * Delete all chunks for a document
 */
router.delete('/:id/chunks', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    const deletedCount = await deleteChunksByObjectId(id);

    res.json({
      success: true,
      objectId: id,
      deletedCount,
    });
  } catch (error) {
    console.error('Delete chunks error:', error);
    res.status(500).json({
      error: 'Internal server error deleting chunks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/documents/:id/chunks/embed
 * Generate embeddings for chunks that don't have them
 */
router.post('/:id/chunks/embed', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    const embeddedCount = await embedAndStoreChunks(id);

    res.json({
      success: true,
      objectId: id,
      embeddedCount,
    });
  } catch (error) {
    console.error('Embed chunks error:', error);
    res.status(500).json({
      error: 'Internal server error embedding chunks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// SEARCH ENDPOINTS
// ============================================================================

/**
 * GET /api/documents/search
 * Semantic search across documents with full document metadata
 *
 * Query params:
 *   - q: string (required) - search query
 *   - limit: number (default: 10)
 *   - threshold: number (default: 0.5)
 *   - documentId: string (optional, filter to specific document)
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 10;
    const threshold = parseFloat(req.query.threshold as string) || 0.5;
    const documentId = req.query.documentId as string | undefined;

    if (!query) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const response = await searchDocumentsOptimized(query, {
      limit,
      threshold,
      documentId,
    });

    res.json({
      success: true,
      query: response.query,
      totalResults: response.totalResults,
      searchTimeMs: response.searchTimeMs,
      results: response.results.map((r) => ({
        chunk: {
          id: r.chunk.id,
          content: r.chunk.content,
          tokenCount: r.chunk.tokenCount,
          pageNumber: r.chunk.pageNumber,
          sectionTitle: r.chunk.sectionTitle,
          chunkIndex: r.chunk.chunkIndex,
        },
        similarity: r.similarity,
        document: r.document,
      })),
    });
  } catch (error) {
    console.error('Document search error:', error);
    res.status(500).json({
      error: 'Internal server error during search',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/documents/search/stats
 * Get search statistics
 */
router.get('/search/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getSearchStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Search stats error:', error);
    res.status(500).json({
      error: 'Internal server error getting stats',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/documents/chunks/search
 * Search chunks across all documents using semantic similarity
 *
 * Body:
 *   - query: string (required)
 *   - limit: number (default: 10)
 *   - threshold: number (default: 0.5)
 *   - objectId: string (optional, to search within a specific document)
 */
router.post('/chunks/search', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10, threshold = 0.5, objectId } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    // Generate embedding for query
    const queryEmbedding = await generateQueryEmbedding(query);

    // Search by similarity
    const results = await searchChunksBySimilarity(queryEmbedding, {
      limit,
      threshold,
      objectId,
    });

    res.json({
      query,
      resultCount: results.length,
      results: results.map((chunk) => ({
        id: chunk.id,
        objectId: chunk.objectId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        sectionTitle: chunk.sectionTitle,
        similarity: chunk.similarity,
      })),
    });
  } catch (error) {
    console.error('Search chunks error:', error);
    res.status(500).json({
      error: 'Internal server error searching chunks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/documents/chunks/search/text
 * Search chunks by text content (full-text search)
 *
 * Body:
 *   - searchText: string (required)
 *   - limit: number (default: 10)
 *   - objectId: string (optional)
 */
router.post('/chunks/search/text', async (req: Request, res: Response) => {
  try {
    const { searchText, limit = 10, objectId } = req.body;

    if (!searchText || typeof searchText !== 'string') {
      res.status(400).json({ error: 'searchText is required' });
      return;
    }

    const results = await searchChunksByText(searchText, { limit, objectId });

    res.json({
      searchText,
      resultCount: results.length,
      results: results.map((chunk) => ({
        id: chunk.id,
        objectId: chunk.objectId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        sectionTitle: chunk.sectionTitle,
      })),
    });
  } catch (error) {
    console.error('Text search chunks error:', error);
    res.status(500).json({
      error: 'Internal server error searching chunks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// EPHEMERAL PROCESSING ENDPOINTS (Path 2: Direct-to-LLM)
// ============================================================================

/**
 * POST /api/documents/summarize
 * Summarize an uploaded document (ephemeral - no storage)
 *
 * Body: multipart/form-data with 'file' field
 * Query params:
 *   - style: 'brief' | 'detailed' | 'bullet-points' (default: 'brief')
 *   - focus: string (optional focus area)
 *   - maxTokens: number (max summary tokens, default: 500)
 */
router.post('/summarize', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    if (!isSupported(file.mimetype)) {
      res.status(400).json({
        error: `Unsupported file type: ${file.mimetype}`,
        supportedTypes: getSupportedMimeTypes(),
      });
      return;
    }

    const style = (req.query.style as 'brief' | 'detailed' | 'bullet-points') ?? 'brief';
    const focus = req.query.focus as string | undefined;
    const maxSummaryTokens = req.query.maxTokens
      ? parseInt(req.query.maxTokens as string, 10)
      : undefined;

    const result = await summarizeDocument(file.buffer, file.mimetype, file.originalname, {
      style,
      focus,
      maxSummaryTokens,
    });

    res.json({
      success: true,
      summary: result.summary,
      document: result.documentInfo,
      usage: result.usage,
      cached: result.cached,
    });
  } catch (error) {
    console.error('Document summarize error:', error);
    res.status(500).json({
      error: 'Internal server error during summarization',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/documents/ask
 * Ask a question about an uploaded document (ephemeral - no storage)
 *
 * Body: multipart/form-data with 'file' field
 * Query params:
 *   - question: string (required)
 *   - maxTokens: number (max answer tokens, default: 1000)
 *   - citations: boolean (include citations, default: true)
 */
router.post('/ask', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const question = req.query.question as string;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    if (!question) {
      res.status(400).json({ error: 'Query parameter "question" is required' });
      return;
    }

    if (!isSupported(file.mimetype)) {
      res.status(400).json({
        error: `Unsupported file type: ${file.mimetype}`,
        supportedTypes: getSupportedMimeTypes(),
      });
      return;
    }

    const maxAnswerTokens = req.query.maxTokens
      ? parseInt(req.query.maxTokens as string, 10)
      : undefined;
    const includeCitations = req.query.citations !== 'false';

    const result = await askDocument(file.buffer, file.mimetype, file.originalname, question, {
      maxAnswerTokens,
      includeCitations,
    });

    res.json({
      success: true,
      answer: result.answer,
      question: result.question,
      document: result.documentInfo,
      usage: result.usage,
      cached: result.cached,
    });
  } catch (error) {
    console.error('Document ask error:', error);
    res.status(500).json({
      error: 'Internal server error during Q&A',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/documents/ephemeral/stats
 * Get ephemeral processing cache statistics
 */
router.get('/ephemeral/stats', (_req: Request, res: Response) => {
  const stats = getEphemeralCacheStats();
  res.json({
    success: true,
    cache: stats,
    ttlMinutes: 30,
  });
});

// ============================================================================
// FACT EXTRACTION ENDPOINTS (Phase 6: Document Intelligence)
// ============================================================================

import {
  extractFactsFromDocument,
  extractFactsFromChunk,
  getExtractionProgress,
  getFactsByDocument,
  getPendingFacts,
  getFact,
  updateFactStatus,
  bulkUpdateFactStatus,
  updateFactContent,
  deleteFact,
  getFactStats,
  getBatch,
  getBatchesByDocument,
  type FactStatus,
  type FactType,
  type FactExtractionOptions,
} from '../../services/documents/factExtraction/index.js';
import { getChunkById } from '../../services/documents/chunker/chunkStorage.js';

/**
 * POST /api/documents/:objectId/extract-facts
 * Extract facts from all chunks of a document
 *
 * Body (optional):
 *   - minConfidence: number (0-1, default: 0.5)
 *   - autoApproveThreshold: number (0-1, default: 0.9)
 *   - extractEntities: boolean (default: true)
 *   - extractDates: boolean (default: true)
 *   - extractRelationships: boolean (default: true)
 *   - maxFactsPerChunk: number (default: 10)
 *   - factTypes: string[] (optional, filter fact types)
 */
router.post('/:objectId/extract-facts', async (req: Request, res: Response) => {
  try {
    const objectId = req.params.objectId;
    if (!objectId) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    // Verify document exists
    const object = await getObjectById(objectId);
    if (!object) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Build extraction options
    const options: Partial<FactExtractionOptions> = {};

    if (req.body.minConfidence !== undefined) {
      options.minConfidence = Number(req.body.minConfidence);
    }
    if (req.body.autoApproveThreshold !== undefined) {
      options.autoApproveThreshold = Number(req.body.autoApproveThreshold);
    }
    if (req.body.extractEntities !== undefined) {
      options.extractEntities = Boolean(req.body.extractEntities);
    }
    if (req.body.extractDates !== undefined) {
      options.extractDates = Boolean(req.body.extractDates);
    }
    if (req.body.extractRelationships !== undefined) {
      options.extractRelationships = Boolean(req.body.extractRelationships);
    }
    if (req.body.maxFactsPerChunk !== undefined) {
      options.maxFactsPerChunk = Number(req.body.maxFactsPerChunk);
    }
    if (req.body.factTypes && Array.isArray(req.body.factTypes)) {
      options.factTypes = req.body.factTypes as FactType[];
    }

    // Extract facts from document
    const result = await extractFactsFromDocument(objectId, options);

    res.json({
      success: result.success,
      batchId: result.batchId,
      objectId: result.objectId,
      chunksProcessed: result.chunksProcessed,
      factsExtracted: result.factsExtracted,
      factsAutoApproved: result.factsAutoApproved,
      totalDurationMs: result.totalDurationMs,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error('Fact extraction error:', error);
    res.status(500).json({
      error: 'Internal server error during fact extraction',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/documents/chunks/:chunkId/extract-facts
 * Extract facts from a single chunk
 */
router.post('/chunks/:chunkId/extract-facts', async (req: Request, res: Response) => {
  try {
    const chunkId = req.params.chunkId;
    if (!chunkId) {
      res.status(400).json({ error: 'Chunk ID is required' });
      return;
    }

    // Get the chunk
    const chunk = await getChunkById(chunkId);
    if (!chunk) {
      res.status(404).json({ error: 'Chunk not found' });
      return;
    }

    // Build extraction options
    const options: Partial<FactExtractionOptions> = {};
    if (req.body.minConfidence !== undefined) {
      options.minConfidence = Number(req.body.minConfidence);
    }
    if (req.body.autoApproveThreshold !== undefined) {
      options.autoApproveThreshold = Number(req.body.autoApproveThreshold);
    }

    // Extract facts from chunk
    const result = await extractFactsFromChunk(chunk, chunk.objectId, options);

    res.json({
      success: result.success,
      chunkId: result.chunkId,
      factsExtracted: result.facts.length,
      totalEntities: result.totalEntities,
      totalDates: result.totalDates,
      totalRelationships: result.totalRelationships,
      processingDurationMs: result.processingDurationMs,
      facts: result.facts,
      error: result.error,
    });
  } catch (error) {
    console.error('Chunk fact extraction error:', error);
    res.status(500).json({
      error: 'Internal server error during fact extraction',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/documents/:objectId/facts
 * Get extracted facts for a document
 *
 * Query params:
 *   - status: FactStatus or comma-separated statuses
 *   - factType: FactType or comma-separated types
 *   - minConfidence: number (0-1)
 *   - limit: number
 *   - offset: number
 */
router.get('/:objectId/facts', async (req: Request, res: Response) => {
  try {
    const objectId = req.params.objectId;
    if (!objectId) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    // Build query options
    const options: {
      status?: FactStatus[];
      factType?: FactType[];
      minConfidence?: number;
      limit?: number;
      offset?: number;
    } = {};

    if (req.query.status) {
      options.status = (req.query.status as string).split(',') as FactStatus[];
    }
    if (req.query.factType) {
      options.factType = (req.query.factType as string).split(',') as FactType[];
    }
    if (req.query.minConfidence) {
      options.minConfidence = Number(req.query.minConfidence);
    }
    if (req.query.limit) {
      options.limit = Number(req.query.limit);
    }
    if (req.query.offset) {
      options.offset = Number(req.query.offset);
    }

    const facts = await getFactsByDocument(objectId, options);

    res.json({
      success: true,
      objectId,
      count: facts.length,
      facts,
    });
  } catch (error) {
    console.error('Get facts error:', error);
    res.status(500).json({
      error: 'Internal server error getting facts',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/documents/:objectId/facts/stats
 * Get fact extraction statistics for a document
 */
router.get('/:objectId/facts/stats', async (req: Request, res: Response) => {
  try {
    const objectId = req.params.objectId;
    if (!objectId) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    const stats = await getFactStats(objectId);
    const progress = await getExtractionProgress(objectId);

    res.json({
      success: true,
      objectId,
      hasBeenExtracted: progress.hasBeenExtracted,
      stats,
    });
  } catch (error) {
    console.error('Get fact stats error:', error);
    res.status(500).json({
      error: 'Internal server error getting fact stats',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/documents/:objectId/facts/batches
 * Get extraction batches for a document
 */
router.get('/:objectId/facts/batches', async (req: Request, res: Response) => {
  try {
    const objectId = req.params.objectId;
    if (!objectId) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    const batches = await getBatchesByDocument(objectId);

    res.json({
      success: true,
      objectId,
      count: batches.length,
      batches,
    });
  } catch (error) {
    console.error('Get batches error:', error);
    res.status(500).json({
      error: 'Internal server error getting batches',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/documents/facts/pending
 * Get pending facts for review (across all documents)
 *
 * Query params:
 *   - objectId: string (optional, filter by document)
 *   - limit: number
 *   - offset: number
 */
router.get('/facts/pending', async (req: Request, res: Response) => {
  try {
    const options: {
      objectId?: string;
      limit?: number;
      offset?: number;
    } = {};

    if (req.query.objectId) {
      options.objectId = req.query.objectId as string;
    }
    if (req.query.limit) {
      options.limit = Number(req.query.limit);
    }
    if (req.query.offset) {
      options.offset = Number(req.query.offset);
    }

    const facts = await getPendingFacts(options);

    res.json({
      success: true,
      count: facts.length,
      facts,
    });
  } catch (error) {
    console.error('Get pending facts error:', error);
    res.status(500).json({
      error: 'Internal server error getting pending facts',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/documents/facts/:factId
 * Get a specific fact by ID
 */
router.get('/facts/:factId', async (req: Request, res: Response) => {
  try {
    const factId = req.params.factId;
    if (!factId) {
      res.status(400).json({ error: 'Fact ID is required' });
      return;
    }

    const fact = await getFact(factId);
    if (!fact) {
      res.status(404).json({ error: 'Fact not found' });
      return;
    }

    res.json({
      success: true,
      fact,
    });
  } catch (error) {
    console.error('Get fact error:', error);
    res.status(500).json({
      error: 'Internal server error getting fact',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PATCH /api/documents/facts/:factId/status
 * Update fact status (approve/reject)
 *
 * Body:
 *   - status: FactStatus (required)
 *   - notes: string (optional reviewer notes)
 */
router.patch('/facts/:factId/status', async (req: Request, res: Response) => {
  try {
    const factId = req.params.factId;
    if (!factId) {
      res.status(400).json({ error: 'Fact ID is required' });
      return;
    }

    const { status, notes } = req.body;

    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }

    const fact = await updateFactStatus(factId, status as FactStatus, notes);
    if (!fact) {
      res.status(404).json({ error: 'Fact not found' });
      return;
    }

    res.json({
      success: true,
      fact,
    });
  } catch (error) {
    console.error('Update fact status error:', error);
    res.status(500).json({
      error: 'Internal server error updating fact status',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/documents/facts/bulk-status
 * Bulk update fact statuses
 *
 * Body:
 *   - factIds: string[] (required)
 *   - status: FactStatus (required)
 *   - notes: string (optional)
 */
router.post('/facts/bulk-status', async (req: Request, res: Response) => {
  try {
    const { factIds, status, notes } = req.body;

    if (!factIds || !Array.isArray(factIds) || factIds.length === 0) {
      res.status(400).json({ error: 'factIds array is required' });
      return;
    }

    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }

    const count = await bulkUpdateFactStatus(factIds, status as FactStatus, notes);

    res.json({
      success: true,
      updatedCount: count,
    });
  } catch (error) {
    console.error('Bulk update fact status error:', error);
    res.status(500).json({
      error: 'Internal server error updating fact statuses',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PATCH /api/documents/facts/:factId/content
 * Update fact content (for editing during review)
 *
 * Body:
 *   - content: string (required)
 *   - notes: string (optional)
 */
router.patch('/facts/:factId/content', async (req: Request, res: Response) => {
  try {
    const factId = req.params.factId;
    if (!factId) {
      res.status(400).json({ error: 'Fact ID is required' });
      return;
    }

    const { content, notes } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const fact = await updateFactContent(factId, content, notes);
    if (!fact) {
      res.status(404).json({ error: 'Fact not found' });
      return;
    }

    res.json({
      success: true,
      fact,
    });
  } catch (error) {
    console.error('Update fact content error:', error);
    res.status(500).json({
      error: 'Internal server error updating fact content',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/documents/facts/:factId
 * Delete a fact
 */
router.delete('/facts/:factId', async (req: Request, res: Response) => {
  try {
    const factId = req.params.factId;
    if (!factId) {
      res.status(400).json({ error: 'Fact ID is required' });
      return;
    }

    const deleted = await deleteFact(factId);
    if (!deleted) {
      res.status(404).json({ error: 'Fact not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Fact deleted',
    });
  } catch (error) {
    console.error('Delete fact error:', error);
    res.status(500).json({
      error: 'Internal server error deleting fact',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/documents/facts/batches/:batchId
 * Get a specific extraction batch by ID
 */
router.get('/facts/batches/:batchId', async (req: Request, res: Response) => {
  try {
    const batchId = req.params.batchId;
    if (!batchId) {
      res.status(400).json({ error: 'Batch ID is required' });
      return;
    }

    const batch = await getBatch(batchId);
    if (!batch) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    res.json({
      success: true,
      batch,
    });
  } catch (error) {
    console.error('Get batch error:', error);
    res.status(500).json({
      error: 'Internal server error getting batch',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
