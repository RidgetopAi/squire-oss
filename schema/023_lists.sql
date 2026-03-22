-- Lists: User-created lists with optional entity relationships
-- Supports: checklist (checkable), simple (no state), ranked (priority ordering)

CREATE TABLE IF NOT EXISTS lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Core identity
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- List type
  list_type VARCHAR(30) NOT NULL DEFAULT 'checklist',  -- 'checklist' | 'simple' | 'ranked'
  
  -- Entity relationship (optional - list can be about an entity)
  primary_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  
  -- Organization
  category VARCHAR(100),
  tags TEXT[] DEFAULT '{}',
  is_pinned BOOLEAN DEFAULT FALSE,
  color VARCHAR(20),
  
  -- Ordering
  default_sort VARCHAR(30) DEFAULT 'manual',  -- 'manual' | 'created' | 'priority' | 'due_date'
  
  -- Embedding for semantic search
  embedding vector(768),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Soft delete
  archived_at TIMESTAMPTZ,
  
  CONSTRAINT valid_list_type CHECK (list_type IN ('checklist', 'simple', 'ranked')),
  CONSTRAINT valid_list_sort CHECK (default_sort IN ('manual', 'created', 'priority', 'due_date'))
);

-- List Items: Individual items within a list
CREATE TABLE IF NOT EXISTS list_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Parent list
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  
  -- Content
  content TEXT NOT NULL,
  notes TEXT,                              -- Additional notes on this item
  
  -- Checklist state
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  
  -- Priority (for ranked lists)
  priority INTEGER DEFAULT 0,              -- Higher = more important
  
  -- Due date (optional)
  due_at TIMESTAMPTZ,
  
  -- Entity relationship (item can reference an entity)
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  
  -- Ordering
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Soft delete  
  archived_at TIMESTAMPTZ
);

-- Indexes for lists
CREATE INDEX IF NOT EXISTS idx_lists_primary_entity ON lists (primary_entity_id);
CREATE INDEX IF NOT EXISTS idx_lists_category ON lists (category);
CREATE INDEX IF NOT EXISTS idx_lists_type ON lists (list_type);
CREATE INDEX IF NOT EXISTS idx_lists_pinned ON lists (is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_lists_created ON lists (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lists_archived ON lists (archived_at) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lists_embedding ON lists 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN index for tags array
CREATE INDEX IF NOT EXISTS idx_lists_tags ON lists USING GIN (tags);

-- Indexes for list_items
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items (list_id);
CREATE INDEX IF NOT EXISTS idx_list_items_entity ON list_items (entity_id);
CREATE INDEX IF NOT EXISTS idx_list_items_completed ON list_items (is_completed);
CREATE INDEX IF NOT EXISTS idx_list_items_due ON list_items (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_list_items_sort ON list_items (list_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_list_items_archived ON list_items (archived_at) WHERE archived_at IS NULL;

-- Composite index for common query: active items in a list, ordered
CREATE INDEX IF NOT EXISTS idx_list_items_active_ordered ON list_items (list_id, sort_order) 
  WHERE archived_at IS NULL;

COMMENT ON TABLE lists IS 'User-created lists (checklists, simple lists, ranked lists) with optional entity relationships';
COMMENT ON TABLE list_items IS 'Individual items within a list, can be linked to entities';
COMMENT ON COLUMN lists.list_type IS 'checklist (checkable items), simple (no state), ranked (priority ordering)';
COMMENT ON COLUMN lists.default_sort IS 'How items are sorted by default: manual, created, priority, or due_date';
COMMENT ON COLUMN list_items.sort_order IS 'Manual ordering - lower numbers appear first';
COMMENT ON COLUMN list_items.priority IS 'For ranked lists - higher values = more important';
