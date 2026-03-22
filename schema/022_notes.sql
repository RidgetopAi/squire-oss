-- Notes: User-authored notes with entity relationships
-- Integrates with memory graph for contextual retrieval
-- Supports: manual, voice, chat, calendar_event sources

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Core content
  title VARCHAR(500),                      -- Optional title (can be null for quick notes)
  content TEXT NOT NULL,                   -- The note body (markdown supported)
  
  -- Underlying memory (notes create memories for graph integration)
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,
  
  -- Source tracking
  source_type VARCHAR(20) NOT NULL DEFAULT 'manual',  -- 'manual' | 'voice' | 'chat' | 'calendar_event'
  source_context JSONB DEFAULT '{}',       -- e.g., {calendar_event_id: "...", meeting_title: "..."}
  
  -- Entity relationships (denormalized for quick access, canonical in entity_mentions)
  primary_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  entity_ids UUID[] DEFAULT '{}',          -- All linked entities
  
  -- Organization
  category VARCHAR(100),                   -- 'work' | 'personal' | 'health' | 'project' | custom
  tags TEXT[] DEFAULT '{}',
  is_pinned BOOLEAN DEFAULT FALSE,
  
  -- Display
  color VARCHAR(20),                       -- Optional color coding
  
  -- Embedding for semantic search
  embedding vector(768),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Soft delete
  archived_at TIMESTAMPTZ,
  
  CONSTRAINT valid_note_source CHECK (source_type IN ('manual', 'voice', 'chat', 'calendar_event'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notes_memory ON notes (memory_id);
CREATE INDEX IF NOT EXISTS idx_notes_primary_entity ON notes (primary_entity_id);
CREATE INDEX IF NOT EXISTS idx_notes_category ON notes (category);
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes (is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes (archived_at) WHERE archived_at IS NULL;

-- Vector search
CREATE INDEX IF NOT EXISTS idx_notes_embedding ON notes 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN index for entity_ids array
CREATE INDEX IF NOT EXISTS idx_notes_entities ON notes USING GIN (entity_ids);

-- GIN index for tags array
CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes USING GIN (tags);

COMMENT ON TABLE notes IS 'User-authored notes with entity relationships for contextual retrieval';
COMMENT ON COLUMN notes.primary_entity_id IS 'Main entity this note is about (e.g., "Central Va Flooring")';
COMMENT ON COLUMN notes.entity_ids IS 'All entities mentioned in or linked to this note';
COMMENT ON COLUMN notes.source_type IS 'How this note was created: manual, voice, chat, or calendar_event';
COMMENT ON COLUMN notes.source_context IS 'Additional context about source (e.g., calendar event ID, meeting title)';
