-- Scratchpad: Short-term working memory for Squire
-- Stores active threads, observations, questions, ideas, and contextual notes
-- Different from notes (which are user-authored)

CREATE TYPE scratchpad_entry_type AS ENUM (
  'thread',       -- Active things being tracked
  'observation',  -- Things noticed but not to blurt out
  'question',     -- Questions to ask when timing is right
  'idea',         -- Ideas for features or improvements
  'context'       -- Short-term situational context
);

CREATE TABLE IF NOT EXISTS scratchpad (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Core content
  entry_type scratchpad_entry_type NOT NULL,
  content TEXT NOT NULL,

  -- Organization
  metadata JSONB DEFAULT '{}',              -- Tags, related entities, custom data
  priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                   -- For context entries that should auto-expire
  resolved_at TIMESTAMPTZ                   -- When thread closed or question answered
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_scratchpad_type ON scratchpad (entry_type);
CREATE INDEX IF NOT EXISTS idx_scratchpad_priority ON scratchpad (priority DESC);
CREATE INDEX IF NOT EXISTS idx_scratchpad_created ON scratchpad (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scratchpad_expires ON scratchpad (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scratchpad_resolved ON scratchpad (resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scratchpad_active ON scratchpad (entry_type, created_at DESC) WHERE resolved_at IS NULL;

-- GIN index for metadata JSONB queries
CREATE INDEX IF NOT EXISTS idx_scratchpad_metadata ON scratchpad USING GIN (metadata);

COMMENT ON TABLE scratchpad IS 'Short-term working memory for Squire - threads, observations, questions, ideas, context';
COMMENT ON COLUMN scratchpad.entry_type IS 'Type of entry: thread, observation, question, idea, context';
COMMENT ON COLUMN scratchpad.metadata IS 'Optional tags, related entities, custom data as JSON';
COMMENT ON COLUMN scratchpad.priority IS 'Priority 1-5 (1 highest, 5 lowest), default 3';
COMMENT ON COLUMN scratchpad.expires_at IS 'Auto-expiration for context entries';
COMMENT ON COLUMN scratchpad.resolved_at IS 'When entry was resolved/closed (null = active)';
