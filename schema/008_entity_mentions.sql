-- Entity Mentions: Links between memories and entities
-- This is the MENTIONS edge in the graph

CREATE TABLE IF NOT EXISTS entity_mentions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- The connection
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Context of the mention
  mention_text VARCHAR(500),              -- the exact text that matched
  context_snippet TEXT,                   -- surrounding text for disambiguation
  position_start INTEGER,                 -- character offset in memory content
  position_end INTEGER,

  -- Relationship context (optional, for richer graph)
  relationship_type VARCHAR(100),         -- e.g., "works on", "met with", "mentioned"
  relationship_direction VARCHAR(20),     -- subject, object, or null

  -- Confidence
  extraction_method VARCHAR(50) DEFAULT 'regex',
  confidence FLOAT DEFAULT 0.8,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_mention_confidence CHECK (confidence >= 0.0 AND confidence <= 1.0),
  CONSTRAINT unique_memory_entity UNIQUE (memory_id, entity_id, position_start)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_mentions_memory ON entity_mentions (memory_id);
CREATE INDEX IF NOT EXISTS idx_mentions_entity ON entity_mentions (entity_id);
CREATE INDEX IF NOT EXISTS idx_mentions_created ON entity_mentions (created_at DESC);

COMMENT ON TABLE entity_mentions IS 'Links between memories and entities - the MENTIONS edge in the graph';
COMMENT ON COLUMN entity_mentions.relationship_type IS 'Optional relationship type for richer graph queries';
