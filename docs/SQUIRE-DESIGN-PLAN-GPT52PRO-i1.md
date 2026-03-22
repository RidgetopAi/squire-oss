# SQUIRE DESIGN PLAN (GPT-5.2 Pro i1 Revision)

**Source reviewed:** `docs/SQUIRE-DESIGN-PLAN-SEED.md`  
**Version:** 1.1.0 (editorial + architectural tightening)  
**Date:** December 25, 2025  
**Status:** Revised design plan — ready to implement Phase 1 with clearer guardrails

---

## What I changed (high-signal summary)

1. **Clarified the objective & scope**: defined what “AI memory that knows the user” means operationally, and what it explicitly does *not* mean (no mind-reading, no multi-tenant, no autonomous agents without confirmation).
2. **Added privacy/safety constraints as first-class requirements**: local-first is great, but you still need redaction, encryption-at-rest, retention controls, and an explicit “forget” path.
3. **Made embeddings/model dimensions consistent**: seed doc says “Change: 1536-dim” but schema is 768. I standardized on **1536** *as a configurable dimension* and showed how to keep schema/provider aligned.
4. **Improved data model correctness/performance**:
   - added **separation between raw inputs vs processed memories** (optional but recommended) to preserve provenance and allow reprocessing.
   - fixed **IVFFLAT indexing prerequisites** (lists, `ANALYZE`, cosine ops) and noted HNSW option.
   - added missing **foreign keys / polymorphic edge integrity strategy**.
5. **Strengthened “consolidation” into a deterministic pipeline**: specified idempotency, batching, and how to avoid repeatedly re-summarizing everything.
6. **Made context injection more testable**: defined a concrete scoring function, token budgeting strategy, and output contract.
7. **Added minimal “MVP success” acceptance tests**: what should work by end of Phase 1.

---

# PART 1: VISION & PRODUCT OBJECTIVE

## Core Insight

**This is not user memory. This is AI memory that knows the user.**

Operationally, that means:
- The system stores *atomic* memories with provenance.
- It distills stable *beliefs* and *summaries*.
- It retrieves and injects the *right* context under a token budget.
- It updates over time: decay, strengthening, and link formation.

## Objective (make it measurable)

Build a **local-first memory layer** that enables:
1. **Recall**: semantic + structured retrieval of relevant information.
2. **Continuity**: conversations start with meaningful context.
3. **Compounding understanding**: beliefs, entities, and summaries improve with use.

### Non-goals (for now)
- Multi-user / multi-tenant.
- Autonomous actions (email/calendar changes) without explicit confirmation.
- “Truth” guarantees: beliefs are *probabilistic* and may be wrong.

---

# PART 2: PRINCIPLES & REQUIREMENTS

## Design Principles (kept + sharpened)

1. **AI-Agnostic**: memory layer usable by different LLMs.
2. **Local-First**: core features offline; cloud is optional backup/sync.
3. **Salience-First**: importance drives retention and retrieval.
4. **Graph-Structured**: relationships are first-class.
5. **Single Human**: one AI ↔ one human.

## New: Security/Privacy Requirements (add as hard constraints)

- **Encryption at rest** for DB + object store (or at minimum full-disk + DB creds). 
- **PII/secret redaction** option at ingest (regex + LLM-assisted classification).
- **Retention controls**: TTL policies by source/type/salience.
- **Right to forget**: hard-delete + tombstone + downstream cleanup (entities/beliefs/edges).
- **Audit trail**: record when a memory/belief was shown to the model (“disclosure log”).

---

# PART 3: ARCHITECTURE OVERVIEW

## System Layers (unchanged conceptually)

```
Input → Ingestion → Storage → Consolidation → Context Injection → Output
```

## Technology Stack (reconciled)

| Component | Recommended | Notes |
|---|---|---|
| Language | TypeScript | matches Keymaker ecosystem |
| DB | PostgreSQL + pgvector | good default |
| LLM (reasoning) | Groq (cloud) / local fallback | choose based on privacy mode |
| Embeddings | **Configurable** (768 or 1536) | keep schema + provider aligned |
| API | Express.js | fine for MVP |
| CLI | Commander.js | fine |
| Object storage | local FS → MinIO → S3 | staged evolution |

### Recommendation: provider strategy
Keep “local-first” by supporting:
- `LLM_PROVIDER=local|groq`
- `EMBED_PROVIDER=local|cloud`

…and allow users to run **local embeddings even if reasoning is cloud**.

---

# PART 4: DATA MODEL (REVISED)

## Key model improvements

1. **Raw inputs vs memories**: preserve original inputs to re-run extraction/scoring as models improve.
2. **Embedding dimensions**: make explicit and consistent.
3. **Polymorphic edges**: either accept soft integrity or enforce with constraints/triggers.

### 4.1 raw_observations (optional but recommended)

Stores immutable inputs exactly as received.

```sql
CREATE TABLE raw_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  content_type VARCHAR(50) NOT NULL,
  source VARCHAR(50) NOT NULL,
  source_metadata JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.2 memories

Memories can reference a raw observation.

**Embedding dimension:** choose one value and stick to it in a deployment.

```sql
-- Choose a deployment dimension; example uses 1536
-- You can enforce via migration-time config.

CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  raw_observation_id UUID REFERENCES raw_observations(id),

  content TEXT NOT NULL,
  content_type VARCHAR(50) NOT NULL,
  source VARCHAR(50) NOT NULL,
  source_metadata JSONB DEFAULT '{}',

  embedding vector(1536),

  salience_score FLOAT NOT NULL DEFAULT 5.0,
  salience_factors JSONB DEFAULT '{}',

  primary_emotion VARCHAR(30),
  emotion_intensity FLOAT,
  emotional_valence VARCHAR(10),
  emotional_arousal VARCHAR(10),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurred_at TIMESTAMPTZ,

  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  decay_rate FLOAT DEFAULT 1.0,
  current_strength FLOAT DEFAULT 1.0,

  session_id UUID,

  processing_status VARCHAR(20) DEFAULT 'pending',
  processed_at TIMESTAMPTZ,

  extracted_entities JSONB DEFAULT '[]',
  extracted_beliefs JSONB DEFAULT '[]',

  CONSTRAINT valid_salience CHECK (salience_score >= 0.0 AND salience_score <= 10.0),
  CONSTRAINT valid_strength CHECK (current_strength >= 0.0 AND current_strength <= 1.0)
);

-- Indexing notes:
-- 1) For ivfflat you must set lists and run ANALYZE.
-- 2) Consider HNSW for simplicity/quality (pgvector >= 0.5).
CREATE INDEX idx_memories_created ON memories (created_at DESC);
CREATE INDEX idx_memories_salience ON memories (salience_score DESC);

-- Example HNSW (recommended if available)
-- CREATE INDEX idx_memories_embedding_hnsw
--   ON memories USING hnsw (embedding vector_cosine_ops);

-- Example IVFFLAT
-- CREATE INDEX idx_memories_embedding_ivf
--   ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- ANALYZE memories;
```

### 4.3 entities / beliefs / objects

Keep as in seed, but align embedding dims with `memories`.

### 4.4 edges (graph)

**Important**: your polymorphic edge table cannot have real FKs to three tables simultaneously. Options:
- accept soft integrity (app-enforced)
- or create separate edge tables per node-type
- or use a unified `nodes` table

**Recommendation for MVP:** keep polymorphic, enforce in application, add periodic integrity checks.

Also add a reverse unique constraint if you want undirected edges (e.g., SIMILAR).

```sql
CREATE TABLE edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_type VARCHAR(20) NOT NULL,
  source_id UUID NOT NULL,
  target_type VARCHAR(20) NOT NULL,
  target_id UUID NOT NULL,

  edge_type VARCHAR(30) NOT NULL,

  weight FLOAT NOT NULL DEFAULT 0.5,
  initial_weight FLOAT NOT NULL,

  last_activated_at TIMESTAMPTZ DEFAULT NOW(),
  activation_count INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(50),
  metadata JSONB DEFAULT '{}',

  UNIQUE(source_type, source_id, target_type, target_id, edge_type),
  CONSTRAINT valid_weight CHECK (weight >= 0.0 AND weight <= 1.0)
);

CREATE INDEX idx_edges_source ON edges (source_type, source_id);
CREATE INDEX idx_edges_target ON edges (target_type, target_id);
CREATE INDEX idx_edges_type ON edges (edge_type);
```

---

# PART 5: SALIENCE SCORING (TIGHTENED)

## Two-stage scoring (recommended)

1. **Heuristic pre-score** (fast, deterministic)
2. **LLM refinement** (optional; only if enabled)

This makes MVP stable and reduces dependency on frontier models.

### Salience behaviors (keep)
- decay rate derived from salience
- retrieval ranking uses salience heavily

### New: update policy
Salience can drift, but do it deliberately:
- **Do not rewrite salience on every access**.
- Allow `salience_score` updates only during consolidation runs, based on:
  - access_count deltas
  - edge connectivity changes
  - explicit user pin/unpin

---

# PART 6: EMOTIONS (MINIMAL, SAFE)

Keep Plutchik model, but add:
- `primary_emotion = 'none'` as explicit enum value
- ensure intensity nullable only when none

Also: emotions are sensitive. Provide a config flag:
- `ENABLE_EMOTION_TAGGING=true|false`

---

# PART 7: CONSOLIDATION (“SLEEP”) — MAKE IT IDEMPOTENT

## Goals
- apply decay deterministically
- create/strengthen/prune edges
- update summaries incrementally
- generate insights (optional)

## Idempotency rules
- a consolidation run should be re-runnable without double-counting:
  - store `consolidation_run_id` on derived artifacts (edges created, summaries updated)
  - or record checkpoints: `last_consolidated_at` per session

## Suggested ordering (same as seed, but implementation-ready)
1. Load candidate memories (session or window)
2. Apply decay (strength)
3. Similarity edges (batch similarity search)
4. Pattern detection (optional)
5. Belief maintenance (supersede/conflicts)
6. Living summary updates (incremental)
7. Insights (optional)

---

# PART 8: CONTEXT INJECTION (MORE TESTABLE)

## Retrieval recipe
Candidates:
- living summaries (always)
- active beliefs (always, but capped)
- top entities by (salience × recency)
- top memories by combined score

## Scoring function (explicit)

```
score(memory) =
  0.45 * norm_salience
+ 0.25 * norm_relevance
+ 0.20 * norm_recency
+ 0.10 * norm_strength
```

Where:
- `norm_salience = salience_score / 10`
- `norm_recency` could be `exp(-days/half_life)`
- `norm_relevance` from embedding similarity to query or current conversation topic

## Token budgeting
Instead of fixed reservations, use caps:
- summaries: max 30% of budget
- beliefs: max 20%
- the rest: ranked memories + entity facts

This avoids wasting tokens when summaries are short.

## Output contract (stable)
Provide both:
- `context_package.markdown`
- `context_package.json`

So downstream clients can choose.

---

# PART 9: API (MINOR FIXES)

Your endpoints are fine. Recommended additions:

### Forget / redaction endpoints
```
DELETE /api/memories/:id
POST   /api/memories/:id/redact
```

### Disclosure logging
Whenever context is generated:
```
POST /api/context
  Body: { profile?, query?, max_tokens?, conversation_id? }
  Response: { context_package, disclosed_memory_ids[] }
```

---

# PART 10: IMPLEMENTATION PHASES (RE-PRIORITIZED FOR MVP VALUE)

## Phase 1 (MVP): store + retrieve + inject

**Goal:** a single command can store a memory and the next conversation can get context.

- [ ] DB schema + migrations
- [ ] `POST /api/memories` (store raw + memory)
- [ ] embedding generation (one provider)
- [ ] heuristic salience scoring
- [ ] semantic search endpoint
- [ ] `GET/POST /api/context` (context package)
- [ ] CLI: `observe`, `search`, `context`

## Phase 2: entities + beliefs extraction

- [ ] entity extraction (LLM optional)
- [ ] belief extraction (LLM optional)
- [ ] MENTIONS edges

## Phase 3: consolidation

- [ ] decay/strengthening
- [ ] similarity edges
- [ ] living summaries

---

# PART 11: OPEN QUESTIONS (UPDATED)

Add these to your SIRK list:

1. **Embedding dimension migration**: how do we migrate vectors if provider changes? (likely “re-embed all” job)
2. **Deletion semantics**: do beliefs/entities get deleted, or marked inactive, when source memory is deleted?
3. **Evaluation**: what offline tests prove context injection helps? (golden conversations + recall tasks)
4. **Provenance display**: how does the AI cite sources? (memory IDs + timestamps)

---

# PART 12: MVP ACCEPTANCE TESTS (CONCRETE)

By end of Phase 1, you should be able to:

1. `squire observe "Met Sarah to discuss the AI project due next Friday" --source chat`
2. `squire search "AI project"` returns the memory.
3. `squire context --profile work --query "status"` returns a context package that includes:
   - the memory
   - extracted time marker (even if crude)
   - salience score > baseline if it contains deadline/relationship/action language

---

# APPENDIX: NOTES ON CONSISTENCY FIXES

- Seed doc had **embedding vector(768)** but also “Change: 1536-dim”. This revision standardizes on **configurable dimension** and shows an example using 1536.
- If you keep 768, update all `vector(1536)` examples back to 768 and ensure the embedding model outputs that size.

---

**Next recommended step:** implement Phase 1 with deterministic heuristics first (salience + basic entity extraction can be regex-based initially), then layer LLM-based enrichment behind feature flags so the system remains reliable offline.
