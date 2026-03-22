-- State Snapshots: Periodic snapshots of the user's emotional/motivational state.
-- Tracks stress, energy, motivation, and dominant pressures/energizers.
-- Part of Memory Upgrade Phase 3.

CREATE TABLE IF NOT EXISTS state_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_type VARCHAR(10) NOT NULL DEFAULT 'daily' CHECK (period_type IN ('daily', 'weekly')),
  stress_level SMALLINT CHECK (stress_level IS NULL OR stress_level BETWEEN 1 AND 10),
  energy_level SMALLINT CHECK (energy_level IS NULL OR energy_level BETWEEN 1 AND 10),
  motivation_level SMALLINT CHECK (motivation_level IS NULL OR motivation_level BETWEEN 1 AND 10),
  emotional_tone TEXT,
  dominant_pressures TEXT[],
  dominant_energizers TEXT[],
  open_loops_summary TEXT,
  open_loop_count INTEGER DEFAULT 0,
  memories_analyzed INTEGER DEFAULT 0,
  threads_active INTEGER DEFAULT 0,
  narrative_summary TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_snapshot_period UNIQUE (period_start, period_end, period_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_state_snapshots_period_end ON state_snapshots (period_end DESC);
CREATE INDEX IF NOT EXISTS idx_state_snapshots_type_end ON state_snapshots (period_type, period_end DESC);

COMMENT ON TABLE state_snapshots IS 'Periodic emotional/motivational state snapshots for longitudinal tracking';
COMMENT ON COLUMN state_snapshots.emotional_tone IS 'Natural language emotional tone, e.g. "cautiously optimistic"';
COMMENT ON COLUMN state_snapshots.narrative_summary IS '2-3 sentence natural language summary of the period';
