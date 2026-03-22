-- Document Chunks: Stores chunked document content for RAG retrieval
-- Each document (object) is split into semantic chunks with embeddings

-- ============================================================================
-- DOCUMENT_CHUNKS: Chunked document content for semantic search
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Link to source document
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,

  -- Chunk ordering
  chunk_index INTEGER NOT NULL,

  -- Chunk content
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,

  -- Position metadata (optional)
  page_number INTEGER,                   -- Page number in source document (1-indexed)
  section_title TEXT,                    -- Heading/section this chunk belongs to

  -- Chunking strategy used
  chunking_strategy VARCHAR(20) DEFAULT 'hybrid',

  -- Embedding for semantic search (768-dim for nomic-embed-text)
  embedding vector(768),

  -- Flexible metadata (e.g., start/end character positions, overlap info)
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure unique chunk ordering per document
  CONSTRAINT unique_object_chunk UNIQUE (object_id, chunk_index),

  -- Valid chunking strategies
  CONSTRAINT valid_chunking_strategy CHECK (chunking_strategy IN (
    'fixed',      -- Fixed token count with overlap
    'semantic',   -- Paragraph/section boundary aware
    'hybrid'      -- Semantic with max size enforcement
  ))
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Fast lookup by source document
CREATE INDEX IF NOT EXISTS idx_document_chunks_object
  ON document_chunks (object_id);

-- Order chunks within a document
CREATE INDEX IF NOT EXISTS idx_document_chunks_order
  ON document_chunks (object_id, chunk_index);

-- HNSW index for fast vector similarity search
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
  ON document_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- Filter by page for document-specific searches
CREATE INDEX IF NOT EXISTS idx_document_chunks_page
  ON document_chunks (object_id, page_number)
  WHERE page_number IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE document_chunks IS 'Chunked document content for RAG semantic search';
COMMENT ON COLUMN document_chunks.object_id IS 'Source document from objects table';
COMMENT ON COLUMN document_chunks.chunk_index IS 'Order of chunk within document (0-indexed)';
COMMENT ON COLUMN document_chunks.content IS 'Text content of this chunk';
COMMENT ON COLUMN document_chunks.token_count IS 'Token count (for context window management)';
COMMENT ON COLUMN document_chunks.page_number IS 'Source page number (1-indexed, for PDF/DOCX)';
COMMENT ON COLUMN document_chunks.section_title IS 'Heading/section title if detected';
COMMENT ON COLUMN document_chunks.chunking_strategy IS 'Strategy used: fixed, semantic, or hybrid';
COMMENT ON COLUMN document_chunks.embedding IS 'Vector embedding (768-dim nomic-embed-text)';
COMMENT ON COLUMN document_chunks.metadata IS 'Additional metadata (positions, overlap, etc)';
