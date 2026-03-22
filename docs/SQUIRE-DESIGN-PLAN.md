# SQUIRE DESIGN PLAN

## AI Memory System - Architecture & Implementation Blueprint

**Version:** 1.1.0
**Date:** December 25, 2025
**Status:** Production-Ready Design - Merged from Claude + GPT-5.2 Pro iterations

---

# PART 1: VISION & PHILOSOPHY

## The Core Insight

**This is not user memory. This is AI memory that knows the user.**

Traditional approaches store data about users for later retrieval. Squire inverts this: the AI becomes the entity with memory. The AI knows its human partner - their patterns, priorities, emotional landscape, relationships, and goals. Every conversation starts with context, not cold.

## The Goal

**Develop the best personal memory for AI we can.**

This is the unlock. This is the key to better AI. Current AI starts every conversation amnesia-fresh. Squire gives AI genuine knowing - not just data retrieval, but understanding that compounds over time.

## Objective (Measurable)

Build a **local-first memory layer** that enables:
1. **Recall**: semantic + structured retrieval of relevant information
2. **Continuity**: conversations start with meaningful context
3. **Compounding understanding**: beliefs, entities, and summaries improve with use

### Non-Goals (Explicit)
- Multi-user / multi-tenant
- Autonomous actions (email/calendar changes) without explicit confirmation
- "Truth" guarantees: beliefs are *probabilistic* and may be wrong

## The Three Phases

### Phase 1: Daytime/Active

Input flows in from multiple sources. Each memory receives:
- **Salience score** (0.0-10.0): How important is this?
- **Emotional tags**: What feelings are attached?
- Real-time storage with embedding generation

### Phase 2: Sleep/Consolidation

Periodic (per-session) processing:
- **Decay**: Low-salience memories fade
- **Edge Formation**: Related concepts get connected (graph structure)
- **Research**: Active retrieval, gap identification, insight generation
- **Strengthening**: Important memories resist decay

### Phase 3: Morning/Context

Before any AI conversation:
- **Context injection**: Load relevant memories
- Profile-based (work/personal/creative context)
- Query-based (relevant to current topic)
- AI "wakes up" informed and context-aware

---

# PART 2: DESIGN PRINCIPLES & REQUIREMENTS

## Core Principles

1. **AI-Agnostic**: Memory layer any AI can tap into (not tied to Claude, GPT, etc.)
2. **Local-First**: All core features work offline. Cloud is backup, not compute.
3. **Salience-First**: Not all memories are equal. Importance drives everything.
4. **Graph-Structured**: Relationships between concepts, not just flat storage.
5. **Single Human**: One AI ↔ One Human. No multi-tenancy complexity.

## Security & Privacy Requirements

- **Encryption at rest**: DB + object store (or full-disk + DB creds minimum)
- **PII/secret redaction**: Option at ingest (regex + LLM-assisted classification)
- **Retention controls**: TTL policies by source/type/salience
- **Right to forget**: Hard-delete + tombstone + downstream cleanup (entities/beliefs/edges)
- **Audit trail**: Record when memories/beliefs were shown to model ("disclosure log")

---

# PART 3: ARCHITECTURE OVERVIEW

## System Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LAYER 1: INPUT                                │
│  Voice │ Chat │ Notes │ API │ Calendar │ Email                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     LAYER 2: INGESTION                               │
│  Normalization │ Embedding │ Salience Scoring │ Emotional Tagging   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      LAYER 3: STORAGE                                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────┐  │
│  │  Memories   │ │   Edges     │ │  Entities   │ │ Object Store │  │
│  │  (core)     │ │  (graph)    │ │  (extracted)│ │   (files)    │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └──────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   LAYER 4: CONSOLIDATION                             │
│  Decay │ Edge Formation │ Research │ Pattern Detection │ Insights   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 LAYER 5: CONTEXT INJECTION                           │
│  Profile Selection │ Memory Ranking │ Token Budgeting │ Formatting  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      LAYER 6: OUTPUT                                 │
│  Context Package │ API Response │ CLI Display │ Export               │
└─────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Component      | Technology                    | Rationale                                    |
| -------------- | ----------------------------- | -------------------------------------------- |
| Language       | TypeScript                    | Type safety, ecosystem compatibility         |
| Database       | PostgreSQL + pgvector         | Proven, pgvector for embeddings              |
| LLM (Reasoning)| Groq (primary) / Frontier (opt-in) | Fast cloud inference, frontier for complex tasks |
| Embeddings     | 1536-dim (configurable)       | Higher quality, provider-flexible            |
| Object Storage | Local filesystem → MinIO → S3 | Progressive cloud migration                  |
| API            | Express.js                    | Simple, proven                               |
| CLI            | Commander.js                  | Familiar pattern                             |

### Provider Strategy

```typescript
// Environment-driven provider selection
LLM_PROVIDER=groq|local|frontier
EMBED_PROVIDER=local|cloud
EMBED_DIMENSION=1536  // or 768 for local models

// Local embeddings + cloud reasoning is valid
```

---

# PART 4: DATA MODEL

## 4.1 raw_observations (Immutable Input Layer)

Stores immutable inputs exactly as received. Enables reprocessing as models improve.

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

CREATE INDEX idx_raw_obs_created ON raw_observations (created_at DESC);
CREATE INDEX idx_raw_obs_source ON raw_observations (source);
```

## 4.2 memories (The Foundation)

The atomic unit of Squire. Every piece of processed information the AI knows.

```sql
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to raw input (enables reprocessing)
    raw_observation_id UUID REFERENCES raw_observations(id),

    -- Content
    content TEXT NOT NULL,
    content_type VARCHAR(50) NOT NULL,  -- 'text', 'transcript', 'note', 'chat_message'
    source VARCHAR(50) NOT NULL,         -- 'voice', 'chat', 'notes', 'api', 'calendar', 'email'
    source_metadata JSONB DEFAULT '{}',

    -- Embeddings (configurable dimension)
    embedding vector(1536),

    -- Salience (THE KEY DIFFERENTIATOR)
    salience_score FLOAT NOT NULL DEFAULT 5.0,  -- 0.0-10.0
    salience_factors JSONB DEFAULT '{}',        -- breakdown of scoring factors

    -- Emotional Tagging (PER-MEMORY)
    primary_emotion VARCHAR(30),        -- joy, sadness, anger, fear, surprise, anticipation, trust, disgust, none
    emotion_intensity FLOAT,            -- 0.0-1.0
    emotional_valence VARCHAR(10),      -- positive, negative, neutral
    emotional_arousal VARCHAR(10),      -- high, low

    -- Temporal
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    occurred_at TIMESTAMPTZ,

    -- Decay & Access
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    decay_rate FLOAT DEFAULT 1.0,       -- multiplier: <1 resists decay, >1 decays faster
    current_strength FLOAT DEFAULT 1.0, -- 0.0-1.0, reduced by decay

    -- Session
    session_id UUID REFERENCES sessions(id),

    -- Processing Status
    processing_status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, processed, failed
    processed_at TIMESTAMPTZ,

    -- Extraction Results
    extracted_entities JSONB DEFAULT '[]',
    extracted_beliefs JSONB DEFAULT '[]',

    -- Constraints
    CONSTRAINT valid_salience CHECK (salience_score >= 0.0 AND salience_score <= 10.0),
    CONSTRAINT valid_strength CHECK (current_strength >= 0.0 AND current_strength <= 1.0)
);

-- Indexes
CREATE INDEX idx_memories_created ON memories (created_at DESC);
CREATE INDEX idx_memories_salience ON memories (salience_score DESC);
CREATE INDEX idx_memories_strength ON memories (current_strength DESC);
CREATE INDEX idx_memories_session ON memories (session_id);
CREATE INDEX idx_memories_source ON memories (source);
CREATE INDEX idx_memories_status ON memories (processing_status);

-- Vector index (choose one based on pgvector version)
-- HNSW (recommended for pgvector >= 0.5.0)
CREATE INDEX idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops);

-- IVFFLAT alternative (requires ANALYZE after bulk inserts)
-- CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- ANALYZE memories;
```

## 4.3 edges (The Graph Structure)

Relationships between memories, entities, and beliefs.

**Note**: Polymorphic edges cannot have real FKs to multiple tables. Enforce integrity in application layer with periodic integrity checks.

```sql
CREATE TABLE edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Nodes (polymorphic: can connect memories, entities, or beliefs)
    source_type VARCHAR(20) NOT NULL,  -- 'memory', 'entity', 'belief'
    source_id UUID NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    target_id UUID NOT NULL,

    -- Edge Properties
    edge_type VARCHAR(30) NOT NULL,
    -- Types:
    --   MENTIONS: memory → entity
    --   RELATES_TO: entity ↔ entity
    --   SUPPORTS: belief → belief
    --   CONTRADICTS: belief → belief
    --   TEMPORAL_SEQUENCE: memory → memory
    --   CAUSAL: memory → memory
    --   SIMILAR: any → any (semantic similarity)
    --   ASSOCIATED: any → any (co-activated)

    -- Strength (KEY FOR GRAPH DYNAMICS)
    weight FLOAT NOT NULL DEFAULT 0.5,  -- 0.0-1.0
    initial_weight FLOAT NOT NULL,

    -- Activation (Hebbian learning)
    last_activated_at TIMESTAMPTZ DEFAULT NOW(),
    activation_count INTEGER DEFAULT 1,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(50),             -- 'extraction', 'consolidation', 'manual'
    consolidation_run_id UUID,          -- for idempotency
    metadata JSONB DEFAULT '{}',

    -- Prevent duplicate edges
    UNIQUE(source_type, source_id, target_type, target_id, edge_type),
    CONSTRAINT valid_weight CHECK (weight >= 0.0 AND weight <= 1.0)
);

CREATE INDEX idx_edges_source ON edges (source_type, source_id);
CREATE INDEX idx_edges_target ON edges (target_type, target_id);
CREATE INDEX idx_edges_type ON edges (edge_type);
CREATE INDEX idx_edges_weight ON edges (weight DESC);
```

## 4.4 entities (Extracted Structured Data)

People, projects, and concepts extracted from memories.

```sql
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Type & Identity
    entity_type VARCHAR(30) NOT NULL,  -- 'person', 'project', 'concept', 'place', 'organization'
    canonical_name VARCHAR(255) NOT NULL,
    aliases TEXT[] DEFAULT '{}',

    -- Embedding for semantic search
    embedding vector(1536),

    -- Type-specific attributes (flexible schema)
    attributes JSONB DEFAULT '{}',

    -- Salience
    salience_score FLOAT DEFAULT 5.0,

    -- Temporal
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    mention_count INTEGER DEFAULT 1,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    merged_into_id UUID REFERENCES entities(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_type ON entities (entity_type);
CREATE INDEX idx_entities_name ON entities (canonical_name);
CREATE INDEX idx_entities_salience ON entities (salience_score DESC);
CREATE INDEX idx_entities_embedding ON entities USING hnsw (embedding vector_cosine_ops);
```

## 4.5 beliefs (What AI Knows as True)

Extracted facts, preferences, and beliefs about the human.

```sql
CREATE TABLE beliefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Content
    subject VARCHAR(255) NOT NULL,
    statement TEXT NOT NULL,
    belief_type VARCHAR(30) NOT NULL,   -- 'fact', 'preference', 'constraint', 'goal', 'behavior', 'value'

    -- Embedding
    embedding vector(1536),

    -- Confidence & Validity
    confidence FLOAT NOT NULL DEFAULT 0.7,  -- 0.0-1.0
    is_temporary BOOLEAN DEFAULT FALSE,
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,

    -- Source
    source_memory_id UUID REFERENCES memories(id),
    source_type VARCHAR(30),  -- 'extraction', 'inference', 'explicit'

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    superseded_by UUID REFERENCES beliefs(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_beliefs_type ON beliefs (belief_type);
CREATE INDEX idx_beliefs_subject ON beliefs (subject);
CREATE INDEX idx_beliefs_active ON beliefs (is_active) WHERE is_active = TRUE;
CREATE INDEX idx_beliefs_embedding ON beliefs USING hnsw (embedding vector_cosine_ops);
```

## 4.6 sessions (Conversation Boundaries)

```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Session Type
    session_type VARCHAR(30) NOT NULL,  -- 'chat', 'voice', 'notes', 'mixed'
    source VARCHAR(50),

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,

    -- Session-level Metrics
    memory_count INTEGER DEFAULT 0,
    primary_topics TEXT[],

    -- Emotional Trajectory
    starting_emotion VARCHAR(30),
    ending_emotion VARCHAR(30),
    emotional_arc JSONB,

    -- Consolidation
    consolidation_status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed
    consolidated_at TIMESTAMPTZ,
    consolidation_summary TEXT,
    last_consolidated_memory_id UUID,  -- checkpoint for idempotency

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_status ON sessions (consolidation_status);
CREATE INDEX idx_sessions_started ON sessions (started_at DESC);
```

## 4.7 context_profiles (Injection Profiles)

```sql
CREATE TABLE context_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,

    -- Selection Criteria
    include_sources TEXT[],
    include_entity_types TEXT[],
    include_belief_types TEXT[],
    min_salience FLOAT DEFAULT 3.0,
    min_strength FLOAT DEFAULT 0.3,

    -- Recency Weighting
    recency_weight FLOAT DEFAULT 0.5,
    lookback_days INTEGER DEFAULT 30,

    -- Emotional Filtering
    emotional_match BOOLEAN DEFAULT FALSE,
    preferred_valence VARCHAR(10),

    -- Output Configuration
    max_tokens INTEGER DEFAULT 4000,
    format VARCHAR(20) DEFAULT 'markdown',  -- markdown, json, plain

    -- Scoring Weights (configurable per profile)
    scoring_weights JSONB DEFAULT '{"salience": 0.45, "relevance": 0.25, "recency": 0.20, "strength": 0.10}',

    -- Token Budget Caps (percentages)
    budget_caps JSONB DEFAULT '{"summaries": 0.30, "beliefs": 0.20, "memories": 0.50}',

    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default profiles
INSERT INTO context_profiles (name, description, include_entity_types, is_default) VALUES
('general', 'Default balanced context', ARRAY['person', 'project', 'concept'], TRUE),
('work', 'Work-focused context', ARRAY['project', 'organization', 'person'], FALSE),
('personal', 'Personal life context', ARRAY['person', 'place'], FALSE),
('creative', 'Creative projects context', ARRAY['project', 'concept'], FALSE);
```

## 4.8 living_summaries (Distilled State)

```sql
CREATE TABLE living_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    category VARCHAR(50) NOT NULL UNIQUE,
    -- Categories: commitments, people, projects, tensions, mood, narrative, goals, beliefs_summary

    content TEXT NOT NULL,

    -- Metrics
    observation_count INTEGER DEFAULT 0,
    last_memory_id UUID REFERENCES memories(id),
    last_consolidation_run_id UUID,  -- for idempotency

    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize categories
INSERT INTO living_summaries (category, content) VALUES
('commitments', 'No commitments tracked yet.'),
('people', 'No people tracked yet.'),
('projects', 'No projects tracked yet.'),
('tensions', 'No tensions tracked yet.'),
('mood', 'No mood patterns tracked yet.'),
('narrative', 'No self-narrative established yet.'),
('goals', 'No goals tracked yet.'),
('beliefs_summary', 'No beliefs summarized yet.');
```

## 4.9 consolidation_runs (Sleep Process History)

```sql
CREATE TABLE consolidation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Trigger
    trigger_type VARCHAR(30) NOT NULL,  -- 'session_end', 'scheduled', 'manual'
    session_id UUID REFERENCES sessions(id),

    -- Results
    memories_analyzed INTEGER DEFAULT 0,
    edges_created INTEGER DEFAULT 0,
    edges_strengthened INTEGER DEFAULT 0,
    edges_pruned INTEGER DEFAULT 0,
    decay_applied_to INTEGER DEFAULT 0,
    patterns_detected INTEGER DEFAULT 0,
    insights_generated INTEGER DEFAULT 0,

    -- Generated Content
    summary TEXT,
    insights JSONB DEFAULT '[]',
    patterns JSONB DEFAULT '[]',

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    status VARCHAR(20) DEFAULT 'running',  -- running, completed, failed
    error_message TEXT
);

CREATE INDEX idx_consolidation_runs_status ON consolidation_runs (status);
CREATE INDEX idx_consolidation_runs_started ON consolidation_runs (started_at DESC);
```

## 4.10 disclosure_log (Audit Trail)

Track when memories/beliefs are shown to AI models.

```sql
CREATE TABLE disclosure_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Context request
    conversation_id VARCHAR(100),
    profile_used VARCHAR(100),
    query_text TEXT,

    -- What was disclosed
    disclosed_memory_ids UUID[],
    disclosed_belief_ids UUID[],
    disclosed_entity_ids UUID[],

    -- Output
    token_count INTEGER,
    format VARCHAR(20),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_disclosure_created ON disclosure_log (created_at DESC);
CREATE INDEX idx_disclosure_conversation ON disclosure_log (conversation_id);
```

## 4.11 objects (File Storage References)

```sql
CREATE TABLE objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- File Info
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,

    -- Storage Location
    storage_path TEXT NOT NULL,
    storage_backend VARCHAR(20) DEFAULT 'local',  -- local, minio, s3

    -- Linked Memory
    memory_id UUID REFERENCES memories(id),

    -- Processing
    transcription TEXT,
    extracted_text TEXT,
    description TEXT,
    embedding vector(1536),

    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# PART 5: SALIENCE SCORING

## The Problem Salience Solves

Not all memories are equal. A grocery list should not have the same weight as a life-changing realization. Human memory doesn't work this way - important things stick, trivial things fade.

## Two-Stage Scoring

1. **Heuristic pre-score** (fast, deterministic) - Always runs
2. **LLM refinement** (optional, behind feature flag) - For nuanced assessment

This makes MVP stable and reduces frontier model dependency.

## Salience Factors

| Factor                      | Weight | Description                                   |
| --------------------------- | ------ | --------------------------------------------- |
| **Emotional Intensity**     | 0.20   | Strong emotions = important                   |
| **Novelty**                 | 0.15   | How different from existing knowledge         |
| **Self-Reference**          | 0.15   | About the human themselves (identity, values) |
| **Relationship Importance** | 0.15   | Involves important people                     |
| **Temporal Relevance**      | 0.10   | Upcoming events, deadlines                    |
| **Explicit Marking**        | 0.10   | User said "remember this" or equivalent       |
| **Action Density**          | 0.10   | Commitments, decisions, changes               |
| **Context Richness**        | 0.05   | Amount of useful detail                       |

## Salience Calculation

```typescript
interface SalienceFactors {
  emotional_intensity: number;    // 0-10
  novelty: number;                // 0-10
  self_reference: number;         // 0-10
  relationship_importance: number; // 0-10
  temporal_relevance: number;     // 0-10
  explicit_marking: number;       // 0 or 10
  action_density: number;         // 0-10
  context_richness: number;       // 0-10
}

const SALIENCE_WEIGHTS = {
  emotional_intensity: 0.20,
  novelty: 0.15,
  self_reference: 0.15,
  relationship_importance: 0.15,
  temporal_relevance: 0.10,
  explicit_marking: 0.10,
  action_density: 0.10,
  context_richness: 0.05
};

function calculateSalience(factors: SalienceFactors): number {
  let score = 0;
  for (const [factor, weight] of Object.entries(SALIENCE_WEIGHTS)) {
    score += factors[factor as keyof SalienceFactors] * weight;
  }
  return Math.min(10.0, Math.max(0.0, score));
}
```

## Salience Update Policy

- **Do NOT rewrite salience on every access**
- Salience updates only during consolidation runs, based on:
  - access_count deltas
  - edge connectivity changes
  - explicit user pin/unpin

## Salience-Driven Behaviors

1. **Decay Rate**: `decay_rate = 1.0 + (5.0 - salience_score) * 0.1`
   - High salience (8+): decays slower (0.7x)
   - Low salience (2-): decays faster (1.3x)

2. **Retrieval Ranking**: Salience is primary factor in scoring

3. **Context Injection**: High-salience memories get priority in limited token budgets

4. **Edge Formation**: High-salience memories form stronger initial edges

---

# PART 6: EMOTIONAL TAGGING

## Why Per-Memory Emotions?

Emotions are attached to specific memories. "I was excited when I got the job offer" is different from "I was worried about money." Both contribute to overall state, but the emotional context is memory-specific.

## Emotion Model

Using Plutchik's wheel, simplified:

### Primary Emotions
- Joy, Sadness, Anger, Fear, Surprise, Anticipation, Trust, Disgust, **None**

### Additional Dimensions
- **Intensity**: 0.0-1.0 (how strong)
- **Valence**: positive / negative / neutral
- **Arousal**: high / low (energy level)

## Configuration

```typescript
// Environment flag for privacy control
ENABLE_EMOTION_TAGGING=true|false
```

## Emotion Extraction Prompt

```
Analyze the emotional content of this observation.

Observation: "{content}"

Identify:
1. Primary emotion (joy, sadness, anger, fear, surprise, anticipation, trust, disgust, or none)
2. Intensity (0.0-1.0, where 1.0 is extremely strong)
3. Valence (positive, negative, neutral)
4. Arousal (high, low)

If no clear emotion, use: none, 0.0, neutral, low

Respond in JSON only:
{"primary_emotion": "...", "intensity": 0.0, "valence": "...", "arousal": "..."}
```

---

# PART 7: GRAPH STRUCTURE

## Why Graph?

Relational tables can't efficiently answer: "What's connected to X?" "What's the path between A and B?" "What clusters together?"

## Edge Types

| Type | Description | Direction |
|------|-------------|-----------|
| MENTIONS | memory → entity | directed |
| RELATES_TO | entity ↔ entity | undirected |
| SUPPORTS | belief → belief | directed |
| CONTRADICTS | belief → belief | directed |
| TEMPORAL_SEQUENCE | memory → memory | directed |
| CAUSAL | memory → memory | directed |
| SIMILAR | any → any | undirected |
| ASSOCIATED | any → any | undirected |

## Edge Dynamics

### Hebbian Learning
When memories are retrieved together, their connecting edge strengthens:
```typescript
new_weight = min(1.0, weight + 0.05 * co_activation_count)
```

### Edge Decay
Edges not activated decay over time:
```typescript
new_weight = weight * (0.99 ^ days_since_activation)
```
Edges below 0.1 weight are pruned during consolidation.

---

# PART 8: CONSOLIDATION ("SLEEP")

## When Consolidation Runs

1. **Session End**: Triggered when a session closes
2. **Scheduled**: Daily at configured time
3. **Manual**: Explicit trigger via CLI or API

## Idempotency Rules

Consolidation must be re-runnable without double-counting:
- Store `consolidation_run_id` on derived artifacts
- Record checkpoints: `last_consolidated_memory_id` per session
- Track `last_consolidation_run_id` on living summaries

## Consolidation Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CONSOLIDATION PIPELINE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. LOAD CANDIDATES                                                  │
│     └── Load memories since last checkpoint                         │
│                                                                      │
│  2. DECAY PHASE                                                      │
│     ├── Calculate time since last access for each memory            │
│     ├── Apply decay: strength *= (decay_rate ^ days)                 │
│     └── Mark memories with strength < 0.1 as "faded"                 │
│                                                                      │
│  3. EDGE MAINTENANCE                                                 │
│     ├── Decay unactivated edges                                      │
│     ├── Prune edges with weight < 0.1                                │
│     └── Find new SIMILAR edges (embedding similarity > 0.8)          │
│                                                                      │
│  4. BELIEF MAINTENANCE                                               │
│     ├── Check for contradicting beliefs                              │
│     └── Mark superseded beliefs                                      │
│                                                                      │
│  5. PATTERN DETECTION (optional)                                     │
│     ├── Cluster recent memories by topic                             │
│     └── Detect emotional patterns                                    │
│                                                                      │
│  6. LIVING SUMMARY UPDATES                                           │
│     └── Incrementally update relevant summaries                      │
│                                                                      │
│  7. STRENGTHENING                                                    │
│     ├── High-salience memories get strength boost                    │
│     ├── Frequently accessed memories resist decay                   │
│     └── Well-connected memories (5+ edges) strengthen                │
│                                                                      │
│  8. INSIGHT GENERATION (optional)                                    │
│     └── Generate consolidation summary with insights                 │
│                                                                      │
│  9. UPDATE CHECKPOINTS                                               │
│     └── Record run completion for idempotency                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Consolidation Parameters

```typescript
interface ConsolidationConfig {
  // Decay
  baseDecayRate: number;          // 0.995 (0.5% per day base)
  salienceDecayModifier: number;  // salience affects decay rate

  // Edge Maintenance
  edgeDecayRate: number;          // 0.99 per day
  edgePruneThreshold: number;     // 0.1
  similarityThreshold: number;    // 0.8 for new SIMILAR edges

  // Strengthening
  accessBoostAmount: number;      // 0.1 per access
  salienceBoostThreshold: number; // 7.0 (high salience gets boost)
  connectionBoostThreshold: number; // 5+ edges = boost

  // Research (optional)
  enableActiveResearch: boolean;
  maxInsightsPerRun: number;      // 5
}
```

---

# PART 9: CONTEXT INJECTION

## The "Morning" Phase

Before an AI conversation begins, Squire injects relevant context. The AI "wakes up" knowing things.

## Retrieval Recipe

Candidates:
- Living summaries (always included)
- Active beliefs (always, but capped)
- Top entities by (salience × recency)
- Top memories by combined score

## Scoring Function

```typescript
function scoreMemory(memory: Memory, query?: string): number {
  const weights = profile.scoring_weights; // from context_profiles

  const norm_salience = memory.salience_score / 10;
  const norm_strength = memory.current_strength;
  const norm_recency = Math.exp(-daysSince(memory.created_at) / 30); // 30-day half-life
  const norm_relevance = query
    ? cosineSimilarity(memory.embedding, queryEmbedding)
    : 0.5; // default if no query

  return (
    weights.salience * norm_salience +
    weights.relevance * norm_relevance +
    weights.recency * norm_recency +
    weights.strength * norm_strength
  );
}
```

## Token Budgeting

Use percentage caps (not fixed reserves) for flexibility:

```typescript
const budget = profile.max_tokens;
const caps = profile.budget_caps;

const summaryBudget = Math.floor(budget * caps.summaries);  // max 30%
const beliefBudget = Math.floor(budget * caps.beliefs);     // max 20%
const memoryBudget = budget - actualSummaryTokens - actualBeliefTokens; // remainder
```

## Output Contract

Provide both formats for downstream flexibility:
- `context_package.markdown` - Human-readable
- `context_package.json` - Machine-parseable

### Markdown Format

```markdown
# Memory Context for AI

## Who You're Talking To
Brian - [brief from narrative summary]

## Current State
- Mood: [from mood summary]
- Active Projects: [from projects summary]
- Open Commitments: [from commitments summary]

## Key People
[Top 5 people by recent mention + importance]

## Relevant Recent Memories
[Ranked list with timestamps and salience indicators]

## Active Beliefs
[Core beliefs about preferences, constraints, goals]

## Today's Context
- Date: {date}
- Day of week: {day}
- Upcoming: [from calendar/commitments]
```

---

# PART 10: PROCESSING PIPELINE

## Observation → Memory Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      INGESTION PIPELINE                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. RECEIVE                                                          │
│     ├── Validate input                                               │
│     ├── Store in raw_observations (immutable)                        │
│     ├── Detect/create session                                        │
│     └── Create memory record (status: pending)                       │
│                                                                      │
│  2. EMBED                                                            │
│     └── Generate embedding (1536-dim)                                │
│                                                                      │
│  3. SCORE SALIENCE (heuristic)                                       │
│     ├── Check for emotional intensity markers                        │
│     ├── Check novelty (compare to recent embeddings)                 │
│     ├── Check for self-reference patterns                            │
│     ├── Check for entity mentions (known important people)           │
│     ├── Check for temporal markers (dates, deadlines)                │
│     ├── Check for explicit importance markers                        │
│     ├── Check for action/commitment language                         │
│     └── Calculate final salience score                               │
│                                                                      │
│  4. TAG EMOTIONS (if enabled)                                        │
│     └── Extract primary_emotion, intensity, valence, arousal         │
│                                                                      │
│  5. EXTRACT ENTITIES                                                 │
│     ├── Extract people, projects, concepts, places                   │
│     └── Create/update entities + MENTIONS edges                      │
│                                                                      │
│  6. EXTRACT BELIEFS                                                  │
│     ├── Extract facts, preferences, constraints, goals               │
│     ├── Check for contradictions with existing beliefs               │
│     └── Store with source_memory_id reference                        │
│                                                                      │
│  7. UPDATE LIVING SUMMARIES                                          │
│     ├── Classify which categories touched                            │
│     └── Incrementally update relevant summaries                      │
│                                                                      │
│  8. MARK COMPLETE                                                    │
│     └── Update status to 'processed'                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

# PART 11: API DESIGN

## Memory Operations

```
POST /api/memories
  Body: { content, source, source_metadata?, occurred_at? }
  Response: { id, salience_score, primary_emotion }

GET /api/memories
  Query: { limit?, offset?, min_salience?, source?, since?, until? }
  Response: { memories[], total }

GET /api/memories/:id
  Response: { memory, edges[], entities[] }

GET /api/memories/search
  Query: { query, limit?, min_salience? }
  Response: { memories[] }

DELETE /api/memories/:id
  Response: { deleted: true, cleanup: { edges, beliefs } }

POST /api/memories/:id/redact
  Body: { patterns: string[] }
  Response: { redacted: true, patterns_matched: number }
```

## Entity Operations

```
GET /api/entities
  Query: { type?, limit? }
  Response: { entities[] }

GET /api/entities/:id
  Response: { entity, memories[], edges[] }

GET /api/entities/search
  Query: { query, type? }
  Response: { entities[] }
```

## Context Injection

```
POST /api/context
  Body: { profile?, query?, max_tokens?, conversation_id? }
  Response: {
    context_package: { markdown, json },
    disclosed_memory_ids[],
    disclosed_belief_ids[],
    token_count
  }
```

## Session Operations

```
POST /api/sessions/start
  Body: { type, source? }
  Response: { session_id }

POST /api/sessions/:id/end
  Response: { summary, consolidation_scheduled }

GET /api/sessions/:id
  Response: { session, memories[] }
```

## Consolidation

```
POST /api/consolidate
  Body: { session_id? }
  Response: { run_id }

GET /api/consolidate/:run_id
  Response: { run, status, results? }
```

## Health

```
GET /api/health
  Response: { status, database, llm_provider, embedding_provider }
```

---

# PART 12: IMPLEMENTATION PHASES

## Phase 1: Foundation (MVP)

**Goal**: Store memories, retrieve with semantic search, inject context

- [ ] Project setup (TypeScript, PostgreSQL, schema migrations)
- [ ] `raw_observations` table + basic storage
- [ ] `memories` table + CRUD operations
- [ ] Embedding generation (configurable provider)
- [ ] Heuristic salience scoring (deterministic)
- [ ] Semantic search endpoint
- [ ] Basic context injection (`GET/POST /api/context`)
- [ ] CLI: `observe`, `search`, `context`
- [ ] Basic health endpoint

## Phase 2: Graph & Entities

**Goal**: Entity extraction and edge structure

- [ ] Entity extraction pipeline (regex + optional LLM)
- [ ] Entities table and storage
- [ ] Beliefs table and extraction
- [ ] MENTIONS edge creation
- [ ] Basic edge queries
- [ ] CLI: `entities`, `who`

## Phase 3: Consolidation

**Goal**: Per-session consolidation with decay

- [ ] Session management
- [ ] Decay implementation
- [ ] Edge maintenance (decay, pruning, SIMILAR creation)
- [ ] Consolidation pipeline (idempotent)
- [ ] CLI: `consolidate`, `sleep`

## Phase 4: Living Summaries

**Goal**: Incremental summary updates

- [ ] Category classification
- [ ] Summary update prompts
- [ ] Living summary reads
- [ ] CLI: `commits`, `people`, `projects`, `tensions`, `mood`, `narrative`

## Phase 5: Context Injection (Advanced)

**Goal**: Full context package generation

- [ ] Context profiles (work/personal/creative)
- [ ] Full scoring function implementation
- [ ] Token budgeting with caps
- [ ] Dual format output (markdown + JSON)
- [ ] Disclosure logging

## Phase 6: Object Storage

**Goal**: Handle images, audio, documents

- [ ] Local filesystem storage
- [ ] Objects table
- [ ] Image description (LLM)
- [ ] Audio transcription
- [ ] Document text extraction

## Phase 7: Advanced Features

**Goal**: Full vision implementation

- [ ] Active research during consolidation
- [ ] Pattern detection
- [ ] Insight generation
- [ ] Graph queries (paths, clusters)
- [ ] Temporal queries

---

# PART 13: OPEN QUESTIONS FOR ITERATION

## Architecture
1. Session boundary detection: Timeout? Explicit signal? Both?
2. Cross-session context: Include relevant memories from previous sessions?
3. Entity resolution: How aggressive in merging? (Sarah vs Sarah Chen)
4. Belief conflict resolution: Newest wins? Ask user? Confidence-based?

## Technical
5. Embedding dimension migration: Re-embed all if provider changes?
6. Deletion semantics: Delete vs mark inactive for beliefs/entities when source deleted?
7. Evaluation: What offline tests prove context injection helps?
8. Provenance display: How does AI cite sources?

## Salience & Graph
9. Novelty calculation: Embedding distance threshold? Topic modeling?
10. Edge creation threshold: 0.8? 0.85? 0.9?
11. Graph traversal depth: How many hops for "what's related to X"?
12. Salience drift: Update based on access patterns?

## Consolidation
13. Research phase prompts: What questions to ask? How to detect knowledge gaps?
14. Insight quality: How to ensure generated insights are useful?
15. Minimum session length: Skip consolidation for < 5 minute sessions?

## Integration
16. Voice input chunking: Silence detection? Topic shifts? Time windows?
17. Note parsing: How to handle Obsidian structure (headers, links, tags)?
18. Calendar integration: Bidirectional or one-way?

---

# PART 14: MVP ACCEPTANCE TESTS

By end of Phase 1, these should work:

```bash
# 1. Store a memory with context
squire observe "Met Sarah to discuss the AI project due next Friday" --source chat

# 2. Semantic search finds it
squire search "AI project"
# → Returns the memory with salience score

# 3. Context injection includes it
squire context --profile work --query "status"
# → Returns context package that includes:
#   - The memory
#   - Extracted time marker (even if crude)
#   - Salience score > baseline (contains deadline/relationship/action)
```

---

# PART 15: FILE STRUCTURE

```
squire/
├── docs/
│   ├── SQUIRE-DESIGN-PLAN.md           # This document (master)
│   ├── SQUIRE-DESIGN-PLAN-SEED.md      # Original v1.0
│   └── SQUIRE-DESIGN-PLAN-GPT52PRO-i1.md  # GPT-5.2 Pro iteration
├── schema/
│   ├── 001_raw_observations.sql
│   ├── 002_memories.sql
│   ├── 003_edges.sql
│   ├── 004_entities_beliefs.sql
│   ├── 005_sessions.sql
│   ├── 006_context_profiles.sql
│   ├── 007_living_summaries.sql
│   ├── 008_consolidation.sql
│   ├── 009_disclosure_log.sql
│   └── 010_objects.sql
├── src/
│   ├── index.ts
│   ├── cli.ts
│   ├── config/
│   │   └── index.ts
│   ├── db/
│   │   ├── pool.ts
│   │   └── migrations.ts
│   ├── providers/
│   │   ├── index.ts
│   │   ├── groq.ts
│   │   ├── ollama.ts
│   │   └── types.ts
│   ├── services/
│   │   ├── ingestion/
│   │   │   ├── index.ts
│   │   │   ├── salience.ts
│   │   │   ├── emotion.ts
│   │   │   └── extraction.ts
│   │   ├── consolidation/
│   │   │   ├── index.ts
│   │   │   ├── decay.ts
│   │   │   ├── edges.ts
│   │   │   ├── patterns.ts
│   │   │   └── research.ts
│   │   ├── context/
│   │   │   ├── index.ts
│   │   │   ├── profiles.ts
│   │   │   ├── ranking.ts
│   │   │   └── formatting.ts
│   │   ├── summaries/
│   │   │   └── index.ts
│   │   └── sessions/
│   │       └── index.ts
│   ├── api/
│   │   ├── server.ts
│   │   └── routes/
│   │       ├── memories.ts
│   │       ├── entities.ts
│   │       ├── context.ts
│   │       ├── sessions.ts
│   │       └── consolidate.ts
│   └── utils/
│       ├── embeddings.ts
│       └── tokens.ts
├── data/
│   └── objects/
├── tests/
│   └── ...
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

---

# PART 16: SUCCESS CRITERIA

## MVP Success (Phase 1)
- [ ] Can store memories with salience scores
- [ ] Can retrieve memories by semantic search
- [ ] Salience affects retrieval ranking
- [ ] Basic emotional tagging works (if enabled)
- [ ] CLI is functional
- [ ] Context injection returns useful package

## Full Vision Success
- [ ] Context injection works - AI "wakes up" informed
- [ ] Graph queries work - "what's related to X?"
- [ ] Consolidation runs per-session (idempotent)
- [ ] Decay and strengthening affect retrieval
- [ ] Living summaries stay current
- [ ] Insights generated during consolidation are useful
- [ ] Works offline with local LLM

## Ultimate Success
- AI conversations feel meaningfully different because of context
- The AI demonstrates genuine knowing, not just data retrieval
- Memory compounds over time - the system gets better
- Brian feels understood by his AI partner

---

# APPENDIX A: Design Iteration History

## v1.0.0 (Seed) - Claude
- Established vision and philosophy
- Designed core data model
- Defined salience scoring system
- Created three-phase architecture (Daytime/Sleep/Morning)

## v1.1.0 (This Document) - Claude + GPT-5.2 Pro
- Added `raw_observations` table for provenance
- Added security/privacy requirements
- Fixed pgvector indexing (HNSW vs IVFFLAT)
- Made consolidation idempotent with checkpoints
- Added explicit scoring function for context injection
- Added token budgeting with percentage caps
- Added disclosure logging for audit trail
- Added concrete MVP acceptance tests
- Standardized on 1536-dim embeddings (configurable)
- Provider strategy: Groq-first, frontier opt-in

---

**Document Status**: Production-ready design
**Next Steps**: Begin Phase 1 implementation

*December 25, 2025 - The birth of AI memory.*
