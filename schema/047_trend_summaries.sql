-- Trend Summaries: Periodic aggregations of state snapshots for longitudinal tracking.
-- Notices drift patterns like "more stressed this month" or "momentum stalling."
-- Part of Memory Upgrade Phase 5.

CREATE TABLE IF NOT EXISTS trend_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('7day', '30day', '90day')),
  period_end TIMESTAMPTZ NOT NULL,
  stress_trend SMALLINT CHECK (stress_trend IS NULL OR stress_trend BETWEEN -1 AND 1),
  energy_trend SMALLINT CHECK (energy_trend IS NULL OR energy_trend BETWEEN -1 AND 1),
  motivation_trend SMALLINT CHECK (motivation_trend IS NULL OR motivation_trend BETWEEN -1 AND 1),
  avg_stress FLOAT,
  avg_energy FLOAT,
  avg_motivation FLOAT,
  threads_opened INTEGER DEFAULT 0,
  threads_resolved INTEGER DEFAULT 0,
  threads_stagnant INTEGER DEFAULT 0,
  narrative TEXT,
  domain_breakdown JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_trend_period UNIQUE (period_type, period_end)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trend_summaries_type_end ON trend_summaries (period_type, period_end DESC);

COMMENT ON TABLE trend_summaries IS 'Aggregated trend summaries over 7/30/90 day periods for longitudinal awareness';
COMMENT ON COLUMN trend_summaries.stress_trend IS '-1=improving, 0=stable, 1=worsening';
COMMENT ON COLUMN trend_summaries.narrative IS 'Natural language narrative of the trend';
