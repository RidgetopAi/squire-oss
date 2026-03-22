-- Raw observations: Immutable input layer
-- Stores inputs exactly as received for provenance and reprocessing

CREATE TABLE IF NOT EXISTS raw_observations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content TEXT NOT NULL,
  content_type VARCHAR(50) NOT NULL DEFAULT 'text',
  source VARCHAR(50) NOT NULL DEFAULT 'cli',
  source_metadata JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_obs_created ON raw_observations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_obs_source ON raw_observations (source);

COMMENT ON TABLE raw_observations IS 'Immutable input layer - preserves original observations for reprocessing';
