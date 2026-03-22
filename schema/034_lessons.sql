-- Agent lessons - persistent learnings from experience
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  trigger TEXT,
  category VARCHAR(50),
  importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  embedding VECTOR(768),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0
);

CREATE INDEX lessons_embedding_idx ON lessons
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX lessons_category_idx ON lessons(category);
CREATE INDEX lessons_importance_idx ON lessons(importance DESC);

COMMENT ON TABLE lessons IS 'Agent memory - lessons learned from experience';
