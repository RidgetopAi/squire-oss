-- Continuity Threads: First-class persistent threads that track ongoing concerns,
-- projects, emotional loads, and open loops across sessions.
-- Part of Memory Upgrade Phase 2.

CREATE TYPE continuity_thread_type AS ENUM (
  'project', 'work_pressure', 'family', 'health',
  'relationship', 'identity', 'emotional_load', 'logistics', 'goal'
);

CREATE TYPE continuity_thread_status AS ENUM (
  'active', 'watching', 'resolved', 'dormant', 'archived'
);

CREATE TABLE IF NOT EXISTS continuity_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  thread_type continuity_thread_type NOT NULL,
  status continuity_thread_status NOT NULL DEFAULT 'active',
  importance SMALLINT NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  emotional_weight SMALLINT DEFAULT 3 CHECK (emotional_weight BETWEEN 0 AND 10),
  current_state_summary TEXT,
  last_state_transition TEXT,
  next_followup_question TEXT,
  followup_after TIMESTAMPTZ,
  last_discussed_at TIMESTAMPTZ,
  related_memory_ids UUID[] DEFAULT '{}',
  related_entity_ids UUID[] DEFAULT '{}',
  related_commitment_ids UUID[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_continuity_threads_status ON continuity_threads (status);
CREATE INDEX IF NOT EXISTS idx_continuity_threads_importance ON continuity_threads (importance DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_threads_followup ON continuity_threads (followup_after)
  WHERE followup_after IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_continuity_threads_last_discussed ON continuity_threads (last_discussed_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_threads_tags ON continuity_threads USING GIN (tags);

COMMENT ON TABLE continuity_threads IS 'Persistent threads tracking ongoing concerns, projects, and emotional loads across sessions';
COMMENT ON COLUMN continuity_threads.emotional_weight IS 'How emotionally significant this thread is (0=neutral, 10=deeply important)';
COMMENT ON COLUMN continuity_threads.next_followup_question IS 'Auto-generated question to ask when this thread comes up again';
COMMENT ON COLUMN continuity_threads.followup_after IS 'Earliest time to surface the follow-up question';
