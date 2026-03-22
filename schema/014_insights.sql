-- Insights: Higher-level deductions from analyzing patterns, beliefs, and memories together
-- Generated during consolidation by cross-referencing different data types

CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- The insight statement
  content TEXT NOT NULL,                      -- "Your productivity correlates with sleep schedule"

  -- Classification
  insight_type VARCHAR(30) NOT NULL,

  -- Importance/urgency
  priority VARCHAR(20) DEFAULT 'medium',

  -- Confidence (0.0-1.0, how certain this insight is valid)
  confidence FLOAT NOT NULL DEFAULT 0.5,

  -- Status lifecycle
  status VARCHAR(20) DEFAULT 'active',
  dismissed_reason TEXT,                      -- why user dismissed (if dismissed)
  actioned_at TIMESTAMPTZ,                    -- when user acted on it

  -- Generation metadata
  generated_by_model VARCHAR(100),
  generation_prompt_version VARCHAR(20),

  -- Staleness tracking
  last_validated_at TIMESTAMPTZ DEFAULT NOW(), -- when insight was last confirmed still valid
  validation_count INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_confidence CHECK (confidence >= 0.0 AND confidence <= 1.0),
  CONSTRAINT valid_insight_type CHECK (insight_type IN (
    'connection',      -- links between related concepts/patterns
    'contradiction',   -- inconsistencies between beliefs and behaviors
    'opportunity',     -- potential improvements or optimizations
    'warning'          -- flags potential issues or risks
  )),
  CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT valid_status CHECK (status IN ('active', 'dismissed', 'actioned', 'stale'))
);

-- Junction table: sources that contributed to this insight
-- Supports multiple source types (polymorphic references)
CREATE TABLE IF NOT EXISTS insight_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  insight_id UUID NOT NULL REFERENCES insights(id) ON DELETE CASCADE,

  -- Polymorphic reference to source
  source_type VARCHAR(20) NOT NULL,           -- 'memory', 'belief', 'pattern'
  source_id UUID NOT NULL,                    -- ID of the source record

  -- How this source contributed
  contribution_type VARCHAR(30) DEFAULT 'supports',
  contribution_strength FLOAT NOT NULL DEFAULT 0.5,

  -- Brief explanation of how this source relates
  explanation TEXT,

  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_source_type CHECK (source_type IN ('memory', 'belief', 'pattern')),
  CONSTRAINT valid_contribution_type CHECK (contribution_type IN (
    'supports',        -- source supports the insight
    'primary',         -- primary evidence for the insight
    'context',         -- provides context
    'contrasts'        -- shows the contrast (for contradictions)
  )),
  CONSTRAINT valid_contribution_strength CHECK (contribution_strength >= 0.0 AND contribution_strength <= 1.0),
  CONSTRAINT unique_insight_source UNIQUE (insight_id, source_type, source_id)
);

-- Related insights (insights that connect to each other)
CREATE TABLE IF NOT EXISTS insight_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  insight_a_id UUID NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
  insight_b_id UUID NOT NULL REFERENCES insights(id) ON DELETE CASCADE,

  relation_type VARCHAR(30) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_relation_type CHECK (relation_type IN (
    'reinforces',      -- insights support each other
    'contradicts',     -- insights are in tension
    'extends',         -- one insight extends/elaborates another
    'supersedes'       -- newer insight replaces older
  )),
  CONSTRAINT different_insights CHECK (insight_a_id != insight_b_id),
  CONSTRAINT unique_relation UNIQUE (insight_a_id, insight_b_id)
);

-- Indexes for insights
CREATE INDEX IF NOT EXISTS idx_insights_type ON insights (insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_status ON insights (status);
CREATE INDEX IF NOT EXISTS idx_insights_priority ON insights (priority);
CREATE INDEX IF NOT EXISTS idx_insights_confidence ON insights (confidence DESC);
CREATE INDEX IF NOT EXISTS idx_insights_created ON insights (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_active ON insights (status, priority DESC)
  WHERE status = 'active';

-- Indexes for sources
CREATE INDEX IF NOT EXISTS idx_insight_sources_insight ON insight_sources (insight_id);
CREATE INDEX IF NOT EXISTS idx_insight_sources_source ON insight_sources (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_insight_sources_type ON insight_sources (source_type);

-- Indexes for relations
CREATE INDEX IF NOT EXISTS idx_insight_relations_a ON insight_relations (insight_a_id);
CREATE INDEX IF NOT EXISTS idx_insight_relations_b ON insight_relations (insight_b_id);

-- Comments
COMMENT ON TABLE insights IS 'Higher-level deductions from cross-analyzing patterns, beliefs, and memories';
COMMENT ON COLUMN insights.insight_type IS 'Category: connection, contradiction, opportunity, warning';
COMMENT ON COLUMN insights.confidence IS 'How certain this insight is valid (0.0-1.0)';
COMMENT ON COLUMN insights.priority IS 'Importance: low, medium, high, critical';
COMMENT ON COLUMN insights.status IS 'active, dismissed (by user), actioned (user acted), stale (outdated)';

COMMENT ON TABLE insight_sources IS 'Links insights to their source evidence (memories, beliefs, patterns)';
COMMENT ON COLUMN insight_sources.source_type IS 'Type of source: memory, belief, or pattern';
COMMENT ON COLUMN insight_sources.contribution_type IS 'How source contributes: supports, primary, context, contrasts';

COMMENT ON TABLE insight_relations IS 'Relationships between insights (reinforces, contradicts, extends, supersedes)';
