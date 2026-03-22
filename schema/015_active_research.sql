-- Active Research: Proactive identification of knowledge gaps and questions
-- Enables the system to notice what it DOESN'T know and ask smart questions

-- ============================================================================
-- KNOWLEDGE GAPS: What's missing from our understanding
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- The gap description
  content TEXT NOT NULL,                      -- "We don't know Sarah's role at the company"

  -- Classification
  gap_type VARCHAR(30) NOT NULL,

  -- Optional entity references (gaps often relate to entities)
  related_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  secondary_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,  -- for relationship gaps

  -- Importance
  priority VARCHAR(20) DEFAULT 'medium',

  -- How significant is this gap? (0.0 = minor, 1.0 = critical)
  severity FLOAT NOT NULL DEFAULT 0.5,

  -- Status lifecycle
  status VARCHAR(20) DEFAULT 'open',
  partially_filled_at TIMESTAMPTZ,            -- when we got partial info
  filled_at TIMESTAMPTZ,                      -- when gap was fully resolved
  dismissed_reason TEXT,                      -- why gap was dismissed (if dismissed)

  -- Detection metadata
  detected_by_model VARCHAR(100),
  detection_prompt_version VARCHAR(20),
  detection_context TEXT,                     -- what triggered gap detection

  -- Tracking
  times_surfaced INTEGER DEFAULT 1,           -- how often this gap comes up
  last_surfaced_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_gap_type CHECK (gap_type IN (
    'entity',           -- missing facts about a person/project/place
    'relationship',     -- don't know how two entities relate
    'timeline',         -- missing when something happened
    'outcome',          -- know something started but not how it ended
    'context',          -- have facts but lack why/how explanation
    'commitment',       -- open-ended promise without resolution
    'preference',       -- don't know user's preference on something
    'history'           -- missing backstory or past events
  )),
  CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT valid_severity CHECK (severity >= 0.0 AND severity <= 1.0),
  CONSTRAINT valid_gap_status CHECK (status IN ('open', 'partially_filled', 'filled', 'dismissed'))
);

-- ============================================================================
-- RESEARCH QUESTIONS: Smart questions to ask the user
-- ============================================================================

CREATE TABLE IF NOT EXISTS research_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- The question text
  content TEXT NOT NULL,                      -- "How did the meeting with Sarah go?"

  -- Classification
  question_type VARCHAR(30) NOT NULL,

  -- Optional link to the gap this question addresses
  gap_id UUID REFERENCES knowledge_gaps(id) ON DELETE SET NULL,

  -- Optional entity reference
  related_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,

  -- Importance
  priority VARCHAR(20) DEFAULT 'medium',

  -- Timing hints
  timing_hint VARCHAR(30),                    -- when to ask this question

  -- Status lifecycle
  status VARCHAR(20) DEFAULT 'pending',
  asked_at TIMESTAMPTZ,                       -- when we asked the user
  answered_at TIMESTAMPTZ,                    -- when user responded

  -- The answer (if answered)
  answer TEXT,
  answer_memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,  -- memory created from answer

  -- Was the question useful?
  usefulness_score FLOAT,                     -- user or system feedback (0.0-1.0)

  -- Generation metadata
  generated_by_model VARCHAR(100),
  generation_prompt_version VARCHAR(20),

  -- Expiration (some questions become stale)
  expires_at TIMESTAMPTZ,                     -- question no longer relevant after this
  expired_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_question_type CHECK (question_type IN (
    'clarification',    -- "What did you mean by X?"
    'follow_up',        -- "How did [event] go?"
    'exploration',      -- "Tell me more about [topic]"
    'verification',     -- "Is it still true that X?"
    'deepening',        -- "What made you feel that way?"
    'connection',       -- "How does X relate to Y?"
    'outcome',          -- "What happened with X?"
    'preference'        -- "Would you prefer X or Y?"
  )),
  CONSTRAINT valid_question_priority CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT valid_timing_hint CHECK (timing_hint IS NULL OR timing_hint IN (
    'immediately',      -- ask right away
    'next_session',     -- ask at start of next conversation
    'when_relevant',    -- ask when topic comes up naturally
    'periodic',         -- ask periodically to verify
    'before_deadline'   -- ask before a commitment deadline
  )),
  CONSTRAINT valid_question_status CHECK (status IN (
    'pending',          -- ready to be asked
    'asked',            -- asked but not yet answered
    'answered',         -- user provided an answer
    'dismissed',        -- user declined to answer or marked irrelevant
    'expired'           -- question is no longer relevant
  )),
  CONSTRAINT valid_usefulness CHECK (usefulness_score IS NULL OR (usefulness_score >= 0.0 AND usefulness_score <= 1.0))
);

-- ============================================================================
-- GAP SOURCES: What revealed this knowledge gap (polymorphic)
-- ============================================================================

CREATE TABLE IF NOT EXISTS gap_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  gap_id UUID NOT NULL REFERENCES knowledge_gaps(id) ON DELETE CASCADE,

  -- Polymorphic reference to source
  source_type VARCHAR(20) NOT NULL,           -- 'memory', 'belief', 'pattern', 'entity', 'insight'
  source_id UUID NOT NULL,                    -- ID of the source record

  -- How this source revealed the gap
  revelation_type VARCHAR(30) DEFAULT 'indicates',

  -- Brief explanation
  explanation TEXT,

  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_gap_source_type CHECK (source_type IN ('memory', 'belief', 'pattern', 'entity', 'insight')),
  CONSTRAINT valid_revelation_type CHECK (revelation_type IN (
    'indicates',        -- source indicates the gap exists
    'primary',          -- primary evidence of the gap
    'context',          -- provides context for understanding the gap
    'deepens'           -- makes the gap more significant
  )),
  CONSTRAINT unique_gap_source UNIQUE (gap_id, source_type, source_id)
);

-- ============================================================================
-- QUESTION SOURCES: What prompted this question (polymorphic)
-- ============================================================================

CREATE TABLE IF NOT EXISTS question_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  question_id UUID NOT NULL REFERENCES research_questions(id) ON DELETE CASCADE,

  -- Polymorphic reference to source
  source_type VARCHAR(20) NOT NULL,           -- 'memory', 'belief', 'pattern', 'entity', 'insight', 'gap'
  source_id UUID NOT NULL,                    -- ID of the source record

  -- How this source relates to the question
  relation_type VARCHAR(30) DEFAULT 'prompted',

  -- Brief explanation
  explanation TEXT,

  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_question_source_type CHECK (source_type IN ('memory', 'belief', 'pattern', 'entity', 'insight', 'gap')),
  CONSTRAINT valid_question_relation_type CHECK (relation_type IN (
    'prompted',         -- source prompted the question
    'context',          -- provides context for the question
    'about'             -- question is about this source
  )),
  CONSTRAINT unique_question_source UNIQUE (question_id, source_type, source_id)
);

-- ============================================================================
-- GAP FILLERS: Track what information helped fill a gap
-- ============================================================================

CREATE TABLE IF NOT EXISTS gap_fillers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  gap_id UUID NOT NULL REFERENCES knowledge_gaps(id) ON DELETE CASCADE,

  -- What filled (or partially filled) the gap
  filler_type VARCHAR(20) NOT NULL,           -- 'memory', 'answer'
  filler_id UUID NOT NULL,                    -- memory ID or answer from question

  -- How much this contributed to filling the gap (0.0-1.0)
  contribution FLOAT NOT NULL DEFAULT 0.5,

  -- Notes
  notes TEXT,

  filled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_filler_type CHECK (filler_type IN ('memory', 'answer')),
  CONSTRAINT valid_contribution CHECK (contribution >= 0.0 AND contribution <= 1.0),
  CONSTRAINT unique_gap_filler UNIQUE (gap_id, filler_type, filler_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Knowledge gaps indexes
CREATE INDEX IF NOT EXISTS idx_gaps_type ON knowledge_gaps (gap_type);
CREATE INDEX IF NOT EXISTS idx_gaps_status ON knowledge_gaps (status);
CREATE INDEX IF NOT EXISTS idx_gaps_priority ON knowledge_gaps (priority);
CREATE INDEX IF NOT EXISTS idx_gaps_severity ON knowledge_gaps (severity DESC);
CREATE INDEX IF NOT EXISTS idx_gaps_entity ON knowledge_gaps (related_entity_id) WHERE related_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gaps_secondary_entity ON knowledge_gaps (secondary_entity_id) WHERE secondary_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gaps_open ON knowledge_gaps (status, priority DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_gaps_surfaced ON knowledge_gaps (last_surfaced_at DESC);

-- Research questions indexes
CREATE INDEX IF NOT EXISTS idx_questions_type ON research_questions (question_type);
CREATE INDEX IF NOT EXISTS idx_questions_status ON research_questions (status);
CREATE INDEX IF NOT EXISTS idx_questions_priority ON research_questions (priority);
CREATE INDEX IF NOT EXISTS idx_questions_gap ON research_questions (gap_id) WHERE gap_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_questions_entity ON research_questions (related_entity_id) WHERE related_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_questions_pending ON research_questions (status, priority DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_questions_timing ON research_questions (timing_hint) WHERE timing_hint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_questions_expires ON research_questions (expires_at) WHERE expires_at IS NOT NULL;

-- Gap sources indexes
CREATE INDEX IF NOT EXISTS idx_gap_sources_gap ON gap_sources (gap_id);
CREATE INDEX IF NOT EXISTS idx_gap_sources_source ON gap_sources (source_type, source_id);

-- Question sources indexes
CREATE INDEX IF NOT EXISTS idx_question_sources_question ON question_sources (question_id);
CREATE INDEX IF NOT EXISTS idx_question_sources_source ON question_sources (source_type, source_id);

-- Gap fillers indexes
CREATE INDEX IF NOT EXISTS idx_gap_fillers_gap ON gap_fillers (gap_id);
CREATE INDEX IF NOT EXISTS idx_gap_fillers_filler ON gap_fillers (filler_type, filler_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE knowledge_gaps IS 'Identified gaps in knowledge - what we DONT know that we should';
COMMENT ON COLUMN knowledge_gaps.gap_type IS 'Category: entity, relationship, timeline, outcome, context, commitment, preference, history';
COMMENT ON COLUMN knowledge_gaps.severity IS 'How significant this gap is (0.0=minor, 1.0=critical)';
COMMENT ON COLUMN knowledge_gaps.status IS 'open, partially_filled, filled, or dismissed';
COMMENT ON COLUMN knowledge_gaps.times_surfaced IS 'How often this gap comes up in analysis - higher = more important';

COMMENT ON TABLE research_questions IS 'Smart questions to ask the user to fill knowledge gaps';
COMMENT ON COLUMN research_questions.question_type IS 'Category: clarification, follow_up, exploration, verification, deepening, connection, outcome, preference';
COMMENT ON COLUMN research_questions.timing_hint IS 'When to ask: immediately, next_session, when_relevant, periodic, before_deadline';
COMMENT ON COLUMN research_questions.status IS 'pending, asked, answered, dismissed, or expired';
COMMENT ON COLUMN research_questions.answer IS 'The users answer to the question (if answered)';

COMMENT ON TABLE gap_sources IS 'What revealed a knowledge gap (memories, beliefs, patterns, entities, insights)';
COMMENT ON TABLE question_sources IS 'What prompted a research question';
COMMENT ON TABLE gap_fillers IS 'What information helped fill a gap';
