-- Agent self-tuning preferences
CREATE TABLE preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  reasoning TEXT,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX preferences_key_idx ON preferences(key);
CREATE INDEX preferences_confidence_idx ON preferences(confidence DESC);

COMMENT ON TABLE preferences IS 'Agent self-tuning preferences about working style';
