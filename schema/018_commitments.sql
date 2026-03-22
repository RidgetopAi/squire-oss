-- Commitments: Actionable items with deadlines, recurrence, and Google Calendar sync
-- Supports lifecycle management (open → completed/canceled), recurrence (RRULE),
-- embedding for resolution matching, and bidirectional Google Calendar sync

CREATE TABLE IF NOT EXISTS commitments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Link to originating memory (goal/decision extracted from chat)
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,

  -- Core fields
  title TEXT NOT NULL,
  description TEXT,

  -- Source tracking
  source_type VARCHAR(20) NOT NULL DEFAULT 'chat',  -- 'chat' | 'manual' | 'google_sync'

  -- Timing
  due_at TIMESTAMPTZ,
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  all_day BOOLEAN DEFAULT FALSE,

  -- Duration (for calendar events)
  duration_minutes INTEGER,  -- NULL = point-in-time, otherwise has length

  -- Recurrence (RFC 5545 RRULE format)
  -- Examples: "FREQ=WEEKLY;BYDAY=MO,WE,FR" or "FREQ=DAILY;UNTIL=20250301"
  rrule TEXT,
  recurrence_end_at TIMESTAMPTZ,  -- When recurrence stops
  parent_commitment_id UUID REFERENCES commitments(id) ON DELETE CASCADE,  -- For instances
  original_due_at TIMESTAMPTZ,  -- Original time before any modifications

  -- State machine
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  resolution_type VARCHAR(20),
  resolution_memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,

  -- Google Calendar sync (FK added after google_accounts table in 020)
  google_account_id UUID,
  google_calendar_id TEXT,
  google_event_id TEXT,
  google_sync_status VARCHAR(20) DEFAULT 'local_only',
  google_etag TEXT,  -- For conflict detection
  last_synced_at TIMESTAMPTZ,

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  -- Embedding for resolution matching (768-dim to match memories table)
  embedding vector(768),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_commitment_status CHECK (status IN (
    'open', 'in_progress', 'completed', 'canceled', 'snoozed'
  )),
  CONSTRAINT valid_resolution_type CHECK (
    resolution_type IS NULL OR resolution_type IN (
      'completed', 'canceled', 'no_longer_relevant', 'superseded'
    )
  ),
  CONSTRAINT valid_source_type CHECK (source_type IN ('chat', 'manual', 'google_sync')),
  CONSTRAINT valid_google_sync_status CHECK (google_sync_status IN (
    'local_only', 'synced', 'pending_push', 'pending_pull', 'conflict'
  ))
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_commitments_status ON commitments (status);
CREATE INDEX IF NOT EXISTS idx_commitments_due ON commitments (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_open_due ON commitments (status, due_at) WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_commitments_memory ON commitments (memory_id) WHERE memory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_google ON commitments (google_account_id, google_event_id) WHERE google_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_parent ON commitments (parent_commitment_id) WHERE parent_commitment_id IS NOT NULL;

-- Vector similarity index for resolution matching
CREATE INDEX IF NOT EXISTS idx_commitments_embedding ON commitments USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- Comments
COMMENT ON TABLE commitments IS 'Actionable items with deadlines, recurrence, and Google Calendar sync';
COMMENT ON COLUMN commitments.memory_id IS 'Originating memory - the goal/decision extracted from chat';
COMMENT ON COLUMN commitments.source_type IS 'How this commitment was created: chat, manual, or google_sync';
COMMENT ON COLUMN commitments.rrule IS 'RFC 5545 RRULE for recurrence (e.g., FREQ=WEEKLY;BYDAY=MO)';
COMMENT ON COLUMN commitments.parent_commitment_id IS 'For recurring: links instance to parent template';
COMMENT ON COLUMN commitments.resolution_memory_id IS 'Memory that resolved this commitment (e.g., "I finished X")';
COMMENT ON COLUMN commitments.google_sync_status IS 'Sync state: local_only, synced, pending_push, pending_pull, conflict';
COMMENT ON COLUMN commitments.embedding IS '768-dim vector for semantic similarity in resolution matching';
