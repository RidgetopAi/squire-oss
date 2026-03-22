# SQUIRE IMPLEMENTATION ROADMAP

## Vertical Slice Approach with Layered Progression

**Philosophy**: Build the thinnest end-to-end pipeline first. Get something usable fast. Then make each layer smarter independently.

**Date**: December 25, 2025
**Status**: Planning Complete - Ready to Execute

---

## THE MAP

```
                           FULL VISION
                               ▲
                               │
    ┌──────────────────────────┼──────────────────────────┐
    │                          │                          │
    │  SLICE 7: Advanced       │                          │
    │  - Belief extraction     │                          │
    │  - Pattern detection     │                          │
    │  - Insight generation    │                          │
    │  - Active research       │                          │
    │                          │                          │
    ├──────────────────────────┼──────────────────────────┤
    │                          │                          │
    │  SLICE 6: Living Summaries                          │
    │  - Category classification                          │
    │  - Incremental updates                              │
    │  - Summary in context                               │
    │                          │                          │
    ├──────────────────────────┼──────────────────────────┤
    │                          │                          │
    │  SLICE 5: Consolidation  │                          │
    │  - Session management    │                          │
    │  - Decay/strengthening   │                          │
    │  - Edge maintenance      │                          │
    │                          │                          │
    ├──────────────────────────┼──────────────────────────┤
    │                          │                          │
    │  SLICE 4: Entities & Graph                          │
    │  - Entity extraction     │                          │
    │  - MENTIONS edges        │                          │
    │  - Entity queries        │                          │
    │                          │                          │
    ├──────────────────────────┼──────────────────────────┤
    │                          │                          │
    │  SLICE 3: Context Quality                           │
    │  - Context profiles      │  ◄── CONTEXT WORKS WELL  │
    │  - Scoring function      │                          │
    │  - Token budgeting       │                          │
    │                          │                          │
    ├──────────────────────────┼──────────────────────────┤
    │                          │                          │
    │  SLICE 2: Salience       │                          │
    │  - Heuristic scoring     │  ◄── RETRIEVAL IS SMART  │
    │  - Ranking by salience   │                          │
    │  - Emotional tagging     │                          │
    │                          │                          │
    ├──────────────────────────┼──────────────────────────┤
    │                          │                          │
    │  SLICE 1: Core Pipeline  │                          │
    │  - Memory storage        │  ◄── SYSTEM IS USABLE    │
    │  - Embeddings            │                          │
    │  - Semantic search       │                          │
    │  - Basic context         │                          │
    │                          │                          │
    ├──────────────────────────┼──────────────────────────┤
    │                          │                          │
    │  SLICE 0: Foundation     │  ◄── PROOF OF LIFE       │
    │  - Project setup         │                          │
    │  - Minimal schema        │                          │
    │  - First endpoint        │                          │
    │                          │                          │
    └──────────────────────────┴──────────────────────────┘
                               │
                           YOU ARE HERE
```

---

## SLICE 0: Foundation (Proof of Life)

**Goal**: Project exists, database works, something runs.

### What We Build
- [ ] TypeScript project with build system
- [ ] PostgreSQL connection with pgvector enabled
- [ ] Minimal schema: `raw_observations` + `memories` tables only
- [ ] Single endpoint: `POST /api/memories` (stores content)
- [ ] Single query: `GET /api/memories` (retrieves all)
- [ ] CLI skeleton: `squire observe "text"` and `squire list`

### Evaluation Criteria
```bash
# These must work:
squire observe "This is a test memory"
squire list
# → Shows the memory we just stored
```

### What This Enables
- Confidence the stack works
- Foundation for everything else
- Can start storing real observations immediately (even before search works)

### Tech Decisions Locked
- TypeScript + Node.js
- PostgreSQL + pgvector
- Express.js for API
- Commander.js for CLI

### Next Step Preview
Add embeddings and semantic search.

---

## SLICE 1: Core Pipeline (System Is Usable)

**Goal**: Can store, search semantically, and get basic context. The MVP acceptance test passes.

### What We Build
- [ ] Embedding generation (Groq or local)
- [ ] Embeddings stored in memories table
- [ ] Semantic search: `GET /api/memories/search?query=...`
- [ ] Basic context endpoint: `POST /api/context` (returns recent + relevant memories)
- [ ] CLI: `squire search "query"` and `squire context`
- [ ] Vector index (HNSW) on embeddings

### Evaluation Criteria
```bash
# Store memories
squire observe "Met Sarah to discuss the AI project due next Friday"
squire observe "Need to buy groceries - milk, eggs, bread"
squire observe "The AI project uses vector embeddings for semantic search"

# Semantic search works
squire search "AI project"
# → Returns memory 1 and 3, NOT memory 2

# Context injection works
squire context --query "project status"
# → Returns relevant memories formatted for AI consumption
```

### What This Enables
- **Actually usable for real work**
- Can start feeding this context to Claude/GPT manually
- Can validate "does context help?" hypothesis early
- Foundation for all sophistication layers

### Salience Note
At this stage, salience_score is just set to default (5.0). All memories treated equally except for recency and semantic relevance.

### Next Step Preview
Add salience scoring so important memories rank higher.

---

## SLICE 2: Salience Foundation (Retrieval Is Smart)

**Goal**: Important memories float to top. Trivial memories fade in ranking.

### What We Build
- [ ] Heuristic salience scoring (no LLM required)
  - Temporal markers (dates, deadlines) → +salience
  - Relationship markers (names, "met with") → +salience
  - Action language (commitments, decisions) → +salience
  - Explicit markers ("important", "remember") → +salience
  - Self-reference ("I feel", "I decided") → +salience
- [ ] Salience stored on memory creation
- [ ] Search ranking incorporates salience
- [ ] Context injection prioritizes high-salience
- [ ] Optional: emotional tagging (behind flag)

### Evaluation Criteria
```bash
squire observe "Need to pick up dry cleaning"
squire observe "Sarah offered me the CTO position - deadline to decide is Friday"

squire search "this week"
# → CTO decision ranks ABOVE dry cleaning (higher salience)

squire context
# → CTO decision appears prominently, dry cleaning may not appear at all
```

### What This Enables
- Context injection is now **quality-aware**
- Limited token budgets go to important memories
- Foundation for decay (high salience = slower decay)

### Salience Factor Weights (Initial)
```typescript
{
  temporal_relevance: 0.20,    // deadlines, dates
  relationship: 0.20,          // people mentioned
  action_language: 0.20,       // commitments, decisions
  explicit_marking: 0.15,      // "remember", "important"
  self_reference: 0.15,        // identity, feelings
  length_complexity: 0.10      // detail richness
}
```

### Next Step Preview
Make context injection configurable with profiles and proper scoring.

---

## SLICE 3: Context Quality (Context Works Well)

**Goal**: Context injection is production-quality with profiles and token budgeting.

### What We Build
- [ ] Context profiles table and API
- [ ] Default profiles: general, work, personal, creative
- [ ] Full scoring function: `salience × relevance × recency × strength`
- [ ] Token budgeting with percentage caps
- [ ] Dual output format: markdown + JSON
- [ ] Disclosure logging (what was shown)
- [ ] CLI: `squire context --profile work --query "status"`

### Evaluation Criteria
```bash
# Profile-based context
squire context --profile work
# → Prioritizes project/work memories

squire context --profile personal
# → Prioritizes people/relationship memories

# Token budgets respected
squire context --max-tokens 2000
# → Output stays within budget, prioritizes by score
```

### What This Enables
- Context injection ready for production use
- Can tune profiles for different AI use cases
- Audit trail of what AI sees

### The Real Test
Start actually using this with Claude/GPT. Does the context make conversations better? This is the moment of truth.

### Next Step Preview
Extract entities (people, projects) for structured understanding.

---

## SLICE 4: Entities & Graph (Structured Knowledge)

**Goal**: System understands who and what, not just raw text.

### What We Build
- [ ] Entity extraction pipeline
  - Start with regex patterns (names, project references)
  - Optional LLM enrichment behind flag
- [ ] Entities table with types (person, project, concept, place)
- [ ] MENTIONS edges (memory → entity)
- [ ] Entity queries: "What do I know about Sarah?"
- [ ] Entity inclusion in context injection
- [ ] CLI: `squire entities`, `squire who "Sarah"`

### Evaluation Criteria
```bash
squire observe "Met with Sarah Chen about the Quantum project deadline"

squire entities
# → Shows: Sarah Chen (person), Quantum (project)

squire who "Sarah"
# → Returns all memories mentioning Sarah, her extracted attributes

squire context --query "Sarah"
# → Context includes entity summary + relevant memories
```

### What This Enables
- "Who is X?" queries work
- Entity-based context enrichment
- Foundation for relationship tracking
- Graph structure begins

### Extraction Strategy (Pragmatic)
1. Regex for obvious patterns (capitalized names, "project X")
2. Entity deduplication by embedding similarity
3. LLM enrichment optional (for ambiguous cases)

### Next Step Preview
Add consolidation for decay, strengthening, and edge maintenance.

---

## SLICE 5: Consolidation (Memory Dynamics)

**Goal**: Memories decay, strengthen, and form connections over time.

### What We Build
- [ ] Session management (start/end tracking)
- [ ] Consolidation pipeline (idempotent)
- [ ] Decay: low-salience + unaccessed memories fade
- [ ] Strengthening: high-salience + frequently accessed resist decay
- [ ] SIMILAR edges (embedding similarity > threshold)
- [ ] Edge decay and pruning
- [ ] CLI: `squire consolidate`, `squire sleep`

### Evaluation Criteria
```bash
# After some time passes...
squire consolidate

# Low-salience, unaccessed memories have reduced strength
squire search "groceries"
# → Old grocery lists have low strength, may not appear

# High-salience memories maintain strength
squire search "CTO decision"
# → Still prominent even after time passes

# Similar memories are connected
squire related <memory-id>
# → Shows connected memories via SIMILAR edges
```

### What This Enables
- Memory feels alive, not just storage
- Old trivial memories naturally fade
- Important memories persist
- Graph connections form automatically

### Consolidation Trigger Options
- Manual: `squire consolidate`
- Session end: when session closes
- Scheduled: cron job (later)

### Next Step Preview
Add living summaries for distilled understanding.

---

## SLICE 6: Living Summaries (Distilled State)

**Goal**: System maintains evolving summaries of key domains.

### What We Build
- [ ] Living summaries table with categories
- [ ] Category classification (which summaries does a memory touch?)
- [ ] Incremental summary updates (don't rewrite from scratch)
- [ ] Summary inclusion in context injection
- [ ] CLI: `squire summary commitments`, `squire summary people`, etc.

### Categories
- commitments (things promised/owed)
- people (key relationships)
- projects (active work)
- tensions (unresolved conflicts)
- mood (emotional patterns)
- narrative (self-story)
- goals (what they're working toward)

### Evaluation Criteria
```bash
squire summary people
# → "Key relationships: Sarah Chen (collaborator on Quantum project,
#    offered CTO position), Mike (mentioned in weekend plans)..."

squire context
# → Includes relevant summaries, not just raw memories
```

### What This Enables
- AI gets distilled understanding, not just memory dump
- Summaries compound over time
- Reduced token usage (summary vs. many memories)

### The Challenge
Incremental summary updates without drift. This requires careful prompt engineering.

### Next Step Preview
Advanced features: beliefs, patterns, insights, active research.

---

## SLICE 7: Advanced (Full Vision)

**Goal**: The complete system as envisioned.

### What We Build
- [ ] Belief extraction and management
- [ ] Belief conflict detection
- [ ] Pattern detection (behavioral, temporal, emotional)
- [ ] Insight generation during consolidation
- [ ] Active research (gap detection, question generation)
- [ ] Full graph traversal queries
- [ ] Object storage integration (images, audio, docs)

### Evaluation Criteria
```bash
squire beliefs
# → Shows extracted beliefs with confidence scores

squire insights
# → Shows generated insights from recent consolidation

squire patterns
# → Shows detected patterns (e.g., "stress increases on Mondays")
```

### What This Enables
- Full "AI that knows you" experience
- Proactive insights, not just reactive retrieval
- Rich graph queries for discovery

---

## TRACKING PROGRESS

### Current Status Board

| Slice | Status | Started | Completed | Notes |
|-------|--------|---------|-----------|-------|
| 0: Foundation | NOT STARTED | - | - | - |
| 1: Core Pipeline | NOT STARTED | - | - | - |
| 2: Salience | NOT STARTED | - | - | - |
| 3: Context Quality | NOT STARTED | - | - | - |
| 4: Entities & Graph | NOT STARTED | - | - | - |
| 5: Consolidation | NOT STARTED | - | - | - |
| 6: Living Summaries | NOT STARTED | - | - | - |
| 7: Advanced | NOT STARTED | - | - | - |

### Milestone Markers

- **M1: Proof of Life** - Slice 0 complete, can store and retrieve
- **M2: Actually Usable** - Slice 1 complete, semantic search works
- **M3: Smart Retrieval** - Slice 2 complete, salience affects ranking
- **M4: Production Context** - Slice 3 complete, context injection is quality
- **M5: Structured Knowledge** - Slice 4 complete, entities extracted
- **M6: Living Memory** - Slice 5 complete, decay/strengthen works
- **M7: Distilled Understanding** - Slice 6 complete, summaries work
- **M8: Full Vision** - Slice 7 complete, beliefs/patterns/insights

---

## DECISION POINTS

### After Slice 1 (Core Pipeline)
**Question**: Does basic context actually help AI conversations?
- If YES → Continue to Slice 2
- If NO → Investigate why before adding complexity

### After Slice 2 (Salience)
**Question**: Does salience scoring feel right? Are important things ranking higher?
- If YES → Continue to Slice 3
- If NO → Tune salience factors before moving on

### After Slice 3 (Context Quality)
**Question**: Is context injection production-ready? Would you use this daily?
- If YES → Continue to Slice 4
- If NO → Polish context quality, it's the core value prop

### After Slice 4 (Entities)
**Question**: Is entity extraction accurate enough? Too many false positives/negatives?
- If YES → Continue to Slice 5
- If NO → Improve extraction before building on it

### After Slice 5 (Consolidation)
**Question**: Does memory feel alive? Is decay working as expected?
- If YES → Continue to Slice 6
- If NO → Tune decay parameters

### After Slice 6 (Living Summaries)
**Question**: Are summaries accurate and useful? Do they drift?
- If YES → Continue to Slice 7
- If NO → Fix summary update logic

---

## LAYER PROGRESSION PATHS

Each layer can be made smarter independently:

### Salience Layer Progression
1. **Basic**: Regex heuristics only
2. **Better**: Add LLM scoring for ambiguous cases
3. **Best**: Learn from access patterns (what user actually retrieves)

### Extraction Layer Progression
1. **Basic**: Regex patterns for names, projects
2. **Better**: Add LLM extraction with structured output
3. **Best**: Entity resolution, merge detection, confidence scoring

### Consolidation Layer Progression
1. **Basic**: Manual trigger, simple decay formula
2. **Better**: Session-end trigger, edge formation
3. **Best**: Active research, insight generation, pattern detection

### Context Layer Progression
1. **Basic**: Recent + semantically relevant
2. **Better**: Profiles, scoring function, token budgeting
3. **Best**: Summaries included, adaptive profile selection

---

## REFERENCE: Full Vision Checklist

From SQUIRE-DESIGN-PLAN.md - what "done" looks like:

- [ ] Can store memories with salience scores
- [ ] Can retrieve memories by semantic search
- [ ] Salience affects retrieval ranking
- [ ] Emotional tagging works (if enabled)
- [ ] CLI is functional
- [ ] Context injection returns useful package
- [ ] Context injection works - AI "wakes up" informed
- [ ] Graph queries work - "what's related to X?"
- [ ] Consolidation runs per-session (idempotent)
- [ ] Decay and strengthening affect retrieval
- [ ] Living summaries stay current
- [ ] Insights generated during consolidation are useful
- [ ] Works offline with local LLM

**Ultimate Success Criteria**:
- AI conversations feel meaningfully different because of context
- The AI demonstrates genuine knowing, not just data retrieval
- Memory compounds over time - the system gets better
- Brian feels understood by his AI partner

---

## NEXT IMMEDIATE ACTION

**Start Slice 0: Foundation**

1. Create project structure
2. Set up TypeScript + build
3. PostgreSQL connection + pgvector
4. Minimal schema migration
5. First endpoint + CLI command
6. Verify it works

**Estimated effort**: One focused session

---

*Last Updated: December 25, 2025*
*Status: Ready to Execute Slice 0*
