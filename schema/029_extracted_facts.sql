-- 029_extracted_facts.sql
-- Phase 6: Document Intelligence - Fact Extraction Service
--
-- Stores facts, entities, dates, and relationships extracted from document chunks.
-- These are "pending" extractions that go through review before becoming memories.

-- === FACT STATUS ===
-- pending: Newly extracted, awaiting review
-- approved: Reviewed and approved, ready for memory creation
-- rejected: Reviewed and rejected, won't become memory
-- merged: Combined with another fact during review
-- auto_approved: High confidence, auto-approved based on rules

CREATE TYPE fact_status AS ENUM ('pending', 'approved', 'rejected', 'merged', 'auto_approved');

-- === FACT TYPES ===
-- biographical: Personal info about user or people (name, age, occupation)
-- event: Something that happened (meeting, trip, accomplishment)
-- relationship: Connection between entities (works at, married to)
-- preference: User likes/dislikes (favorite food, preferred tools)
-- statement: General factual statement from document
-- date: Significant date extracted (anniversary, deadline, birthday)
-- location: Geographic information
-- organization: Company, institution, group information

CREATE TYPE fact_type AS ENUM (
  'biographical',
  'event',
  'relationship',
  'preference',
  'statement',
  'date',
  'location',
  'organization'
);

-- === EXTRACTED FACTS TABLE ===
CREATE TABLE extracted_facts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Source tracking
  chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,

  -- Fact content
  fact_type fact_type NOT NULL,
  content TEXT NOT NULL,                    -- The extracted fact statement
  raw_text TEXT NOT NULL,                   -- Original text from chunk that led to extraction

  -- Confidence and review
  confidence NUMERIC(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status fact_status NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,

  -- Extracted entities (stored as JSONB for flexibility)
  -- Each entity: {name, type, role, confidence}
  entities JSONB DEFAULT '[]',

  -- Extracted dates (stored as JSONB for flexibility)
  -- Each date: {date, type, confidence, raw_text}
  dates JSONB DEFAULT '[]',

  -- Relationships between entities
  -- Each relationship: {subject, predicate, object, confidence}
  relationships JSONB DEFAULT '[]',

  -- Source attribution for provenance
  source_page INTEGER,                      -- Page number if available
  source_section TEXT,                      -- Section title if available
  position_start INTEGER,                   -- Start position in chunk
  position_end INTEGER,                     -- End position in chunk

  -- Link to created memory (after approval)
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,

  -- Merge tracking
  merged_into_id UUID REFERENCES extracted_facts(id) ON DELETE SET NULL,

  -- Metadata
  extraction_model TEXT,                    -- LLM model used
  extraction_prompt_version TEXT,           -- Version of extraction prompt
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === INDEXES ===

-- Fast lookup by source chunk/document
CREATE INDEX idx_extracted_facts_chunk ON extracted_facts(chunk_id);
CREATE INDEX idx_extracted_facts_object ON extracted_facts(object_id);

-- Filter by status for review queue
CREATE INDEX idx_extracted_facts_status ON extracted_facts(status);

-- Filter by type
CREATE INDEX idx_extracted_facts_type ON extracted_facts(fact_type);

-- Filter by confidence for auto-approval
CREATE INDEX idx_extracted_facts_confidence ON extracted_facts(confidence);

-- Filter pending facts by date (review queue ordering)
CREATE INDEX idx_extracted_facts_pending_date ON extracted_facts(created_at)
  WHERE status = 'pending';

-- GIN indexes for JSONB querying
CREATE INDEX idx_extracted_facts_entities ON extracted_facts USING GIN(entities);
CREATE INDEX idx_extracted_facts_dates ON extracted_facts USING GIN(dates);
CREATE INDEX idx_extracted_facts_relationships ON extracted_facts USING GIN(relationships);

-- === TRIGGER FOR updated_at ===
CREATE TRIGGER update_extracted_facts_timestamp
  BEFORE UPDATE ON extracted_facts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- === FACT EXTRACTION BATCHES ===
-- Track batch extraction jobs for progress monitoring

CREATE TABLE fact_extraction_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,

  -- Progress tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_chunks INTEGER NOT NULL DEFAULT 0,
  processed_chunks INTEGER NOT NULL DEFAULT 0,
  facts_extracted INTEGER NOT NULL DEFAULT 0,
  facts_auto_approved INTEGER NOT NULL DEFAULT 0,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Error tracking
  error_message TEXT,
  failed_chunks JSONB DEFAULT '[]',

  -- Configuration used
  config JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fact_extraction_batches_object ON fact_extraction_batches(object_id);
CREATE INDEX idx_fact_extraction_batches_status ON fact_extraction_batches(status);

CREATE TRIGGER update_fact_extraction_batches_timestamp
  BEFORE UPDATE ON fact_extraction_batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- === COMMENTS ===
COMMENT ON TABLE extracted_facts IS 'Facts extracted from document chunks via LLM, pending review before memory creation';
COMMENT ON COLUMN extracted_facts.content IS 'The extracted fact as a clear statement';
COMMENT ON COLUMN extracted_facts.raw_text IS 'Original text snippet from document that contains the fact';
COMMENT ON COLUMN extracted_facts.entities IS 'JSON array of entities extracted: [{name, type, role, confidence}]';
COMMENT ON COLUMN extracted_facts.dates IS 'JSON array of dates extracted: [{date, type, confidence, raw_text}]';
COMMENT ON COLUMN extracted_facts.relationships IS 'JSON array of entity relationships: [{subject, predicate, object, confidence}]';
COMMENT ON TABLE fact_extraction_batches IS 'Tracks batch fact extraction jobs for progress monitoring';
