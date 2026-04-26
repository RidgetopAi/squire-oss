# Squire Implementation Checkpoint

## Status: COMPLETE

## Revert Point
Commit: 996d7e5

---

## Implementation Tasks

### Critical Priority

- [x] **TASK-C1**: Update System Prompt to include Notes guidance
  - **File**: `src/services/chat.ts:86` AND `src/api/socket/handlers.ts:211-269`
  - **Issue**: System prompt says "Tools for calendar, reminders, and lists" but omits notes
  - **Fix**: Add notes to tool guidance, add "Take a note about..." / "Remember this..." guidance
  - **Impact**: LLM unaware it should use create_note tool
  - **Review Instance**: 2, 6 (both flagged this)
  - **Completed by**: Instance 2 | Commit: 1fc3733

### High Priority

- [x] **TASK-H1**: Consolidate duplicate System Prompts into shared constant
  - **Files**: `src/services/chat.ts:76-121` AND `src/api/socket/handlers.ts:211-269`
  - **Issue**: Two separate SQUIRE_SYSTEM_PROMPT definitions with different content
  - **Fix**: Create shared prompt in constants file, import in both locations
  - **Impact**: Inconsistency between REST and Socket flows
  - **Review Instance**: 6
  - **Completed by**: Instance 3 | Commit: 623a5ad

- [x] **TASK-H2**: Add Tool Calling Instructions to REST chat.ts
  - **File**: `src/services/chat.ts:76-121`
  - **Issue**: REST system prompt mentions tools but lacks WHEN-to-use guidance
  - **Fix**: Add TOOL_CALLING_INSTRUCTIONS similar to Socket version
  - **Impact**: REST API callers get worse tool usage than Socket
  - **Review Instance**: 6
  - **Completed by**: Instance 3 | Commit: 623a5ad (done as part of TASK-H1)

### Medium Priority

- [x] **TASK-M1**: Add entity_name parameter to create_note tool
  - **File**: `src/tools/notes.ts:222-228`
  - **Issue**: create_note does not accept entity linking parameters
  - **Fix**: Add entity_name parameter that resolves entity by name via entities service
  - **Impact**: Notes created via LLM cannot be linked to entities automatically
  - **Review Instance**: 2
  - **Completed by**: Instance 4 | Commit: 61e7653

- [x] **TASK-M2**: Add embedding-based similarity to findSimilarBelief()
  - **File**: `src/services/beliefs.ts:151-175`
  - **Issue**: Uses LOWER(content) = $2 for exact match only
  - **Fix**: Add embedding similarity search (threshold 0.85)
  - **Impact**: Similar beliefs with different wording create duplicates
  - **Review Instance**: 3
  - **Completed by**: Instance 5 | Commit: 3b052f7

- [x] **TASK-M3**: Wire entity name resolution to Beliefs
  - **File**: `src/services/beliefs.ts:672-673`
  - **Issue**: relatedEntityId: undefined with TODO comment
  - **Fix**: Add entity resolution when belief_type is about_person or about_project
  - **Impact**: Beliefs about people/projects don't link to entity records
  - **Review Instance**: 3
  - **Completed by**: Instance 6 | Commit: d489d03

- [x] **TASK-M4**: Fix schema comment mismatch on embedding dimension
  - **File**: `schema/018_commitments.sql:91`
  - **Issue**: Comment says "384-dim vector" but column is vector(768)
  - **Fix**: Update comment to "768-dim" to match actual definition
  - **Impact**: Documentation inconsistency
  - **Review Instance**: 7
  - **Completed by**: Instance 7 | Commit: 2a9aa4d

- [x] **TASK-M5**: Implement Object ID extraction in document extractor
  - **File**: `src/services/documents/extractor.ts:136-142`
  - **Issue**: case objectId returns error "Object ID extraction not yet implemented"
  - **Fix**: Implement by fetching object data from objects service
  - **Impact**: Cannot extract from objects already stored by ID
  - **Review Instance**: 8
  - **Completed by**: Instance 7 | Commit: b622ef6

- [x] **TASK-M6**: Add embedding column to reminders table (or remove dead code)
  - **File**: `schema/019_reminders.sql` and `src/tools/commitments.ts:59-83`
  - **Issue**: Tools code tries embedding search on reminders but column may not exist
  - **Fix**: Either add embedding column to reminders OR remove embedding search fallback code
  - **Impact**: Potential query failure on reminder embedding search
  - **Review Instance**: 7
  - **Completed by**: Instance 8 | Commit: d052303

### Low Priority

- [x] **TASK-L1**: Lower reinforcement similarity threshold
  - **File**: `src/services/reinforcement.ts:33`
  - **Issue**: SIMILARITY_THRESHOLD = 0.85 may be too high
  - **Fix**: Consider lowering to 0.80 for paraphrased mentions
  - **Impact**: Paraphrased mentions may not boost confidence
  - **Review Instance**: 3
  - **Completed by**: Instance 9 | Commit: 8d26ede

- [x] **TASK-L2**: Make provider endpoint URLs configurable
  - **File**: `src/providers/llm.ts:66, 172, 277`
  - **Issue**: API endpoints hardcoded (api.groq.com, api.x.ai, etc.)
  - **Fix**: Move to config or environment variables
  - **Impact**: Cannot override endpoints for testing or proxying
  - **Review Instance**: 6
  - **Completed by**: Instance 9 | Commit: 1af4932

- [x] **TASK-L3**: Make streaming timeout configurable
  - **File**: `src/api/socket/handlers.ts:752`
  - **Issue**: API_TIMEOUT_MS = 30000 hardcoded
  - **Fix**: Make configurable via environment variable
  - **Impact**: Long tool chains may timeout unexpectedly
  - **Review Instance**: 6
  - **Completed by**: Instance 9 | Commit: a30f293

- [x] **TASK-L4**: Fix commitment tool duplicate items issue
  - **File**: `src/tools/commitments.ts:103-108`
  - **Issue**: allItems combines commitments and reminders, may show duplicates
  - **Fix**: Filter out commitment-linked reminders from combined list
  - **Impact**: Minor UX issue - same task might appear twice
  - **Review Instance**: 7
  - **Completed by**: Instance 10 | Commit: 0e336e2

- [x] **TASK-L5**: Consider raising document search threshold
  - **Files**: `src/services/documents/search.ts:89` and `src/services/context.ts:808`
  - **Issue**: Default threshold is 0.5/0.4 which may be too permissive
  - **Fix**: Made thresholds configurable via env vars and raised defaults slightly
  - **Impact**: May return less relevant chunks
  - **Review Instance**: 8
  - **Completed by**: Instance 7 | Commit: ef7cd59

- [x] **TASK-L6**: Remove or improve VAPID_SUBJECT default
  - **File**: `src/services/push.ts:62`
  - **Issue**: Default VAPID_SUBJECT is mailto:admin@squire.local (was rejected by Apple)
  - **Fix**: Removed default, added warning when not configured
  - **Impact**: Production uses env var, but default is misleading
  - **Review Instance**: 7
  - **Completed by**: Instance 7 | Commit: dfc9db1

### Optional / Future Enhancements

- [ ] **TASK-O1**: Implement consolidation_runs table for audit trail
  - **Issue**: No formal history of consolidation runs
  - **Fix**: Create schema/xxx_consolidation_runs.sql
  - **Review Instance**: 5

- [ ] **TASK-O2**: Add consolidation_run_id to memory_edges
  - **Issue**: Cannot trace which consolidation run created an edge
  - **Fix**: Add column and populate during processSimilarEdges()
  - **Review Instance**: 5

- [ ] **TASK-O3**: Add embedding-based similarity to findSimilarPattern()
  - **File**: `src/services/patterns.ts:177-196`
  - **Issue**: Uses exact match only (TODO comment present)
  - **Fix**: Add embedding similarity search
  - **Review Instance**: 5

- [ ] **TASK-O4**: Implement fact-to-memory bridge
  - **File**: `schema/029_extracted_facts.sql:75`
  - **Issue**: memory_id column exists but fact→memory conversion not implemented
  - **Fix**: Implement approval workflow that creates memories from approved facts
  - **Review Instance**: 8

- [ ] **TASK-O5**: Add alternative embedding providers
  - **File**: `src/providers/embeddings.ts:53-63`
  - **Issue**: Only Ollama supported, no fallbacks
  - **Fix**: Add Transformers.js or OpenAI embeddings as fallbacks
  - **Review Instance**: 8

---

## Validation Checklist

- [x] `npm run build` passes
- [x] `npm run typecheck` passes (if available)
- [x] No new TypeScript errors introduced
- [x] Changes tested manually where applicable
- [x] Deploy to VPS: `ssh hetzner 'cd /opt/squire && git pull && npm run build && sudo systemctl restart squire squire-web'`

---

## Completion Protocol

When ALL tasks checked AND ALL validation passes:
1. Change Status to: `VALIDATING`
2. Run all validation commands
3. If all pass, change Status to: `COMPLETE`
4. Output: **IMPLEMENTATION_COMPLETE**

---

## Session Log

| Instance | Task | Status | Notes |
|----------|------|--------|-------|
| 1 | Create checkpoint & implementation plan | Complete | CHECKPOINT.md + IMPLEMENTATION-PLAN created |
| 2 | TASK-C1: Add notes to system prompts | Complete | chat.ts + handlers.ts updated, deployed to VPS |
| 3 | TASK-H1 + TASK-H2: Consolidate prompts & add tool instructions to REST | Complete | Created src/constants/prompts.ts, updated both chat.ts and handlers.ts, deployed |
| 4 | TASK-M1: Add entity_name to create_note | Complete | Added entity_name param with searchEntities resolution, deployed to VPS |
| 5 | TASK-M2: Add embedding similarity to findSimilarBelief | Complete | Added schema migration 033, embedding generation in createBelief, similarity search in findSimilarBelief |
| 6 | TASK-M3: Wire entity name resolution to Beliefs | Complete | Added resolveEntityName helper, import searchEntities, wire entity resolution for about_person/about_project beliefs |
| 7 | TASK-M4: Fix schema comment mismatch | Complete | Fixed 384-dim → 768-dim in commitments.embedding COMMENT statement |
| 7 | TASK-M5: Implement object ID extraction | Complete | Added getObjectById/getObjectData integration, handles not found/deleted/read errors, deployed to VPS |
| 8 | TASK-M6: Remove dead reminder embedding code | Complete | Removed unused generateEmbedding import and embedding search fallback from findMatchingReminders(), deployed to VPS |
| 9 | TASK-L1: Lower reinforcement similarity threshold | Complete | Changed SIMILARITY_THRESHOLD from 0.85 to 0.80 for paraphrased mentions, deployed to VPS |
| 9 | TASK-L2: Make provider endpoint URLs configurable | Complete | Added GROQ_URL, XAI_URL, GEMINI_URL env vars to config, updated all LLM providers, deployed to VPS |
| 9 | TASK-L3: Make streaming timeout configurable | Complete | Added LLM_API_TIMEOUT_MS env var to config, updated handlers.ts, deployed to VPS |
| 10 | TASK-L4: Fix commitment duplicate items | Complete | Already done by previous instance (commit 0e336e2), updated checkpoint |
| 7 | TASK-L5: Make search thresholds configurable | Complete | Added config.search section with SEARCH_*_THRESHOLD env vars, raised defaults (commit ef7cd59) |
| 7 | TASK-L6: Remove VAPID_SUBJECT default | Complete | Removed misleading default, added warning when not configured (commit dfc9db1) |

---

## Priority Guide

- **Critical**: Must fix - broken core functionality
- **High**: Should fix - significant gaps in behavior
- **Medium**: Good to fix - improves quality/consistency
- **Low**: Nice to have - polish and edge cases
- **Optional**: Future enhancements - not blocking
