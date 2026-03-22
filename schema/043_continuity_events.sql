-- Continuity Events: Tracks the history of changes to continuity threads.
-- Part of Memory Upgrade Phase 2.

CREATE TYPE continuity_event_type AS ENUM (
  'created', 'state_change', 'update', 'followup_asked',
  'followup_answered', 'escalation', 'de_escalation', 'resolved', 'dormant'
);

CREATE TABLE IF NOT EXISTS continuity_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES continuity_threads(id) ON DELETE CASCADE,
  event_type continuity_event_type NOT NULL,
  description TEXT NOT NULL,
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_continuity_events_thread_time ON continuity_events (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_events_type ON continuity_events (event_type);
CREATE INDEX IF NOT EXISTS idx_continuity_events_memory ON continuity_events (memory_id) WHERE memory_id IS NOT NULL;

COMMENT ON TABLE continuity_events IS 'Audit trail of changes and interactions with continuity threads';
