# Squire Comprehensive Review Plan - 2025-01-18

## Overview

This document provides the strategic investigation plan for the Squire codebase review, created by Instance 1 for instances 2-8. Each instance has a dedicated domain with specific investigation questions, files to examine, and deliverables.

---

## Instance 2: Notes & Lists System Review

### Context
The Notes/Lists system was implemented with two major design documents: `NOTES-LISTS-DESIGN-PLAN.md` (structured notes with entity linking) and extraction audit documents showing problems with notes creation during chat.

### Key Questions to Investigate
1. Are notes being created properly during conversations when the LLM calls `create_note`?
2. Is the bidirectional entity-note linking working correctly?
3. Are notes properly searchable via embeddings?
4. Is the `pinnedNotes` feature working in context injection?
5. Are lists properly linked to entities and searchable?

### Files to Examine
- `src/services/notes.ts` - Core notes service (CRUD, search, pinning)
- `src/services/lists.ts` - Lists service (CRUD, items, search)
- `src/tools/notes.ts` - Tool definitions for LLM
- `src/tools/lists.ts` - Tool definitions for LLM
- `src/services/context.ts:753-800` - Notes/lists injection into context
- `src/services/chatExtraction.ts` - How notes might be extracted from chat
- `schema/022_notes.sql` - Notes table structure
- `schema/023_lists.sql` - Lists table structure

### Investigation Tasks
1. Trace the flow when LLM calls `create_note` tool
2. Verify entity linking creates proper records
3. Test embedding-based search in notes
4. Check if `searchNotes` and `searchLists` properly integrate with context generation
5. Review if notes are being extracted during chat extraction

### Deliverables
- Document any issues found with notes/lists creation or retrieval
- Identify gaps between design docs and implementation
- Propose fixes for any broken flows

---

## Instance 3: Memory Extraction & Belief System Review

### Context
The `EXTRACTION-AUDIT-FIX-PLAN.md` details specific problems with how memories and beliefs are extracted from chat conversations. The extraction pipeline is critical for the entire system.

### Key Questions to Investigate
1. Is `chatExtraction.ts` properly extracting memories from conversations?
2. Are beliefs being extracted with appropriate confidence levels?
3. Is the three-tier memory system (tentative/emerging/solid) working?
4. Are entities being properly extracted and linked to memories?
5. Is duplicate detection preventing memory explosion?

### Files to Examine
- `src/services/chatExtraction.ts` - Main extraction pipeline
- `src/services/beliefs.ts` - Belief extraction and management
- `src/services/memories.ts` - Memory CRUD and search
- `src/services/entities.ts` - Entity extraction and linking
- `schema/003_memories.sql` - Memory schema with tier column
- `schema/012_beliefs.sql` - Beliefs schema
- `schema/031_memory_tiers.sql` - Memory tier definitions

### Investigation Tasks
1. Run through a simulated chat extraction to verify the full pipeline
2. Check if `tentative` memories are properly filtered from context injection
3. Verify belief extraction is using appropriate LLM prompts
4. Check entity mention linking in `entity_mentions` table
5. Review duplicate detection logic

### Deliverables
- Detailed report on extraction pipeline health
- Document any silent failures or missing extractions
- Recommendations for improving extraction quality

---

## Instance 4: Story Engine & Context Injection Review

### Context
The Story Engine is a key differentiator - "Generate Not Retrieve" approach. Context injection uses sophisticated scoring with salience, relevance, recency, and strength factors.

### Key Questions to Investigate
1. Is the Story Engine properly traversing the memory graph?
2. Is story intent classification working correctly?
3. Are context profiles being applied correctly?
4. Is the expression-time safety filter working?
5. Is token budgeting respecting limits?

### Files to Examine
- `src/services/storyEngine.ts` - Main story generation
- `src/services/storyIntent.ts` - Intent classification
- `src/services/storyCache.ts` - Story caching
- `src/services/context.ts` - Context injection system
- `src/services/expressionFilter.ts` - Safety filter
- `src/services/memoryGraph.ts` - Graph traversal
- `schema/025_story_mode_profiles.sql` - Story profiles

### Investigation Tasks
1. Test each story intent type (date_meaning, origin_story, relationship_story, self_story)
2. Verify memory graph edges are properly created and traversed
3. Check context profile scoring weights are applied correctly
4. Test expression-time filter to ensure it's not over-filtering
5. Verify token budget allocation across categories

### Deliverables
- Story Engine health assessment
- Context injection quality report
- Graph traversal performance notes
- Recommendations for tuning

---

## Instance 5: Consolidation Pipeline Review

### Context
Consolidation is the background process that decays/strengthens memories, creates graph edges, detects patterns, and updates summaries. This is the "sleep" cycle for the memory system.

### Key Questions to Investigate
1. Is memory decay/strengthening balanced correctly?
2. Are SIMILAR edges being created with appropriate thresholds?
3. Is pattern detection finding meaningful patterns?
4. Are living summaries being updated with new memories?
5. Is insight generation working?

### Files to Examine
- `src/services/consolidation.ts` - Main consolidation pipeline
- `src/services/patterns.ts` - Pattern detection
- `src/services/insights.ts` - Insight generation
- `src/services/summaries.ts` - Living summaries
- `src/services/research.ts` - Knowledge gaps
- `schema/010_memory_edges.sql` - Edge schema
- `schema/013_patterns.sql` - Patterns schema
- `schema/014_insights.sql` - Insights schema

### Investigation Tasks
1. Run consolidation and verify each step completes
2. Check if decay is too aggressive (losing important memories)
3. Verify SIMILAR edge threshold (0.75) isn't too high
4. Test pattern extraction quality
5. Check if summaries are actually being updated

### Deliverables
- Consolidation pipeline health report
- Decay/strengthen balance assessment
- Pattern/insight quality evaluation
- Recommendations for tuning parameters

---

## Instance 6: Chat Service & Tool Calling Review

### Context
The chat service orchestrates LLM conversations with tool calling. This is the main user interaction point and needs to be bulletproof.

### Key Questions to Investigate
1. Is tool calling working reliably with Groq/xAI/Gemini?
2. Are tool results being properly fed back to the LLM?
3. Is context being injected at the right point in the conversation?
4. Is streaming working correctly?
5. Are conversations being persisted correctly?

### Files to Examine
- `src/services/chat.ts` - Main chat orchestration
- `src/providers/llm.ts` - LLM provider abstraction
- `src/tools/index.ts` - Tool registry
- `src/tools/*.ts` - Individual tool implementations
- `src/api/routes/chat.ts` - Chat API routes
- `src/api/socket/index.ts` - Socket.IO handlers
- `schema/017_chat_persistence.sql` - Chat storage

### Investigation Tasks
1. Test a full conversation with tool calls
2. Verify tool call → result → LLM response flow
3. Check if context is being prepended correctly
4. Test streaming output via Socket.IO
5. Verify conversation history persistence

### Deliverables
- Chat flow diagram with all steps
- Tool calling reliability report
- Context injection timing analysis
- Recommendations for improvements

---

## Instance 7: Commitments & Reminders System Review

### Context
The commitments system tracks promises and agreements mentioned in conversations. Reminders are scheduled notifications. These features integrate with Google Calendar.

### Key Questions to Investigate
1. Are commitments being extracted from conversations?
2. Is the commitment candidate system working?
3. Are reminders being scheduled and delivered?
4. Is Google Calendar integration syncing correctly?
5. Are push notifications working?

### Files to Examine
- `src/services/commitments.ts` - Commitment management
- `src/services/scheduler.ts` - Reminder scheduler
- `src/services/notifications.ts` - Push notifications
- `src/services/google/sync.ts` - Calendar sync
- `schema/018_commitments.sql` - Commitments schema
- `schema/019_reminders.sql` - Reminders schema
- `schema/020_google_integration.sql` - Google OAuth
- `schema/032_commitment_candidates.sql` - Candidates

### Investigation Tasks
1. Check if commitments are being detected in chat
2. Verify reminder scheduling and execution
3. Test push notification delivery
4. Check Google Calendar sync accuracy
5. Review commitment candidate workflow

### Deliverables
- Commitments detection quality report
- Scheduler reliability assessment
- Google integration status
- Push notification health check

---

## Instance 8: Documents & Search System Review

### Context
The document system handles PDF/text ingestion, chunking, and semantic search. This is the RAG (Retrieval Augmented Generation) component for external knowledge.

### Key Questions to Investigate
1. Is document upload and chunking working?
2. Are embeddings being generated for chunks?
3. Is semantic search returning relevant results?
4. Are documents being injected into context correctly?
5. Is the citation system working?

### Files to Examine
- `src/services/documents/index.ts` - Document management
- `src/services/documents/ingest.ts` - Document ingestion
- `src/services/documents/search.ts` - Semantic search
- `src/services/documents/extract.ts` - Content extraction
- `src/providers/embeddings.ts` - Embedding generation
- `schema/028_document_chunks.sql` - Chunks schema
- `schema/029_extracted_facts.sql` - Facts from docs

### Investigation Tasks
1. Test document upload and processing pipeline
2. Verify chunk sizes and overlap are appropriate
3. Test semantic search quality
4. Check document context injection in `context.ts`
5. Verify citation format in LLM responses

### Deliverables
- Document pipeline health report
- Search quality assessment
- Chunking strategy review
- Context injection analysis

---

## Cross-Cutting Concerns (All Instances Should Note)

### Database Performance
- Check for missing indexes on frequently queried columns
- Look for N+1 query patterns
- Note any slow queries

### Error Handling
- Identify places where errors are silently swallowed
- Check for proper error propagation to UI
- Note any unhandled promise rejections

### Type Safety
- Check for `any` types that could be tightened
- Verify schema types match TypeScript interfaces
- Note any type assertions that might be unsafe

### Security
- Check for SQL injection vulnerabilities
- Verify proper input validation
- Note any sensitive data exposure

---

## Deliverables Format

Each instance should produce a report with:

1. **Executive Summary** - 2-3 sentences on overall health
2. **Issues Found** - Categorized as Critical/High/Medium/Low
3. **Code Locations** - Specific files and line numbers
4. **Root Cause Analysis** - Why the issue exists
5. **Recommended Fixes** - Concrete actions to take
6. **Questions for User** - Any clarifications needed

Store findings to Mandrel using:
```bash
ssh hetzner 'curl -s -X POST http://localhost:8080/mcp/tools/context_store \
  -H "Content-Type: application/json" \
  -d '\''{"arguments": {"content": "<your findings>", "type": "completion", "tags": ["squire", "review", "instance-N"]}}'\'''
```

---

## Architecture Summary for Reference

### Core Services
- **memories.ts** - Memory CRUD, search, tiers
- **context.ts** - Context injection with scoring
- **chat.ts** - LLM orchestration with tool calling
- **consolidation.ts** - Background processing pipeline
- **storyEngine.ts** - Narrative generation from memory graph

### Supporting Services
- **entities.ts** - People, places, things extraction
- **beliefs.ts** - Persistent beliefs from memories
- **patterns.ts** - Behavioral patterns detection
- **summaries.ts** - Living summaries by category
- **notes.ts** / **lists.ts** - Structured user data

### Infrastructure
- **PostgreSQL with pgvector** - Vector similarity search
- **Groq/xAI/Gemini** - LLM providers with tool calling
- **Socket.IO** - Real-time streaming
- **Transformers.js** - Local embeddings (zero cost)

### Key Design Principles
1. **Memories have strength** - Decay/strengthen like human memory
2. **Salience matters** - Important things persist longer
3. **Generate, don't retrieve** - Story Engine synthesizes narratives
4. **Context is curated** - Token budgets, profile-based selection
5. **Beliefs evolve** - Conflict detection, supersession tracking

---

*Created by Instance 1 on 2025-01-18*
*Run ID: squire-review-v1*
