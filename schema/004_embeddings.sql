-- Add embedding column to memories table
-- Using 768 dimensions for nomic-embed-text (configurable)

ALTER TABLE memories
ADD COLUMN IF NOT EXISTS embedding vector(768);

-- HNSW index for fast similarity search
-- Using cosine distance (most common for text embeddings)
CREATE INDEX IF NOT EXISTS idx_memories_embedding
ON memories USING hnsw (embedding vector_cosine_ops);

COMMENT ON COLUMN memories.embedding IS 'Vector embedding from nomic-embed-text (768 dim) or compatible model';
