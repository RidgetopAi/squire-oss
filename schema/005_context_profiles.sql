-- Context Profiles: Configuration for context injection
-- Defines how to select and format memories for AI consumption

CREATE TABLE IF NOT EXISTS context_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,

    -- Selection Criteria
    include_sources TEXT[] DEFAULT '{}',
    min_salience FLOAT DEFAULT 3.0,
    min_strength FLOAT DEFAULT 0.3,

    -- Recency Weighting
    recency_weight FLOAT DEFAULT 0.5,
    lookback_days INTEGER DEFAULT 30,

    -- Output Configuration
    max_tokens INTEGER DEFAULT 4000,
    format VARCHAR(20) DEFAULT 'markdown',  -- markdown, json, plain

    -- Scoring Weights (configurable per profile)
    -- salience × relevance × recency × strength
    scoring_weights JSONB DEFAULT '{"salience": 0.35, "relevance": 0.30, "recency": 0.20, "strength": 0.15}',

    -- Token Budget Caps (percentages)
    budget_caps JSONB DEFAULT '{"high_salience": 0.30, "relevant": 0.40, "recent": 0.30}',

    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_context_profiles_name ON context_profiles (name);
CREATE INDEX IF NOT EXISTS idx_context_profiles_default ON context_profiles (is_default) WHERE is_default = TRUE;

-- Default profiles
INSERT INTO context_profiles (name, description, min_salience, scoring_weights, is_default) VALUES
('general', 'Default balanced context for general use', 3.0,
 '{"salience": 0.35, "relevance": 0.30, "recency": 0.20, "strength": 0.15}', TRUE),
('work', 'Work-focused context prioritizing recent and high-salience', 4.0,
 '{"salience": 0.40, "relevance": 0.25, "recency": 0.25, "strength": 0.10}', FALSE),
('personal', 'Personal context with emphasis on salience and relationships', 2.0,
 '{"salience": 0.45, "relevance": 0.20, "recency": 0.20, "strength": 0.15}', FALSE),
('creative', 'Creative context with broader relevance matching', 2.0,
 '{"salience": 0.25, "relevance": 0.40, "recency": 0.20, "strength": 0.15}', FALSE)
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE context_profiles IS 'Configuration profiles for context injection - controls what memories are included and how they are scored';
