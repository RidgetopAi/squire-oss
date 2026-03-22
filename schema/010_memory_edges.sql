-- Memory Edges: Graph connections between memories
-- SIMILAR edges connect semantically related memories (embedding similarity > threshold)
-- Future edge types: FOLLOWS, CONTRADICTS, ELABORATES, etc.

CREATE TABLE IF NOT EXISTS memory_edges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- The two memories connected
  source_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  target_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,

  -- Edge type (SIMILAR for now, extensible later)
  edge_type VARCHAR(50) NOT NULL DEFAULT 'SIMILAR',

  -- Edge metadata
  weight FLOAT NOT NULL DEFAULT 1.0,          -- Edge strength (0-1)
  similarity FLOAT,                            -- Embedding similarity (for SIMILAR edges)
  metadata JSONB DEFAULT '{}',

  -- Edge lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reinforced_at TIMESTAMPTZ DEFAULT NOW(),
  reinforcement_count INTEGER DEFAULT 1,

  -- Constraints
  CONSTRAINT valid_edge_type CHECK (edge_type IN ('SIMILAR', 'FOLLOWS', 'CONTRADICTS', 'ELABORATES')),
  CONSTRAINT valid_weight CHECK (weight >= 0.0 AND weight <= 1.0),
  CONSTRAINT valid_similarity CHECK (similarity IS NULL OR (similarity >= 0.0 AND similarity <= 1.0)),
  CONSTRAINT no_self_edge CHECK (source_memory_id != target_memory_id),
  -- Prevent duplicate edges (same pair, same type)
  CONSTRAINT unique_edge UNIQUE (source_memory_id, target_memory_id, edge_type)
);

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_edges_source ON memory_edges (source_memory_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON memory_edges (target_memory_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON memory_edges (edge_type);
CREATE INDEX IF NOT EXISTS idx_edges_weight ON memory_edges (weight DESC);
CREATE INDEX IF NOT EXISTS idx_edges_similarity ON memory_edges (similarity DESC) WHERE similarity IS NOT NULL;

-- Composite index for finding all edges of a memory
CREATE INDEX IF NOT EXISTS idx_edges_memory_lookup ON memory_edges (source_memory_id, edge_type);

COMMENT ON TABLE memory_edges IS 'Graph connections between memories - SIMILAR edges link semantically related memories';
COMMENT ON COLUMN memory_edges.weight IS 'Edge strength (0-1), decays if not reinforced during consolidation';
COMMENT ON COLUMN memory_edges.similarity IS 'Embedding cosine similarity for SIMILAR edges';
COMMENT ON COLUMN memory_edges.last_reinforced_at IS 'Last time this edge was validated/strengthened during consolidation';
