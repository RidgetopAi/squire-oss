# Squire Bug Report - 2025-12-27

## BUG-001: Chat History Not Persisted

**Severity:** High
**Status:** Open
**Discovered:** 2025-12-27

### Summary

The chat LLM interface does not persist conversation history. All chat messages are lost on page refresh, browser close, or new session.

### Impact

This is a significant gap for a system branded as "a personal AI companion with perfect memory." The irony: Squire remembers everything ABOUT conversations (memories, entities, beliefs, patterns) but forgets the actual conversations themselves.

### Technical Details

**Root Cause:** No database storage for chat history exists.

**Evidence:**

1. **No database table** - Schema files (001-016) contain no `chat_history`, `conversations`, or `messages` table

2. **Frontend store is in-memory only** - `web/src/lib/stores/chatStore.ts:78-80`
   ```typescript
   messages: [],  // Just an array in memory
   conversationId: null,
   ```
   - Uses Zustand with no persistence middleware
   - No localStorage, no database calls

3. **Backend service is stateless** - `src/services/chat.ts:102-111`
   ```typescript
   export async function chat(request: ChatRequest): Promise<ChatResponse> {
     const { conversationHistory = [], ... } = request;
   ```
   - Expects client to send history each request
   - Never saves anything to database

### Current Behavior

- Page refresh → All chat history gone
- Browser close → All chat history gone
- New session → Starts completely fresh
- No way to resume previous conversations

### Expected Behavior

- Chat history persisted to database
- Conversations loadable on return
- History available across sessions
- Option to view/search past conversations

### Proposed Solution

1. Create `conversations` table (id, created_at, updated_at, title, summary)
2. Create `chat_messages` table (id, conversation_id, role, content, context_disclosure_id, created_at)
3. Add API endpoints for conversation CRUD
4. Update chatStore to load/save conversations
5. Add conversation list/selector in UI

### Files Affected

- `schema/` - New migration needed
- `src/services/chat.ts` - Add persistence logic
- `src/api/routes/chat.ts` - Add conversation endpoints
- `web/src/lib/stores/chatStore.ts` - Add persistence
- `web/src/lib/api/chat.ts` - Add conversation API calls
- `web/src/components/chat/` - Add conversation selector UI

---

## BUG-002: Emotional Tagging Not Implemented

**Severity:** Medium
**Status:** Open
**Discovered:** 2025-12-27

### Summary

Per-memory emotional tagging (from design doc) was never implemented. The schema lacks emotion columns, and no extraction logic exists.

### Design vs Reality

**Design Doc (SQUIRE-DESIGN-PLAN.md:196-201):**
```sql
-- Emotional Tagging (PER-MEMORY)
primary_emotion VARCHAR(30),        -- joy, sadness, anger, fear, etc.
emotion_intensity FLOAT,            -- 0.0-1.0
emotional_valence VARCHAR(10),      -- positive, negative, neutral
emotional_arousal VARCHAR(10),      -- high, low
```

**Actual Schema (003_memories.sql):** None of these columns exist.

### Impact

- Vision diagram shows "Emotional Tagging" as key part of Daytime/Active phase
- Salience scoring is missing "emotional_intensity" factor (0.20 weight in design)
- No way to query memories by emotional content
- Living summaries can't track emotional patterns accurately

### Proposed Solution

1. Add migration with emotion columns to memories table
2. Create emotion extraction service (LLM-based or heuristic)
3. Integrate with memory ingestion pipeline
4. Add emotional_intensity to salience scoring

---

## BUG-003: Salience Missing 2 of 8 Factors

**Severity:** Low
**Status:** Open
**Discovered:** 2025-12-27

### Summary

Salience scoring has 6 factors instead of the designed 8. Missing: `emotional_intensity` and `novelty`.

### Design vs Implementation

| Factor | Design Weight | Implemented |
|--------|---------------|-------------|
| emotional_intensity | 0.20 | ❌ Missing |
| novelty | 0.15 | ❌ Missing |
| self_reference | 0.15 | ✅ 0.15 |
| relationship | 0.15 | ✅ 0.20 |
| temporal_relevance | 0.10 | ✅ 0.20 |
| explicit_marking | 0.10 | ✅ 0.15 |
| action_density | 0.10 | ✅ 0.20 |
| context_richness | 0.05 | ✅ 0.10 (as length_complexity) |

### Impact

- Emotionally significant memories may score lower than intended
- Novel/surprising information doesn't get boosted
- Weights were rebalanced (total still 1.0) but distribution differs

### Proposed Solution

1. Add novelty calculation (compare embedding to recent memories)
2. Add emotional_intensity factor (requires BUG-002 fix first)
3. Re-tune weights after both factors added

---

## AUDIT SUMMARY: Design vs Implementation

### ✅ WORKING AS DESIGNED

| Feature | Status | Notes |
|---------|--------|-------|
| Salience Scoring | ✅ Implemented | 6/8 factors, heuristic-based |
| Decay Mechanism | ✅ Implemented | Full decay/strengthen in consolidation |
| Edge Formation | ✅ Implemented | SIMILAR edges, Hebbian learning, pruning |
| Context Injection | ✅ Implemented | Profiles, scoring, token budgeting, disclosure log |
| Consolidation Pipeline | ✅ Implemented | Full: decay → edges → patterns → insights → research |
| Entity Extraction | ✅ Implemented | Regex + name detection |
| Living Summaries | ✅ Implemented | 8 categories, incremental updates |
| Beliefs System | ✅ Implemented | Extraction and storage |
| Patterns Detection | ✅ Implemented | 6 pattern types |
| Insights Generation | ✅ Implemented | Cross-analysis during consolidation |

### ❌ GAPS FOUND

| Gap | Severity | Bug ID |
|-----|----------|--------|
| Chat history not persisted | High | BUG-001 |
| Emotional tagging missing | Medium | BUG-002 |
| Salience missing 2 factors | Low | BUG-003 |

---

## Priority Recommendation

1. **BUG-001** (High) - Chat persistence is table stakes for "perfect memory"
2. **BUG-002** (Medium) - Emotions are key differentiator in vision
3. **BUG-003** (Low) - Can wait until BUG-002 is done

