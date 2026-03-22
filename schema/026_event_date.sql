-- Add event_date column to memories for date-based graph traversal
-- Phase 2: Memory Graph Traversal - enables date-based seeds for Story Engine

-- Add the column (nullable, no default)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS event_date DATE;

-- Index for efficient date-based queries
CREATE INDEX IF NOT EXISTS idx_memories_event_date ON memories (event_date)
  WHERE event_date IS NOT NULL;

-- Composite index for date + salience queries
CREATE INDEX IF NOT EXISTS idx_memories_event_date_salience ON memories (event_date, salience_score DESC)
  WHERE event_date IS NOT NULL;

COMMENT ON COLUMN memories.event_date IS 'Normalized date for event-type memories (e.g., "February 16, 2025" → 2025-02-16). Used for date-based Story Engine queries.';
