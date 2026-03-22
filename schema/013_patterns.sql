-- Patterns: Recurring behaviors, temporal rhythms, and emotional tendencies
-- Detected across multiple memories over time

CREATE TABLE IF NOT EXISTS patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- The pattern description
  content TEXT NOT NULL,                      -- "Tends to procrastinate on complex tasks"

  -- Classification
  pattern_type VARCHAR(30) NOT NULL,

  -- Optional entity reference (patterns about specific people/projects)
  related_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,

  -- Strength metrics
  confidence FLOAT NOT NULL DEFAULT 0.5,      -- how certain we are this pattern exists
  frequency FLOAT DEFAULT 0.5,                -- how often it occurs (0=rare, 1=constant)

  -- Time characteristics (for temporal patterns)
  time_of_day VARCHAR(20),                    -- morning, afternoon, evening, night
  day_of_week VARCHAR(20),                    -- monday, tuesday, etc. or weekend/weekday
  time_span_days INTEGER,                     -- pattern observed over N days

  -- Evidence tracking
  source_memory_count INTEGER DEFAULT 1,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ,
  observation_count INTEGER DEFAULT 1,

  -- Status
  status VARCHAR(20) DEFAULT 'active',
  dormant_since TIMESTAMPTZ,                  -- when pattern stopped appearing

  -- Extraction metadata
  detected_by_model VARCHAR(100),
  detection_prompt_version VARCHAR(20),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_confidence CHECK (confidence >= 0.0 AND confidence <= 1.0),
  CONSTRAINT valid_frequency CHECK (frequency >= 0.0 AND frequency <= 1.0),
  CONSTRAINT valid_pattern_type CHECK (pattern_type IN (
    'behavioral',    -- recurring actions/habits ("checks email first thing")
    'temporal',      -- time-based rhythms ("most productive afternoons")
    'emotional',     -- emotional tendencies ("anxious before presentations")
    'social',        -- interaction patterns ("avoids large meetings")
    'cognitive',     -- thinking patterns ("overthinks decisions")
    'physical'       -- body/health patterns ("tired after lunch")
  )),
  CONSTRAINT valid_status CHECK (status IN ('active', 'dormant', 'disproven')),
  CONSTRAINT valid_time_of_day CHECK (time_of_day IS NULL OR time_of_day IN (
    'early_morning', 'morning', 'midday', 'afternoon', 'evening', 'night', 'late_night'
  )),
  CONSTRAINT valid_day_of_week CHECK (day_of_week IS NULL OR day_of_week IN (
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'weekday', 'weekend'
  ))
);

-- Junction table: which memories demonstrate which patterns
CREATE TABLE IF NOT EXISTS pattern_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  pattern_id UUID NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,

  -- How strongly this memory demonstrates the pattern (0.0-1.0)
  evidence_strength FLOAT NOT NULL DEFAULT 0.5,

  -- Evidence type
  evidence_type VARCHAR(20) DEFAULT 'demonstrates',

  -- When in the memory's timeline this occurred
  memory_timestamp TIMESTAMPTZ,               -- from memory.created_at or explicit timestamp

  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_strength CHECK (evidence_strength >= 0.0 AND evidence_strength <= 1.0),
  CONSTRAINT valid_evidence_type CHECK (evidence_type IN (
    'demonstrates',    -- memory shows the pattern
    'contradicts',     -- memory goes against the pattern
    'triggers',        -- memory triggers the pattern
    'context'          -- memory provides context for understanding
  )),
  CONSTRAINT unique_pattern_memory UNIQUE (pattern_id, memory_id)
);

-- Pattern clusters: group related patterns
CREATE TABLE IF NOT EXISTS pattern_clusters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name VARCHAR(100) NOT NULL,                 -- "Morning Routine", "Work Stress Response"
  description TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Junction: patterns to clusters (many-to-many)
CREATE TABLE IF NOT EXISTS pattern_cluster_members (
  pattern_id UUID NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  cluster_id UUID NOT NULL REFERENCES pattern_clusters(id) ON DELETE CASCADE,

  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (pattern_id, cluster_id)
);

-- Indexes for patterns
CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns (pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_status ON patterns (status);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns (confidence DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_entity ON patterns (related_entity_id) WHERE related_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patterns_observed ON patterns (last_observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_time_of_day ON patterns (time_of_day) WHERE time_of_day IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patterns_day_of_week ON patterns (day_of_week) WHERE day_of_week IS NOT NULL;

-- Indexes for evidence
CREATE INDEX IF NOT EXISTS idx_pattern_evidence_pattern ON pattern_evidence (pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_evidence_memory ON pattern_evidence (memory_id);
CREATE INDEX IF NOT EXISTS idx_pattern_evidence_timestamp ON pattern_evidence (memory_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pattern_evidence_type ON pattern_evidence (evidence_type);

-- Indexes for clusters
CREATE INDEX IF NOT EXISTS idx_pattern_cluster_members_cluster ON pattern_cluster_members (cluster_id);

-- Comments
COMMENT ON TABLE patterns IS 'Recurring behaviors, temporal rhythms, and emotional tendencies detected from memories';
COMMENT ON COLUMN patterns.pattern_type IS 'Category: behavioral, temporal, emotional, social, cognitive, physical';
COMMENT ON COLUMN patterns.confidence IS 'How certain the pattern exists (0.0-1.0), increases with evidence';
COMMENT ON COLUMN patterns.frequency IS 'How often pattern occurs (0.0=rare, 1.0=constant)';
COMMENT ON COLUMN patterns.time_of_day IS 'For temporal patterns: when in the day this occurs';
COMMENT ON COLUMN patterns.status IS 'active, dormant (not seen recently), or disproven';

COMMENT ON TABLE pattern_evidence IS 'Links memories to the patterns they demonstrate';
COMMENT ON COLUMN pattern_evidence.evidence_strength IS 'How strongly this memory demonstrates the pattern';
COMMENT ON COLUMN pattern_evidence.evidence_type IS 'demonstrates, contradicts, triggers, or provides context';

COMMENT ON TABLE pattern_clusters IS 'Groups of related patterns (e.g., "Morning Routine")';
