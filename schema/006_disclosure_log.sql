-- Disclosure Log: Audit trail of what memories are shown to AI
-- Tracks every context injection for transparency and debugging

CREATE TABLE IF NOT EXISTS disclosure_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Context request
    conversation_id VARCHAR(100),
    profile_used VARCHAR(100),
    query_text TEXT,

    -- What was disclosed
    disclosed_memory_ids UUID[] DEFAULT '{}',
    disclosed_memory_count INTEGER DEFAULT 0,

    -- Scoring info
    scoring_weights JSONB,

    -- Output
    token_count INTEGER,
    format VARCHAR(20),

    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_disclosure_created ON disclosure_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disclosure_conversation ON disclosure_log (conversation_id);
CREATE INDEX IF NOT EXISTS idx_disclosure_profile ON disclosure_log (profile_used);

COMMENT ON TABLE disclosure_log IS 'Audit trail of context injections - what memories were shown to AI and when';
