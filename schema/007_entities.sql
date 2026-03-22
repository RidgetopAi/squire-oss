-- Entities: Named things that appear in memories
-- People, projects, concepts, places, etc.

CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Core identity
  name VARCHAR(255) NOT NULL,
  canonical_name VARCHAR(255) NOT NULL,  -- normalized lowercase for matching
  entity_type VARCHAR(50) NOT NULL,      -- person, project, concept, place, organization

  -- Optional disambiguation
  aliases TEXT[] DEFAULT '{}',           -- alternative names/spellings
  description TEXT,                       -- extracted or provided description

  -- Embedding for entity similarity (deduplication)
  embedding vector(768),

  -- Metadata
  attributes JSONB DEFAULT '{}',          -- extracted attributes (e.g., title, relationship)
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mention_count INTEGER DEFAULT 1,

  -- Confidence
  extraction_method VARCHAR(50) DEFAULT 'regex',  -- regex, llm, manual
  confidence FLOAT DEFAULT 0.8,

  -- Status
  is_merged BOOLEAN DEFAULT FALSE,        -- true if merged into another entity
  merged_into_id UUID REFERENCES entities(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_entity_type CHECK (entity_type IN ('person', 'project', 'concept', 'place', 'organization')),
  CONSTRAINT valid_confidence CHECK (confidence >= 0.0 AND confidence <= 1.0),
  CONSTRAINT unique_canonical_per_type UNIQUE (canonical_name, entity_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities (name);
CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities (canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities (entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_mention_count ON entities (mention_count DESC);
CREATE INDEX IF NOT EXISTS idx_entities_last_seen ON entities (last_seen_at DESC);

-- Vector index for entity similarity (deduplication)
CREATE INDEX IF NOT EXISTS idx_entities_embedding ON entities
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE entities IS 'Named entities extracted from memories - people, projects, concepts, places';
COMMENT ON COLUMN entities.canonical_name IS 'Lowercase normalized name for matching and deduplication';
COMMENT ON COLUMN entities.aliases IS 'Alternative names that should resolve to this entity';
