# NOTES & LISTS DESIGN PLAN

## Squire Feature Extension - Architecture & Implementation Blueprint

**Version:** 1.0.0  
**Date:** December 29, 2025  
**Status:** Design Complete - Ready for Review

---

# PART 1: VISION

## The Core Insight

Notes and Lists extend Squire's memory system from **passive observation** to **active user authoring**. The user can explicitly tell Squire "remember this about X" rather than relying solely on extraction from conversation.

**Key value**: Entity relationships make notes and lists **contextually retrievable**. "What do I know about Central Va Flooring?" returns the meeting notes, the bug list, the follow-up tasks - all connected.

## Use Cases

### Notes
- "Squire, take a note about Central Va Flooring - they want LVP in the kitchen"
- "Add a note to the Johnson project - client prefers matte finish"
- "Note: Dr. Smith recommended reducing caffeine" (health context)
- Quick capture during calendar events with automatic event linking

### Lists
- "Start a list for Squire App bugs"
- "Add 'fix modal z-index' to the Squire bugs list"
- "Create a grocery list" (simple, no entity)
- "Start a checklist for the Atlanta trip" (with travel entity)
- "What's on my Central Va Flooring punch list?"

---

# PART 2: DATA MODEL

## 2.1 Notes Table (022_notes.sql)

```sql
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Core content
  title VARCHAR(500),                      -- Optional title (can be null for quick notes)
  content TEXT NOT NULL,                   -- The note body (markdown supported)
  
  -- Underlying memory (notes create memories for graph integration)
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,
  
  -- Source tracking
  source_type VARCHAR(20) NOT NULL DEFAULT 'manual',  -- 'manual' | 'voice' | 'chat' | 'calendar_event'
  source_context JSONB DEFAULT '{}',       -- e.g., {calendar_event_id: "...", meeting_title: "..."}
  
  -- Entity relationships (denormalized for quick access, canonical in entity_mentions)
  primary_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  entity_ids UUID[] DEFAULT '{}',          -- All linked entities
  
  -- Organization
  category VARCHAR(100),                   -- 'work' | 'personal' | 'health' | 'project' | custom
  tags TEXT[] DEFAULT '{}',
  is_pinned BOOLEAN DEFAULT FALSE,
  
  -- Display
  color VARCHAR(20),                       -- Optional color coding
  
  -- Embedding for semantic search
  embedding vector(768),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Soft delete
  archived_at TIMESTAMPTZ,
  
  CONSTRAINT valid_note_source CHECK (source_type IN ('manual', 'voice', 'chat', 'calendar_event'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notes_memory ON notes (memory_id);
CREATE INDEX IF NOT EXISTS idx_notes_primary_entity ON notes (primary_entity_id);
CREATE INDEX IF NOT EXISTS idx_notes_category ON notes (category);
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes (is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes (archived_at) WHERE archived_at IS NULL;

-- Vector search
CREATE INDEX IF NOT EXISTS idx_notes_embedding ON notes 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN index for entity_ids array
CREATE INDEX IF NOT EXISTS idx_notes_entities ON notes USING GIN (entity_ids);

COMMENT ON TABLE notes IS 'User-authored notes with entity relationships for contextual retrieval';
COMMENT ON COLUMN notes.primary_entity_id IS 'Main entity this note is about (e.g., "Central Va Flooring")';
COMMENT ON COLUMN notes.entity_ids IS 'All entities mentioned in or linked to this note';
```

## 2.2 Lists Table (023_lists.sql)

```sql
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
  
  CONSTRAINT valid_list_type CHECK (list_type IN ('checklist', 'simple', 'ranked'))
);

-- List Items
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
CREATE INDEX IF NOT EXISTS idx_lists_pinned ON lists (is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_lists_created ON lists (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lists_archived ON lists (archived_at) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lists_embedding ON lists 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Indexes for list_items
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items (list_id);
CREATE INDEX IF NOT EXISTS idx_list_items_entity ON list_items (entity_id);
CREATE INDEX IF NOT EXISTS idx_list_items_completed ON list_items (is_completed);
CREATE INDEX IF NOT EXISTS idx_list_items_due ON list_items (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_list_items_sort ON list_items (list_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_list_items_archived ON list_items (archived_at) WHERE archived_at IS NULL;

COMMENT ON TABLE lists IS 'User-created lists (checklists, simple lists, ranked lists) with optional entity relationships';
COMMENT ON TABLE list_items IS 'Individual items within a list, can be linked to entities';
COMMENT ON COLUMN lists.list_type IS 'checklist (checkable items), simple (no state), ranked (priority ordering)';
COMMENT ON COLUMN list_items.sort_order IS 'Manual ordering - lower numbers appear first';
```

---

# PART 3: SERVICE LAYER

## 3.1 Notes Service (src/services/notes.ts)

```typescript
// Core Operations
createNote(input: CreateNoteInput): Promise<Note>
getNote(id: string): Promise<Note | null>
updateNote(id: string, input: UpdateNoteInput): Promise<Note>
archiveNote(id: string): Promise<void>
deleteNote(id: string): Promise<void>  // Hard delete

// Queries
listNotes(options: ListNotesOptions): Promise<Note[]>
searchNotes(query: string, options?: SearchOptions): Promise<Note[]>
getNotesByEntity(entityId: string): Promise<Note[]>
getPinnedNotes(): Promise<Note[]>

// Entity linking
linkNoteToEntity(noteId: string, entityId: string, isPrimary?: boolean): Promise<void>
unlinkNoteFromEntity(noteId: string, entityId: string): Promise<void>

// Export
exportNotes(options: ExportOptions): Promise<ExportResult>
```

## 3.2 Lists Service (src/services/lists.ts)

```typescript
// List Operations
createList(input: CreateListInput): Promise<List>
getList(id: string, includeItems?: boolean): Promise<ListWithItems | null>
updateList(id: string, input: UpdateListInput): Promise<List>
archiveList(id: string): Promise<void>
deleteList(id: string): Promise<void>

// List Queries
listLists(options: ListListsOptions): Promise<List[]>
searchLists(query: string): Promise<List[]>
getListsByEntity(entityId: string): Promise<List[]>

// Item Operations
addItem(listId: string, input: AddItemInput): Promise<ListItem>
updateItem(itemId: string, input: UpdateItemInput): Promise<ListItem>
removeItem(itemId: string): Promise<void>
reorderItems(listId: string, itemIds: string[]): Promise<void>

// Checklist specific
toggleItem(itemId: string): Promise<ListItem>
completeItem(itemId: string): Promise<ListItem>
uncompleteItem(itemId: string): Promise<ListItem>
getCompletionStats(listId: string): Promise<{completed: number, total: number, percentage: number}>

// Bulk operations
completeAllItems(listId: string): Promise<void>
clearCompletedItems(listId: string): Promise<void>

// Export
exportList(listId: string, format: 'json' | 'markdown' | 'csv'): Promise<string>
exportAllLists(options: ExportOptions): Promise<ExportResult>
```

---

# PART 4: API ROUTES

## 4.1 Notes Routes (src/api/routes/notes.ts)

```
GET    /api/notes              - List notes (paginated, filterable)
GET    /api/notes/search       - Semantic search notes
GET    /api/notes/pinned       - Get pinned notes
GET    /api/notes/:id          - Get single note
POST   /api/notes              - Create note
PUT    /api/notes/:id          - Update note
DELETE /api/notes/:id          - Archive note (soft delete)
DELETE /api/notes/:id/permanent - Hard delete

POST   /api/notes/:id/entities/:entityId  - Link entity
DELETE /api/notes/:id/entities/:entityId  - Unlink entity
POST   /api/notes/:id/pin      - Pin note
DELETE /api/notes/:id/pin      - Unpin note

GET    /api/notes/export       - Export notes (query params for format/filter)
```

## 4.2 Lists Routes (src/api/routes/lists.ts)

```
GET    /api/lists              - List all lists
GET    /api/lists/search       - Search lists
GET    /api/lists/:id          - Get list with items
POST   /api/lists              - Create list
PUT    /api/lists/:id          - Update list
DELETE /api/lists/:id          - Archive list

GET    /api/lists/:id/items    - Get items only
POST   /api/lists/:id/items    - Add item
PUT    /api/lists/:id/items/:itemId    - Update item
DELETE /api/lists/:id/items/:itemId    - Remove item
POST   /api/lists/:id/items/reorder    - Reorder items

POST   /api/lists/:id/items/:itemId/toggle    - Toggle completion
POST   /api/lists/:id/items/:itemId/complete  - Mark complete
POST   /api/lists/:id/items/:itemId/uncomplete - Mark incomplete
POST   /api/lists/:id/complete-all    - Complete all items
POST   /api/lists/:id/clear-completed - Remove completed items

GET    /api/lists/:id/export   - Export single list
GET    /api/lists/export       - Export all lists
```

---

# PART 5: LLM INTEGRATION

## 5.1 Chat Extraction Enhancement

Update `src/services/chatExtraction.ts` to detect note and list intents:

```typescript
interface ExtractedIntent {
  type: 'note' | 'list_create' | 'list_add' | 'list_query' | 'commitment' | 'reminder';
  confidence: number;
  data: NoteIntent | ListIntent | ...;
}

interface NoteIntent {
  content: string;
  title?: string;
  entityName?: string;        // "Central Va Flooring"
  entityType?: EntityType;
  category?: string;
  sourceContext?: {
    calendarEventId?: string;
    meetingTitle?: string;
  };
}

interface ListIntent {
  action: 'create' | 'add_item' | 'query' | 'complete' | 'show';
  listName?: string;
  itemContent?: string;
  entityName?: string;
}
```

## 5.2 LLM Prompt Patterns

```
User: "Take a note about Central Va Flooring - they want LVP in the kitchen, budget is $5k"
→ Detect: note intent
→ Extract: entity "Central Va Flooring" (organization)
→ Create: note with content, link to entity

User: "Start a list for Squire App bugs"
→ Detect: list_create intent
→ Extract: entity "Squire App" (project)
→ Create: checklist linked to entity

User: "Add 'fix modal z-index' to the Squire bugs list"
→ Detect: list_add intent
→ Resolve: list by name "Squire bugs"
→ Add: item to list

User: "What's on my flooring punch list?"
→ Detect: list_query intent
→ Resolve: list by semantic search + entity context
→ Return: list items
```

## 5.3 Context Injection

Notes and lists feed into context injection for relevant conversations:

```typescript
// In context building, include relevant notes/lists
if (entities.includes('Central Va Flooring')) {
  context.notes = await getNotesByEntity(entityId);
  context.lists = await getListsByEntity(entityId);
}
```

---

# PART 6: WEB UI

## 6.1 Notes UI Components

```
src/web/src/lib/components/
├── notes/
│   ├── NoteCard.svelte          - Individual note display
│   ├── NoteEditor.svelte        - Create/edit note modal
│   ├── NotesList.svelte         - List of notes with filters
│   ├── NotesGrid.svelte         - Grid layout option
│   ├── NoteSearch.svelte        - Search interface
│   ├── EntityPicker.svelte      - Select/create entity links
│   └── PinnedNotes.svelte       - Pinned notes sidebar/widget
```

### Note Card Features
- Title + content preview (truncated)
- Primary entity badge
- Category/tags display
- Pin toggle
- Quick actions: edit, archive, delete
- Created/updated timestamp
- Color indicator (if set)

### Note Editor Features
- Rich text / markdown support
- Entity search + link
- Category dropdown
- Tag input
- Color picker
- Source indicator (manual/voice/chat)

## 6.2 Lists UI Components

```
src/web/src/lib/components/
├── lists/
│   ├── ListCard.svelte          - List preview card
│   ├── ListView.svelte          - Full list view with items
│   ├── ListEditor.svelte        - Create/edit list modal
│   ├── ListItem.svelte          - Individual item row
│   ├── ListItemEditor.svelte    - Edit item inline/modal
│   ├── DraggableList.svelte     - Drag-to-reorder wrapper
│   └── ListProgress.svelte      - Completion progress bar
```

### List View Features
- Checklist: checkboxes with strike-through on complete
- Drag-to-reorder items
- Inline item editing
- Add item input at bottom
- Progress bar (X of Y complete)
- Bulk actions: complete all, clear completed
- Entity link display

### List Item Features
- Checkbox (for checklists)
- Content text
- Due date indicator
- Entity badge (if linked)
- Priority indicator (for ranked)
- Quick actions: edit, delete

## 6.3 Navigation Integration

```
Main nav additions:
├── Notes (icon: document)
│   ├── All Notes
│   ├── Pinned
│   └── By Category
├── Lists (icon: list)
│   ├── All Lists
│   ├── Active Checklists
│   └── By Entity
```

---

# PART 7: EXPORT

## 7.1 Export Formats

### Notes Export
- **JSON**: Full structured data with metadata
- **Markdown**: Human-readable, importable elsewhere
- **CSV**: Spreadsheet-friendly flat format

### Lists Export
- **JSON**: Full list + items structure
- **Markdown**: Checkbox format (- [ ] item)
- **CSV**: Flat with list_name, item columns
- **Plain text**: Simple numbered/bulleted list

## 7.2 Export Options

```typescript
interface ExportOptions {
  format: 'json' | 'markdown' | 'csv' | 'txt';
  
  // Filtering
  entityId?: string;           // Only notes/lists for this entity
  category?: string;
  dateRange?: { from: Date; to: Date };
  includeArchived?: boolean;
  
  // Content options
  includeMetadata?: boolean;   // timestamps, IDs, etc.
  includeEntities?: boolean;   // Embed entity info
  
  // For lists
  includeCompleted?: boolean;
  onlyCompleted?: boolean;
}
```

## 7.3 Export Endpoints

```
GET /api/notes/export?format=markdown&entityId=xxx
GET /api/lists/:id/export?format=markdown
GET /api/lists/export?format=json&category=work
```

---

# PART 8: IMPLEMENTATION PHASES

## Phase 1: Schema & Core Services (2-3 hours) ✅ COMPLETE
- [x] Create 022_notes.sql schema
- [x] Create 023_lists.sql schema  
- [x] Run migrations
- [x] Implement notes.ts service (CRUD + search + entity linking + export)
- [x] Implement lists.ts service (CRUD + items + checklist ops + export)
- [ ] Unit tests for services (deferred to Phase 7)

## Phase 2: API Routes (1-2 hours) ✅ COMPLETE
- [x] Notes routes with validation (src/api/routes/notes.ts)
- [x] Lists routes with validation (src/api/routes/lists.ts)
- [x] Entity linking endpoints
- [ ] Integration tests (deferred to Phase 7)

## Phase 3: LLM Integration (2-3 hours) ✅ COMPLETE
- [x] Update chatExtraction.ts with note/list intent detection
- [x] Entity resolution for note/list creation
- [x] Context injection updates
- [x] Test with sample conversations

## Phase 4: Web UI - Notes (3-4 hours) ✅ COMPLETE
- [x] NoteCard component
- [x] NoteEditor component (create/edit modal)
- [x] NotesList with filtering
- [x] EntityPicker component
- [x] Notes page route
- [x] Pinned notes widget

## Phase 5: Web UI - Lists (3-4 hours) ✅ COMPLETE
- [x] ListCard component with progress indicators
- [x] ListView with items + drag-to-reorder (Framer Motion Reorder)
- [x] Inline item editing (double-click to edit)
- [x] ListItemRow with toggle/edit/delete
- [x] ListEditor modal for create/edit lists
- [x] ListsList with filters/search
- [x] ListDetailView slide-out panel
- [x] Lists page route at /app/lists
- [x] SideNav integration
- [x] ActiveListsPanel dashboard widget

## Phase 6: Export & Polish (2 hours) ✅ COMPLETE
- [x] Export service implementation (already done in Phase 1 services)
- [x] Export API endpoints (already done in Phase 2 routes)
- [x] Export UI (ExportModal component, buttons in NotesList, ListsList, ListDetailView)
- [x] Documentation update

## Phase 7: Testing & Integration (2 hours)
- [ ] End-to-end testing
- [ ] Voice command testing (if applicable)
- [ ] Performance testing with many notes/lists
- [ ] Bug fixes

**Total Estimated: 15-20 hours**

---

# PART 9: ACCEPTANCE TESTS

## Notes
```bash
# Create note via chat
"Take a note about Central Va Flooring - they want LVP"
→ Note created, linked to entity "Central Va Flooring"

# Query notes
"What notes do I have about Central Va Flooring?"
→ Returns all linked notes

# UI create
→ Can create note, set category, link entities
→ Note appears in list, searchable

# Export
GET /api/notes/export?format=markdown&entityId=xxx
→ Returns formatted markdown with all notes
```

## Lists
```bash
# Create list via chat
"Start a list for Squire bugs"
→ Checklist created, linked to "Squire" project entity

# Add item via chat
"Add 'fix modal z-index' to the Squire bugs list"
→ Item added to list

# UI interactions
→ Can check/uncheck items
→ Can drag to reorder
→ Progress bar updates
→ Can complete all / clear completed

# Export
GET /api/lists/squire-bugs/export?format=markdown
→ Returns:
# Squire Bugs
- [x] Fix modal z-index
- [ ] Handle edge case in search
```

---

# PART 10: OPEN QUESTIONS

1. **Note versioning**: Do we need edit history? (Recommend: No for MVP)
2. **Collaborative lists**: Multi-user? (Recommend: No, single-user matches Squire philosophy)
3. **List templates**: Pre-built templates? (Recommend: Future feature)
4. **Calendar auto-link**: Auto-create note when calendar event starts? (Recommend: Yes, optional setting)
5. **Rich text vs markdown**: What level of formatting? (Recommend: Markdown with preview)

---

**Document Status**: Implementation Complete (Phases 1-6)  
**Remaining**: Phase 7 - Testing & Integration

*December 29, 2025*
