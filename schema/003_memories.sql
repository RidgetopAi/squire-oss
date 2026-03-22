-- Memories: The atomic unit of Squire
-- Every piece of processed information the AI knows

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Link to raw input (enables reprocessing)
  raw_observation_id UUID REFERENCES raw_observations(id) ON DELETE SET NULL,

  -- Content
  content TEXT NOT NULL,
  content_type VARCHAR(50) NOT NULL DEFAULT 'text',
  source VARCHAR(50) NOT NULL DEFAULT 'cli',
  source_metadata JSONB DEFAULT '{}',

  -- Embeddings (added in Slice 1, nullable for now)
  -- embedding vector(1536),

  -- Salience (THE KEY DIFFERENTIATOR)
  salience_score FLOAT NOT NULL DEFAULT 5.0,
  salience_factors JSONB DEFAULT '{}',

  -- Temporal
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurred_at TIMESTAMPTZ,

  -- Decay & Access (used in later slices)
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  current_strength FLOAT DEFAULT 1.0,

  -- Processing Status
  processing_status VARCHAR(20) DEFAULT 'pending',
  processed_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_salience CHECK (salience_score >= 0.0 AND salience_score <= 10.0),
  CONSTRAINT valid_strength CHECK (current_strength >= 0.0 AND current_strength <= 1.0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_salience ON memories (salience_score DESC);
CREATE INDEX IF NOT EXISTS idx_memories_source ON memories (source);
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories (processing_status);

COMMENT ON TABLE memories IS 'The atomic unit of Squire - every piece of processed information the AI knows';
