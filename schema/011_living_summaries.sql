-- Living Summaries: Evolving distilled understanding by category
-- Maintains incremental summaries that compound over time

CREATE TABLE IF NOT EXISTS living_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Category (one summary per category)
  category VARCHAR(50) NOT NULL UNIQUE,

  -- The summary content
  content TEXT NOT NULL DEFAULT '',

  -- Version tracking for incremental updates
  version INTEGER NOT NULL DEFAULT 1,

  -- Memory tracking
  memory_count INTEGER NOT NULL DEFAULT 0,          -- how many memories contributed
  last_memory_at TIMESTAMPTZ,                       -- timestamp of newest memory incorporated

  -- Update metadata
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_update_model VARCHAR(100),                   -- which LLM model generated this version
  last_update_tokens INTEGER DEFAULT 0,             -- tokens used in last update

  -- Quality signals
  confidence FLOAT DEFAULT 0.8,                     -- how confident we are in this summary
  staleness_score FLOAT DEFAULT 0.0,                -- 0 = fresh, 1 = very stale

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_category CHECK (category IN (
    'personality',    -- identity, self-story, who you are
    'goals',          -- aspirations, what you're working toward
    'relationships',  -- people, social connections
    'projects',       -- active work, tasks
    'interests',      -- hobbies, passions
    'wellbeing',      -- health, mood, emotional patterns
    'commitments'     -- promises, obligations
  )),
  CONSTRAINT valid_confidence CHECK (confidence >= 0.0 AND confidence <= 1.0),
  CONSTRAINT valid_staleness CHECK (staleness_score >= 0.0 AND staleness_score <= 1.0)
);

-- Junction table: which memories touch which summaries
-- Used for incremental updates and traceability
CREATE TABLE IF NOT EXISTS memory_summary_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  summary_category VARCHAR(50) NOT NULL REFERENCES living_summaries(category) ON DELETE CASCADE,

  -- How strongly this memory relates to this category
  relevance_score FLOAT NOT NULL DEFAULT 0.5,

  -- Was this memory incorporated into the summary?
  incorporated BOOLEAN DEFAULT FALSE,
  incorporated_at TIMESTAMPTZ,
  incorporated_version INTEGER,        -- which summary version included this

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_relevance CHECK (relevance_score >= 0.0 AND relevance_score <= 1.0),
  CONSTRAINT unique_memory_category UNIQUE (memory_id, summary_category)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_summaries_category ON living_summaries (category);
CREATE INDEX IF NOT EXISTS idx_summaries_updated ON living_summaries (last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_summaries_staleness ON living_summaries (staleness_score DESC);

CREATE INDEX IF NOT EXISTS idx_summary_links_memory ON memory_summary_links (memory_id);
CREATE INDEX IF NOT EXISTS idx_summary_links_category ON memory_summary_links (summary_category);
CREATE INDEX IF NOT EXISTS idx_summary_links_unincorporated ON memory_summary_links (summary_category, incorporated)
  WHERE incorporated = FALSE;

-- Initialize all categories with empty summaries
INSERT INTO living_summaries (category, content) VALUES
  ('personality', ''),
  ('goals', ''),
  ('relationships', ''),
  ('projects', ''),
  ('interests', ''),
  ('wellbeing', ''),
  ('commitments', '')
ON CONFLICT (category) DO NOTHING;

COMMENT ON TABLE living_summaries IS 'Evolving summaries by category - distilled understanding that compounds over time';
COMMENT ON COLUMN living_summaries.category IS 'One of: personality, goals, relationships, projects, interests, wellbeing, commitments';
COMMENT ON COLUMN living_summaries.staleness_score IS 'Increases when new memories arrive but summary not yet updated';
COMMENT ON TABLE memory_summary_links IS 'Links memories to the summaries they should update';
