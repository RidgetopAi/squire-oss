-- Sessions: Track consolidation periods
-- Each session represents a working period after which consolidation runs

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Session timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,

  -- Session metadata
  session_type VARCHAR(50) DEFAULT 'interactive',
  metadata JSONB DEFAULT '{}',

  -- Consolidation tracking
  consolidation_status VARCHAR(20) DEFAULT 'pending',
  consolidated_at TIMESTAMPTZ,

  -- Statistics (populated during consolidation)
  stats JSONB DEFAULT '{}',

  -- Constraints
  CONSTRAINT valid_session_type CHECK (session_type IN ('interactive', 'batch', 'system')),
  CONSTRAINT valid_consolidation_status CHECK (consolidation_status IN ('pending', 'in_progress', 'completed', 'failed'))
);

-- Track which session a memory was created in
ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (consolidation_status);
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories (session_id);

COMMENT ON TABLE sessions IS 'Track working periods for consolidation scheduling';
COMMENT ON COLUMN sessions.consolidation_status IS 'pending = needs consolidation, completed = done';
COMMENT ON COLUMN sessions.stats IS 'Consolidation stats: memories_decayed, memories_strengthened, edges_created, edges_pruned';
