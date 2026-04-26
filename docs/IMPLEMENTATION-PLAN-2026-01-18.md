# Squire Implementation Plan - 2026-01-18

## Overview

This document provides detailed implementation guidance for all issues identified in the comprehensive review run. Each task includes file locations, specific code changes, and dependencies.

---

## Critical Priority Tasks

### TASK-C1: Update System Prompt to include Notes guidance

**Context**: The LLM doesn't know to use notes tools because the system prompt only mentions "calendar, reminders, and lists" - notes is missing.

**Files to Modify**:
1. `src/services/chat.ts` - REST API system prompt
2. `src/api/socket/handlers.ts` - Socket.IO system prompt

**Implementation**:

In `chat.ts`, find SQUIRE_SYSTEM_PROMPT and update the tools section:
```typescript
// BEFORE
"Tools for calendar, reminders, and lists"

// AFTER
"Tools for notes, calendar, reminders, and lists"
```

Add guidance after the tools mention:
```typescript
"When the user says 'take a note', 'remember this', 'note that', or wants to save information for later, use the create_note tool.
When the user asks about their notes or what they wrote down, use search_notes or list_recent_notes."
```

In `handlers.ts`, update TOOL_CALLING_INSTRUCTIONS similarly. Add notes guidance alongside existing calendar guidance.

**Dependencies**: None
**Verification**: Test in chat: "Take a note that I prefer morning meetings" - should call create_note

---

## High Priority Tasks

### TASK-H1: Consolidate duplicate System Prompts

**Context**: Two separate system prompts exist with different content, causing inconsistent behavior.

**Implementation**:

1. Create new file `src/constants/prompts.ts`:
```typescript
export const SQUIRE_SYSTEM_PROMPT = `...consolidated prompt...`;
export const TOOL_CALLING_INSTRUCTIONS = `...tool instructions...`;
```

2. Update `src/services/chat.ts`:
```typescript
import { SQUIRE_SYSTEM_PROMPT, TOOL_CALLING_INSTRUCTIONS } from '../constants/prompts';
```

3. Update `src/api/socket/handlers.ts`:
```typescript
import { SQUIRE_SYSTEM_PROMPT, TOOL_CALLING_INSTRUCTIONS } from '../../constants/prompts';
```

**Dependencies**: TASK-C1 should be done first so the consolidated prompt is correct
**Verification**: Both REST and Socket paths should produce identical system prompts

### TASK-H2: Add Tool Calling Instructions to REST chat.ts

**Context**: REST API path lacks explicit when-to-use guidance that Socket path has.

**Implementation**:

After consolidating prompts (TASK-H1), ensure `chat.ts` uses the same TOOL_CALLING_INSTRUCTIONS:

```typescript
const systemMessage = {
  role: 'system',
  content: `${SQUIRE_SYSTEM_PROMPT}\n\n${TOOL_CALLING_INSTRUCTIONS}\n\n${contextContent}`
};
```

**Dependencies**: TASK-H1
**Verification**: REST API calls should show same tool-calling behavior as Socket

---

## Medium Priority Tasks

### TASK-M1: Add entity_name parameter to create_note tool

**File**: `src/tools/notes.ts`

**Implementation**:

1. Update CreateNoteArgs interface (~line 195):
```typescript
interface CreateNoteArgs {
  content: string;
  title?: string;
  category?: string;
  tags?: string[];
  is_pinned?: boolean;
  entity_name?: string;  // NEW - optional entity to link
}
```

2. Update tool parameters definition (~line 200):
```typescript
entity_name: {
  type: 'string',
  description: 'Name of a person, project, or entity to link this note to (optional)'
}
```

3. In the handler, resolve entity and link (~line 240):
```typescript
if (args.entity_name) {
  const entity = await findEntityByName(args.entity_name);
  if (entity) {
    await notesService.linkNoteToEntity(note.id, entity.id);
  }
}
```

**Dependencies**: Need to import entities service
**Verification**: "Take a note about Sarah: she loves hiking" should create note linked to Sarah entity

### TASK-M2: Add embedding-based similarity to findSimilarBelief()

**File**: `src/services/beliefs.ts`

**Implementation**:

Update findSimilarBelief() (~lines 151-175):
```typescript
async function findSimilarBelief(content: string): Promise<Belief | null> {
  // First try exact match (existing code)
  const exactMatch = await pool.query(
    `SELECT * FROM beliefs WHERE LOWER(content) = $1 AND status = 'active'`,
    [content.toLowerCase()]
  );
  if (exactMatch.rows.length > 0) return exactMatch.rows[0];

  // NEW: Try embedding similarity
  const embedding = await generateEmbedding(content);
  const similarResult = await pool.query(
    `SELECT *, 1 - (embedding <=> $1::vector) as similarity
     FROM beliefs
     WHERE embedding IS NOT NULL AND status = 'active'
     AND 1 - (embedding <=> $1::vector) >= 0.85
     ORDER BY similarity DESC
     LIMIT 1`,
    [JSON.stringify(embedding)]
  );
  if (similarResult.rows.length > 0) return similarResult.rows[0];

  return null;
}
```

**Dependencies**: None
**Verification**: Creating beliefs with paraphrased content should match existing beliefs

### TASK-M3: Wire entity name resolution to Beliefs

**File**: `src/services/beliefs.ts`

**Implementation**:

In processMemoryForBeliefs() (~lines 670-685), update entity resolution:
```typescript
// Find the TODO comment at line 672-673
// Replace:
relatedEntityId: undefined, // TODO: resolve entity_name to entity_id

// With:
relatedEntityId: belief.entity_name
  ? await resolveEntityIdByName(belief.entity_name)
  : undefined,

// Add helper function:
async function resolveEntityIdByName(name: string): Promise<string | undefined> {
  if (!name) return undefined;
  const result = await pool.query(
    `SELECT id FROM entities WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [name]
  );
  return result.rows[0]?.id;
}
```

**Dependencies**: None
**Verification**: Beliefs about "Sarah" should link to Sarah entity

### TASK-M4: Fix schema comment mismatch

**File**: `schema/018_commitments.sql`

**Implementation**:

Find line 91 and update comment:
```sql
-- BEFORE
embedding vector(768), -- 384-dim vector

-- AFTER
embedding vector(768), -- 768-dim vector for nomic-embed-text
```

**Dependencies**: None
**Verification**: Schema documentation is accurate

### TASK-M5: Implement Object ID extraction

**File**: `src/services/documents/extractor.ts`

**Implementation**:

Update the objectId case (~lines 136-142):
```typescript
case 'objectId': {
  if (!source.objectId) {
    throw new Error('objectId required for objectId source');
  }
  // Import objects service at top of file
  const objectData = await objectsService.getObject(source.objectId);
  if (!objectData || !objectData.data) {
    throw new Error(`Object ${source.objectId} not found or has no data`);
  }
  // Get buffer from stored object
  const buffer = await objectsService.getObjectBuffer(source.objectId);
  const mimeType = objectData.mime_type || 'application/octet-stream';
  return await extractFromBuffer(buffer, mimeType, options);
}
```

**Dependencies**: Need to add getObjectBuffer function to objects service if not exists
**Verification**: Can extract text from object by ID

### TASK-M6: Fix reminders embedding search issue

**File**: `src/tools/commitments.ts` or `schema/019_reminders.sql`

**Option A - Remove dead code (simpler)**:

In `src/tools/commitments.ts:59-83`, remove the embedding search fallback for reminders:
```typescript
// Remove the embedding search attempt for reminders
// Just use text search
const reminders = await findMatchingRemindersByTitle(query);
```

**Option B - Add embedding column (more work)**:

Add embedding column to reminders table and update service to populate it.

**Recommendation**: Option A is safer and simpler
**Dependencies**: None
**Verification**: Reminder search works without errors

---

## Low Priority Tasks

### TASK-L1: Lower reinforcement similarity threshold

**File**: `src/services/reinforcement.ts:33`

```typescript
// BEFORE
const SIMILARITY_THRESHOLD = 0.85;

// AFTER
const SIMILARITY_THRESHOLD = 0.80;
```

**Verification**: Paraphrased memories boost confidence more often

### TASK-L2: Make provider endpoint URLs configurable

**File**: `src/providers/llm.ts`

Add to config and use environment variables:
```typescript
const GROQ_API_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
const XAI_API_URL = process.env.XAI_API_URL || 'https://api.x.ai/v1/chat/completions';
// etc.
```

### TASK-L3: Make streaming timeout configurable

**File**: `src/api/socket/handlers.ts:752`

```typescript
// BEFORE
const API_TIMEOUT_MS = 30000;

// AFTER
const API_TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS || '30000', 10);
```

### TASK-L4: Fix commitment tool duplicate items

**File**: `src/tools/commitments.ts:163-165`

Filter out commitment-linked reminders:
```typescript
// Filter reminders that are linked to commitments already in the list
const filteredReminders = reminders.filter(r =>
  !commitments.some(c => c.reminder_id === r.id)
);
const allItems = [...commitments, ...filteredReminders];
```

### TASK-L5: Consider raising document search threshold

**Files**: `src/services/documents/search.ts:89` and `src/services/context.ts:808`

Raise from 0.4/0.5 to 0.6:
```typescript
const DEFAULT_THRESHOLD = 0.6;
```

### TASK-L6: Improve VAPID_SUBJECT default

**File**: `src/services/push.ts:62`

```typescript
// BEFORE
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@squire.local';

// AFTER - require explicit configuration
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;
if (!VAPID_SUBJECT) {
  console.warn('VAPID_SUBJECT not set - push notifications will not work');
}
```

---

## Task Dependencies Graph

```
TASK-C1 (Notes in prompt)
    ↓
TASK-H1 (Consolidate prompts)
    ↓
TASK-H2 (Add tool instructions to REST)

All others are independent and can be done in parallel.
```

---

## Suggested Execution Order

**Instance 2**: TASK-C1 (Critical - most important fix)
**Instance 3**: TASK-H1 + TASK-H2 (Depends on C1)
**Instance 4**: TASK-M1 + TASK-M2 (Medium priority, independent)
**Instance 5**: TASK-M3 + TASK-M4 (Medium priority, independent)
**Instance 6**: TASK-M5 + TASK-M6 (Medium priority, independent)
**Instance 7+**: Low priority tasks
**Final Instance**: Validation and deployment

---

## Deployment Command

After all changes:
```bash
ssh hetzner 'cd /opt/squire && git pull && npm run build && sudo systemctl restart squire squire-web'
```

---

*Created by Instance 1 on 2026-01-18*
*Run ID: squire-implementation-v1*
