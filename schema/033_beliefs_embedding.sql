-- Add embedding column to beliefs table for similarity search
-- Using 768 dimensions to match other embeddings (nomic-embed-text)

ALTER TABLE beliefs
ADD COLUMN IF NOT EXISTS embedding vector(768);

-- HNSW index for fast similarity search
-- Using cosine distance (consistent with other tables)
CREATE INDEX IF NOT EXISTS idx_beliefs_embedding
ON beliefs USING hnsw (embedding vector_cosine_ops);

COMMENT ON COLUMN beliefs.embedding IS 'Vector embedding for similarity matching (768 dim, nomic-embed-text)';
