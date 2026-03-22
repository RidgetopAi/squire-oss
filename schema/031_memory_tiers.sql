-- Migration 031: Memory Tiers (Phase 3)
--
-- Adds hypothesis/solid tier system for memory validation.
-- Memories start as "hypothesis" and graduate to "solid" through:
--   1. High initial confidence (≥0.75)
--   2. Reinforcement from repeated mentions
--
-- Only "solid" memories influence context injection.

-- Add tier column with default 'hypothesis'
ALTER TABLE memories ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'hypothesis';

-- Add confidence score (0.0 to 1.0)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS confidence REAL DEFAULT 0.5;

-- Add constraints
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_tier_check;
ALTER TABLE memories ADD CONSTRAINT memories_tier_check 
  CHECK (tier IN ('hypothesis', 'solid'));

ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_confidence_check;
ALTER TABLE memories ADD CONSTRAINT memories_confidence_check 
  CHECK (confidence >= 0.0 AND confidence <= 1.0);

-- Index for efficient tier filtering
CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier);

-- Index for finding low-confidence memories to potentially promote
CREATE INDEX IF NOT EXISTS idx_memories_confidence ON memories(confidence);

-- Composite index for context queries (tier + salience)
CREATE INDEX IF NOT EXISTS idx_memories_tier_salience ON memories(tier, salience_score DESC);

-- Backfill existing memories:
-- High salience (≥7) → solid with confidence 0.8
-- Medium salience (4-6) → hypothesis with confidence 0.6
-- Low salience (<4) → hypothesis with confidence 0.4
UPDATE memories 
SET tier = CASE 
    WHEN salience_score >= 7 THEN 'solid'
    ELSE 'hypothesis'
  END,
  confidence = CASE
    WHEN salience_score >= 8 THEN 0.9
    WHEN salience_score >= 7 THEN 0.8
    WHEN salience_score >= 5 THEN 0.6
    ELSE 0.4
  END
WHERE tier IS NULL OR confidence IS NULL;

COMMENT ON COLUMN memories.tier IS 'Memory validation tier: hypothesis (unconfirmed) or solid (validated)';
COMMENT ON COLUMN memories.confidence IS 'Confidence score 0.0-1.0, boosted by reinforcement';
