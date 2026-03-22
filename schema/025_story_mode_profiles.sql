-- Story Mode Profiles: Lower thresholds for biographical/narrative queries
-- Phase 0 of "Generate Not Retrieve" memory system

-- Lower min_salience for general profile (was 3.0, now 1.0)
-- This ensures biographical memories aren't filtered before search
UPDATE context_profiles 
SET min_salience = 1.0,
    updated_at = NOW()
WHERE name = 'general';

-- Add personal-story profile for biographical/narrative queries
-- Used by Story Engine for date/origin/relationship questions
INSERT INTO context_profiles (
    name, 
    description, 
    min_salience, 
    min_strength,
    recency_weight,
    lookback_days,
    max_tokens,
    scoring_weights,
    budget_caps,
    is_default
) VALUES (
    'personal-story',
    'Profile for biographical and narrative queries - prioritizes salience over recency',
    1.0,                    -- Very low threshold to include origin stories
    0.1,                    -- Include weak memories too
    0.1,                    -- Low recency weight - old memories matter
    3650,                   -- 10 year lookback for life stories
    6000,                   -- Higher token budget for narratives
    '{"salience": 0.50, "relevance": 0.25, "recency": 0.10, "strength": 0.15}',
    '{"high_salience": 0.50, "relevant": 0.35, "recent": 0.15}',
    FALSE
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    min_salience = EXCLUDED.min_salience,
    min_strength = EXCLUDED.min_strength,
    recency_weight = EXCLUDED.recency_weight,
    lookback_days = EXCLUDED.lookback_days,
    max_tokens = EXCLUDED.max_tokens,
    scoring_weights = EXCLUDED.scoring_weights,
    budget_caps = EXCLUDED.budget_caps,
    updated_at = NOW();

COMMENT ON TABLE context_profiles IS 'Configuration profiles for context injection - includes personal-story profile for biographical queries';
