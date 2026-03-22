-- Object Storage: Files, images, documents attached to memories and entities
-- Supports any file type with flexible metadata and linking

-- ============================================================================
-- OBJECTS: The main object storage table
-- ============================================================================

CREATE TABLE IF NOT EXISTS objects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- File identity
  name VARCHAR(255) NOT NULL,               -- Display name (e.g., "Meeting notes photo")
  filename VARCHAR(255) NOT NULL,           -- Original filename

  -- File characteristics
  mime_type VARCHAR(100) NOT NULL,          -- e.g., "image/jpeg", "application/pdf"
  size_bytes BIGINT NOT NULL,               -- File size in bytes
  hash_sha256 VARCHAR(64),                  -- SHA-256 hash for deduplication

  -- Storage location
  storage_type VARCHAR(30) NOT NULL DEFAULT 'local',  -- local, s3, url
  storage_path TEXT NOT NULL,               -- Relative path or URL

  -- Classification
  object_type VARCHAR(30) NOT NULL,         -- image, document, audio, video, archive, other

  -- Optional processing results (for images, PDFs, etc.)
  extracted_text TEXT,                      -- OCR or extracted text content
  description TEXT,                         -- AI-generated or manual description
  metadata JSONB DEFAULT '{}',              -- Flexible metadata (dimensions, duration, etc.)

  -- Embedding for semantic search (optional, from description/content)
  embedding vector(768),

  -- Processing status
  processing_status VARCHAR(20) DEFAULT 'pending',
  processing_error TEXT,
  processed_at TIMESTAMPTZ,

  -- Thumbnail/preview (for visual objects)
  thumbnail_path TEXT,                      -- Path to generated thumbnail

  -- Source tracking
  source VARCHAR(50) DEFAULT 'upload',      -- upload, import, extract, generate
  source_url TEXT,                          -- Original URL if imported

  -- Status
  status VARCHAR(20) DEFAULT 'active',
  deleted_at TIMESTAMPTZ,                   -- Soft delete

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_object_type CHECK (object_type IN (
    'image',        -- photos, screenshots, diagrams
    'document',     -- PDFs, Word docs, text files
    'audio',        -- voice memos, recordings
    'video',        -- screen recordings, clips
    'archive',      -- zip, tar files
    'other'         -- anything else
  )),
  CONSTRAINT valid_storage_type CHECK (storage_type IN ('local', 's3', 'url')),
  CONSTRAINT valid_source CHECK (source IN ('upload', 'import', 'extract', 'generate')),
  CONSTRAINT valid_status CHECK (status IN ('active', 'archived', 'deleted')),
  CONSTRAINT valid_processing_status CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'))
);

-- ============================================================================
-- OBJECT-MEMORY LINKS: Connect objects to memories
-- ============================================================================

CREATE TABLE IF NOT EXISTS object_memory_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,

  -- How this object relates to the memory
  link_type VARCHAR(30) DEFAULT 'attachment',

  -- Importance (0.0-1.0)
  relevance FLOAT DEFAULT 0.5,

  -- Context
  notes TEXT,                               -- Why this object is linked

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_link_type CHECK (link_type IN (
    'attachment',   -- object is attached to memory
    'source',       -- memory was created from this object (e.g., OCR'd document)
    'reference',    -- memory references this object
    'illustration'  -- object illustrates the memory content
  )),
  CONSTRAINT valid_relevance CHECK (relevance >= 0.0 AND relevance <= 1.0),
  CONSTRAINT unique_object_memory UNIQUE (object_id, memory_id)
);

-- ============================================================================
-- OBJECT-ENTITY LINKS: Connect objects to entities
-- ============================================================================

CREATE TABLE IF NOT EXISTS object_entity_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- How this object relates to the entity
  link_type VARCHAR(30) DEFAULT 'depicts',

  -- Confidence (0.0-1.0, for auto-detected links)
  confidence FLOAT DEFAULT 0.5,

  -- Context
  notes TEXT,

  -- Detection method
  detection_method VARCHAR(30) DEFAULT 'manual',  -- manual, face_detection, mention, llm

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_entity_link_type CHECK (link_type IN (
    'depicts',      -- object shows this entity (e.g., photo of person)
    'represents',   -- object represents entity (e.g., company logo)
    'created_by',   -- entity created this object
    'about',        -- object is about this entity (e.g., document about project)
    'owned_by'      -- entity owns/possesses this object
  )),
  CONSTRAINT valid_entity_confidence CHECK (confidence >= 0.0 AND confidence <= 1.0),
  CONSTRAINT valid_detection_method CHECK (detection_method IN ('manual', 'face_detection', 'mention', 'llm', 'import')),
  CONSTRAINT unique_object_entity UNIQUE (object_id, entity_id, link_type)
);

-- ============================================================================
-- OBJECT TAGS: Flexible tagging for organization
-- ============================================================================

CREATE TABLE IF NOT EXISTS object_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,

  tag VARCHAR(100) NOT NULL,                -- Tag name (lowercase normalized)

  -- Tag source
  source VARCHAR(20) DEFAULT 'user',        -- user, auto, import

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_tag_source CHECK (source IN ('user', 'auto', 'import')),
  CONSTRAINT unique_object_tag UNIQUE (object_id, tag)
);

-- ============================================================================
-- OBJECT COLLECTIONS: Group objects together (optional, for organization)
-- ============================================================================

CREATE TABLE IF NOT EXISTS object_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Optional cover image
  cover_object_id UUID REFERENCES objects(id) ON DELETE SET NULL,

  -- Metadata
  object_count INTEGER DEFAULT 0,           -- Denormalized for performance

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS object_collection_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  collection_id UUID NOT NULL REFERENCES object_collections(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,

  -- Order within collection
  position INTEGER DEFAULT 0,

  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_collection_object UNIQUE (collection_id, object_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Objects indexes
CREATE INDEX IF NOT EXISTS idx_objects_name ON objects (name);
CREATE INDEX IF NOT EXISTS idx_objects_type ON objects (object_type);
CREATE INDEX IF NOT EXISTS idx_objects_mime ON objects (mime_type);
CREATE INDEX IF NOT EXISTS idx_objects_hash ON objects (hash_sha256) WHERE hash_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_objects_status ON objects (status);
CREATE INDEX IF NOT EXISTS idx_objects_processing ON objects (processing_status);
CREATE INDEX IF NOT EXISTS idx_objects_created ON objects (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_objects_active ON objects (status, created_at DESC) WHERE status = 'active';

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_objects_embedding ON objects
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- Object-memory links indexes
CREATE INDEX IF NOT EXISTS idx_object_memory_object ON object_memory_links (object_id);
CREATE INDEX IF NOT EXISTS idx_object_memory_memory ON object_memory_links (memory_id);
CREATE INDEX IF NOT EXISTS idx_object_memory_type ON object_memory_links (link_type);

-- Object-entity links indexes
CREATE INDEX IF NOT EXISTS idx_object_entity_object ON object_entity_links (object_id);
CREATE INDEX IF NOT EXISTS idx_object_entity_entity ON object_entity_links (entity_id);
CREATE INDEX IF NOT EXISTS idx_object_entity_type ON object_entity_links (link_type);

-- Tags indexes
CREATE INDEX IF NOT EXISTS idx_object_tags_object ON object_tags (object_id);
CREATE INDEX IF NOT EXISTS idx_object_tags_tag ON object_tags (tag);

-- Collections indexes
CREATE INDEX IF NOT EXISTS idx_collections_name ON object_collections (name);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON object_collection_items (collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_object ON object_collection_items (object_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_position ON object_collection_items (collection_id, position);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE objects IS 'Stored files, images, documents with metadata and processing results';
COMMENT ON COLUMN objects.object_type IS 'Category: image, document, audio, video, archive, other';
COMMENT ON COLUMN objects.storage_type IS 'Where file is stored: local filesystem, S3, or external URL';
COMMENT ON COLUMN objects.extracted_text IS 'Text extracted via OCR or document parsing';
COMMENT ON COLUMN objects.processing_status IS 'pending, processing, completed, failed, skipped';

COMMENT ON TABLE object_memory_links IS 'Links objects to memories (attachment, source, reference, illustration)';
COMMENT ON COLUMN object_memory_links.link_type IS 'attachment, source (memory from object), reference, illustration';

COMMENT ON TABLE object_entity_links IS 'Links objects to entities (depicts, represents, created_by, about, owned_by)';
COMMENT ON COLUMN object_entity_links.detection_method IS 'How link was detected: manual, face_detection, mention, llm, import';

COMMENT ON TABLE object_tags IS 'Flexible tags for organizing objects';
COMMENT ON COLUMN object_tags.source IS 'user (manual), auto (system-generated), import';

COMMENT ON TABLE object_collections IS 'Named groups of objects (albums, folders)';
COMMENT ON TABLE object_collection_items IS 'Objects within a collection with ordering';
