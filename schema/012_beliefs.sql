-- Beliefs: Persistent convictions extracted from memories
-- Represents ongoing understanding that compounds and evolves over time

CREATE TABLE IF NOT EXISTS beliefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- The belief statement
  content TEXT NOT NULL,                      -- "I value work-life balance"

  -- Classification
  belief_type VARCHAR(50) NOT NULL,

  -- Optional entity reference (for about_person, about_project beliefs)
  related_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,

  -- Confidence (0.0-1.0, how strongly held)
  confidence FLOAT NOT NULL DEFAULT 0.5,

  -- Evidence tracking
  source_memory_count INTEGER DEFAULT 1,
  first_extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reinforced_at TIMESTAMPTZ,
  reinforcement_count INTEGER DEFAULT 1,

  -- Status
  status VARCHAR(20) DEFAULT 'active',
  superseded_by UUID REFERENCES beliefs(id) ON DELETE SET NULL,

  -- Extraction metadata
  extracted_by_model VARCHAR(100),
  extraction_prompt_version VARCHAR(20),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_confidence CHECK (confidence >= 0.0 AND confidence <= 1.0),
  CONSTRAINT valid_belief_type CHECK (belief_type IN (
    'value',           -- core values ("I value honesty")
    'preference',      -- preferences ("I prefer morning work")
    'self_knowledge',  -- self-understanding ("I work best under pressure")
    'prediction',      -- expectations ("The project will succeed")
    'about_person',    -- beliefs about others ("Sarah is reliable")
    'about_project',   -- beliefs about work ("This approach is best")
    'about_world',     -- general world beliefs ("Remote work is the future")
    'should'           -- normative ("I should prioritize health")
  )),
  CONSTRAINT valid_status CHECK (status IN ('active', 'superseded', 'conflicted'))
);

-- Junction table: which memories support which beliefs
CREATE TABLE IF NOT EXISTS belief_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  belief_id UUID NOT NULL REFERENCES beliefs(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,

  -- How strongly this memory supports the belief (0.0-1.0)
  support_strength FLOAT NOT NULL DEFAULT 0.5,

  -- Evidence type
  evidence_type VARCHAR(20) DEFAULT 'supports',

  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_support CHECK (support_strength >= 0.0 AND support_strength <= 1.0),
  CONSTRAINT valid_evidence_type CHECK (evidence_type IN ('supports', 'contradicts', 'nuances')),
  CONSTRAINT unique_belief_memory UNIQUE (belief_id, memory_id)
);

-- Belief conflicts: when beliefs contradict each other
CREATE TABLE IF NOT EXISTS belief_conflicts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  belief_a_id UUID NOT NULL REFERENCES beliefs(id) ON DELETE CASCADE,
  belief_b_id UUID NOT NULL REFERENCES beliefs(id) ON DELETE CASCADE,

  -- Conflict classification
  conflict_type VARCHAR(30) NOT NULL,
  conflict_description TEXT,

  -- Resolution tracking
  resolution_status VARCHAR(20) DEFAULT 'unresolved',
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,

  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_conflict_type CHECK (conflict_type IN (
    'direct_contradiction',   -- A and B cannot both be true
    'tension',                -- A and B are in tension but coexist
    'evolution'               -- B appears to be an evolution of A
  )),
  CONSTRAINT valid_resolution CHECK (resolution_status IN (
    'unresolved',
    'belief_a_active',        -- A kept, B superseded
    'belief_b_active',        -- B kept, A superseded
    'both_valid',             -- both kept (context-dependent)
    'merged',                 -- combined into new belief
    'user_resolved'           -- user explicitly resolved
  )),
  CONSTRAINT different_beliefs CHECK (belief_a_id != belief_b_id),
  CONSTRAINT unique_conflict UNIQUE (belief_a_id, belief_b_id)
);

-- Indexes for beliefs
CREATE INDEX IF NOT EXISTS idx_beliefs_type ON beliefs (belief_type);
CREATE INDEX IF NOT EXISTS idx_beliefs_status ON beliefs (status);
CREATE INDEX IF NOT EXISTS idx_beliefs_confidence ON beliefs (confidence DESC);
CREATE INDEX IF NOT EXISTS idx_beliefs_entity ON beliefs (related_entity_id) WHERE related_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_beliefs_reinforced ON beliefs (last_reinforced_at DESC);

-- Indexes for evidence
CREATE INDEX IF NOT EXISTS idx_belief_evidence_belief ON belief_evidence (belief_id);
CREATE INDEX IF NOT EXISTS idx_belief_evidence_memory ON belief_evidence (memory_id);
CREATE INDEX IF NOT EXISTS idx_belief_evidence_type ON belief_evidence (evidence_type);

-- Indexes for conflicts
CREATE INDEX IF NOT EXISTS idx_belief_conflicts_a ON belief_conflicts (belief_a_id);
CREATE INDEX IF NOT EXISTS idx_belief_conflicts_b ON belief_conflicts (belief_b_id);
CREATE INDEX IF NOT EXISTS idx_belief_conflicts_unresolved ON belief_conflicts (resolution_status)
  WHERE resolution_status = 'unresolved';

-- Comments
COMMENT ON TABLE beliefs IS 'Persistent convictions extracted from memories - values, preferences, self-knowledge';
COMMENT ON COLUMN beliefs.belief_type IS 'Category: value, preference, self_knowledge, prediction, about_person, about_project, about_world, should';
COMMENT ON COLUMN beliefs.confidence IS 'How strongly held (0.0-1.0), reinforced by evidence';
COMMENT ON COLUMN beliefs.status IS 'active, superseded (by newer belief), or conflicted';

COMMENT ON TABLE belief_evidence IS 'Links memories to the beliefs they support or contradict';
COMMENT ON COLUMN belief_evidence.support_strength IS 'How strongly this memory supports the belief (0.0-1.0)';
COMMENT ON COLUMN belief_evidence.evidence_type IS 'supports, contradicts, or nuances the belief';

COMMENT ON TABLE belief_conflicts IS 'Tracks when two beliefs contradict each other';
COMMENT ON COLUMN belief_conflicts.conflict_type IS 'direct_contradiction, tension, or evolution';
