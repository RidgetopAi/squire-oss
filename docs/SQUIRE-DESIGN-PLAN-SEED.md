# SQUIRE DESIGN PLAN

## AI Memory System - Architecture & Implementation Blueprint

**Version:** 1.0.0
**Date:** December 25, 2025
**Status:** Foundational Design - Ready for SIRK Iteration

---

# PART 1: VISION & PHILOSOPHY

## The Core Insight

**This is not user memory. This is AI memory that knows the user.**

Traditional approaches store data about users for later retrieval. Squire inverts this: the AI becomes the entity with memory. The AI knows its human partner - their patterns, priorities, emotional landscape, relationships, and goals. Every conversation starts with context, not cold.

## The Goal

**Develop the best personal memory for AI we can.**

This is the unlock. This is the key to better AI. Current AI starts every conversation amnesia-fresh. Squire gives AI genuine knowing - not just data retrieval, but understanding that compounds over time.

## The Three Phases (from Brian's Vision)

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

## Design Principles

1. **AI-Agnostic**: Memory layer any AI can tap into (not tied to Claude, GPT, etc.)
2. **Local-First**: All core features work offline. Cloud is backup, not compute.
3. **Salience-First**: Not all memories are equal. Importance drives everything.
4. **Graph-Structured**: Relationships between concepts, not just flat storage.
5. **Single Human**: One AI ↔ One Human. No multi-tenancy complexity.

---

# PART 2: ARCHITECTURE OVERVIEW

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

| Component      | Technology                                                                                                                      | Rationale                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Language       | TypeScript                                                                                                                      | Type safety, Keymaker compatibility   |
| Database       | PostgreSQL + pgvector                                                                                                           | Proven, pgvector for embeddings       |
| LLM Generation | Ollama (local) / Groq (cloud fallback) **Change: Groq First - need bigger model reasoning with Frontier model optional backup** | Local-first(still private using Groq) |
| Embeddings     | Ollama nomic-embed-text (768-dim) **Change: 1536-dim**                                                                          | Free, local, good quality             |
| Object Storage | Local filesystem → MinIO → S3                                                                                                   | Progressive cloud migration           |
| API            | Express.js                                                                                                                      | Simple, proven                        |
| CLI            | Commander.js                                                                                                                    | Keymaker pattern                      |

---

# PART 3: DATA MODEL

## Core Tables

### 3.1 memories (The Foundation)

The atomic unit of Squire. Every piece of information the AI knows.

```sql
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Content
    content TEXT NOT NULL,
    content_type VARCHAR(50) NOT NULL,  -- 'text', 'transcript', 'note', 'chat_message'
    source VARCHAR(50) NOT NULL,         -- 'voice', 'chat', 'notes', 'api', 'calendar', 'email'
    source_metadata JSONB DEFAULT '{}',  -- source-specific data

    -- Embeddings
    embedding vector(768),

    -- Salience (THE KEY DIFFERENTIATOR)
    salience_score FLOAT NOT NULL DEFAULT 5.0,  -- 0.0-10.0
    salience_factors JSONB DEFAULT '{}',        -- breakdown of scoring factors

    -- Emotional Tagging (PER-MEMORY)
    primary_emotion VARCHAR(30),        -- joy, sadness, anger, fear, surprise, anticipation, trust, disgust
    emotion_intensity FLOAT,            -- 0.0-1.0
    emotional_valence VARCHAR(10),      -- positive, negative, neutral
    emotional_arousal VARCHAR(10),      -- high, low

    -- Temporal
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    occurred_at TIMESTAMPTZ,            -- when event actually happened (may differ from created_at)

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

    -- Extraction Results (populated after processing)
    extracted_entities JSONB DEFAULT '[]',
    extracted_beliefs JSONB DEFAULT '[]',

    -- Indexes
    CONSTRAINT valid_salience CHECK (salience_score >= 0.0 AND salience_score <= 10.0),
    CONSTRAINT valid_strength CHECK (current_strength >= 0.0 AND current_strength <= 1.0)
);

-- Critical indexes
CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_memories_salience ON memories (salience_score DESC);
CREATE INDEX idx_memories_created ON memories (created_at DESC);
CREATE INDEX idx_memories_strength ON memories (current_strength DESC);
CREATE INDEX idx_memories_session ON memories (session_id);
CREATE INDEX idx_memories_source ON memories (source);
```

### 3.2 edges (The Graph Structure)

Relationships between memories, entities, and beliefs.

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
    --   MENTIONS: memory → entity (observation mentions a person/project)
    --   RELATES_TO: entity ↔ entity (person knows person, project involves person)
    --   SUPPORTS: belief → belief (one belief supports another)
    --   CONTRADICTS: belief → belief (beliefs in tension)
    --   TEMPORAL_SEQUENCE: memory → memory (A happened before B)
    --   CAUSAL: memory → memory (A caused B)
    --   SIMILAR: any → any (semantic similarity above threshold)
    --   ASSOCIATED: any → any (appeared together, co-activated)

    -- Strength (KEY FOR GRAPH DYNAMICS)
    weight FLOAT NOT NULL DEFAULT 0.5,  -- 0.0-1.0
    initial_weight FLOAT NOT NULL,      -- original strength at creation

    -- Activation (for Hebbian-like learning)
    last_activated_at TIMESTAMPTZ DEFAULT NOW(),
    activation_count INTEGER DEFAULT 1,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(50),             -- 'extraction', 'consolidation', 'manual'
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

### 3.3 entities (Extracted Structured Data)

People, projects, and concepts extracted from memories.

```sql
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Type & Identity
    entity_type VARCHAR(30) NOT NULL,  -- 'person', 'project', 'concept', 'place', 'organization'
    canonical_name VARCHAR(255) NOT NULL,
    aliases TEXT[] DEFAULT '{}',

    -- Embedding for semantic search
    embedding vector(768),

    -- Type-specific attributes (flexible schema)
    attributes JSONB DEFAULT '{}',
    -- For person: relationship_type, trust_level, contact_info
    -- For project: status, goal, priority
    -- For concept: category, strength
    -- For place: location_data
    -- For organization: type, relationship

    -- Salience (entities have importance too)
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
CREATE INDEX idx_entities_embedding ON entities USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_entities_salience ON entities (salience_score DESC);
```

### 3.4 beliefs (What AI Knows as True)

Extracted facts, preferences, and beliefs about the human.

```sql
CREATE TABLE beliefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Content
    subject VARCHAR(255) NOT NULL,      -- what/who this is about
    statement TEXT NOT NULL,            -- the belief itself
    belief_type VARCHAR(30) NOT NULL,   -- 'fact', 'preference', 'constraint', 'goal', 'behavior', 'value'

    -- Embedding
    embedding vector(768),

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
CREATE INDEX idx_beliefs_embedding ON beliefs USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_beliefs_active ON beliefs (is_active) WHERE is_active = TRUE;
```

### 3.5 sessions (Conversation Boundaries)

Track interaction sessions for per-session consolidation.

```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Session Type
    session_type VARCHAR(30) NOT NULL,  -- 'chat', 'voice', 'notes', 'mixed'
    source VARCHAR(50),                 -- which interface

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
    emotional_arc JSONB,  -- [{timestamp, emotion, intensity}]

    -- Consolidation
    consolidation_status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed
    consolidated_at TIMESTAMPTZ,
    consolidation_summary TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_status ON sessions (consolidation_status);
CREATE INDEX idx_sessions_started ON sessions (started_at DESC);
```

### 3.6 context_profiles (Injection Profiles)

Pre-defined contexts for different AI interaction modes.

```sql
CREATE TABLE context_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,

    -- Selection Criteria (which memories to include)
    include_sources TEXT[],           -- filter by source
    include_entity_types TEXT[],      -- filter by entity type
    include_belief_types TEXT[],      -- filter by belief type
    min_salience FLOAT DEFAULT 3.0,   -- minimum salience score
    min_strength FLOAT DEFAULT 0.3,   -- minimum current strength

    -- Recency Weighting
    recency_weight FLOAT DEFAULT 0.5,  -- 0=ignore recency, 1=heavily weight recent
    lookback_days INTEGER DEFAULT 30,

    -- Emotional Filtering
    emotional_match BOOLEAN DEFAULT FALSE,  -- match current emotional state
    preferred_valence VARCHAR(10),          -- positive, negative, neutral, any

    -- Output Configuration
    max_tokens INTEGER DEFAULT 4000,
    format VARCHAR(20) DEFAULT 'markdown',  -- markdown, json, plain

    -- Priority Ordering
    priority_factors JSONB DEFAULT '{"salience": 0.4, "recency": 0.3, "relevance": 0.3}',

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

### 3.7 living_summaries (Distilled State)

Continuously updated summaries (carried forward from Keymaker concept).

```sql
CREATE TABLE living_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    category VARCHAR(50) NOT NULL UNIQUE,
    -- Categories: commitments, people, projects, tensions, mood, narrative, goals, beliefs_summary

    content TEXT NOT NULL,

    -- Metrics
    observation_count INTEGER DEFAULT 0,
    last_memory_id UUID REFERENCES memories(id),

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

### 3.8 consolidation_runs (Sleep Process History)

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
```

### 3.9 objects (File Storage References)

```sql
CREATE TABLE objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- File Info
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,

    -- Storage Location
    storage_path TEXT NOT NULL,  -- /data/objects/2025/12/uuid.ext
    storage_backend VARCHAR(20) DEFAULT 'local',  -- local, minio, s3

    -- Linked Memory
    memory_id UUID REFERENCES memories(id),

    -- Processing
    transcription TEXT,           -- for audio
    extracted_text TEXT,          -- for documents
    description TEXT,             -- for images (LLM-generated)
    embedding vector(768),        -- embedding of content/description

    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# PART 4: SALIENCE SCORING

## The Problem Salience Solves

Keymaker treats all observations equally. A grocery list has the same weight as a life-changing realization. This is wrong. Human memory doesn't work this way - important things stick, trivial things fade.

## Salience Factors

Each memory receives a salience score (0.0-10.0) based on these factors:

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

function calculateSalience(factors: SalienceFactors): number {
  const weights = {
    emotional_intensity: 0.20,
    novelty: 0.15,
    self_reference: 0.15,
    relationship_importance: 0.15,
    temporal_relevance: 0.10,
    explicit_marking: 0.10,
    action_density: 0.10,
    context_richness: 0.05
  };

  let score = 0;
  for (const [factor, weight] of Object.entries(weights)) {
    score += factors[factor] * weight;
  }

  return Math.min(10.0, Math.max(0.0, score));
}
```

## Salience-Driven Behaviors

1. **Decay Rate**: `decay_rate = 1.0 + (5.0 - salience_score) * 0.1`
   
   - High salience (8+): decays slower (0.7x)
   - Low salience (2-): decays faster (1.3x)

2. **Retrieval Ranking**: Salience is primary sort, with recency as secondary

3. **Context Injection**: High-salience memories get priority in limited token budgets

4. **Edge Formation**: High-salience memories form stronger initial edges

---

# PART 5: EMOTIONAL TAGGING

## Why Per-Memory Emotions?

Keymaker tracks aggregate mood across all observations. But emotions are attached to specific memories. "I was excited when I got the job offer" is different from "I was worried about money." Both contribute to overall state, but the emotional context is memory-specific.

## Emotion Model

Using Plutchik's wheel as foundation, simplified:

### Primary Emotions

- Joy
- Sadness
- Anger
- Fear
- Surprise
- Anticipation
- Trust
- Disgust

### Additional Dimensions

- **Intensity**: 0.0-1.0 (how strong)
- **Valence**: positive / negative / neutral
- **Arousal**: high / low (energy level)

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

## Emotional Uses

1. **Retrieval**: "How was I feeling when I made that decision?" → filter by emotion
2. **Context Injection**: Match emotional context to current state
3. **Pattern Detection**: Track emotional arcs over time
4. **Consolidation**: High-emotion memories strengthened

---

# PART 6: GRAPH STRUCTURE

## Why Graph?

Relational tables can't efficiently answer: "What's connected to X?" "What's the path between A and B?" "What clusters together?"

Memories, entities, and beliefs form a knowledge graph. Edges capture relationships that matter.

## Edge Types

### Memory → Entity (MENTIONS)

```
Memory("Had lunch with Sarah about the AI project")
  ├── MENTIONS → Entity(Sarah, person)
  └── MENTIONS → Entity(AI project, project)
```

### Entity ↔ Entity (RELATES_TO)

```
Entity(Sarah) ── RELATES_TO ── Entity(AI project)
  [weight: 0.8, type: "works_on"]
```

### Belief ↔ Belief (SUPPORTS / CONTRADICTS)

```
Belief("I value work-life balance")
  ── CONTRADICTS ──
Belief("I should work 80 hours a week on the startup")
```

### Memory → Memory (TEMPORAL_SEQUENCE, CAUSAL)

```
Memory("Got the diagnosis")
  ── CAUSAL →
Memory("Started treatment plan")
```

### Any → Any (SIMILAR, ASSOCIATED)

```
Memory(A) ── SIMILAR ── Memory(B)
  [weight: 0.9, based on embedding similarity > 0.85]
```

## Edge Dynamics

### Hebbian Learning ("Neurons that fire together wire together")

- When memories are retrieved together, their connecting edge strengthens
- `new_weight = min(1.0, weight + 0.05 * co_activation_count)`

### Edge Decay

- Edges not activated decay over time
- `new_weight = weight * (0.99 ^ days_since_activation)`
- Edges below 0.1 weight are pruned during consolidation

### Edge Formation During Consolidation

- Find memory pairs with high embedding similarity (> 0.8)
- Create SIMILAR edges if none exist
- Analyze narratively related memories for CAUSAL/TEMPORAL edges

---

# PART 7: CONSOLIDATION ("SLEEP")

## When Consolidation Runs

1. **Session End**: Triggered when a session closes
2. **Scheduled**: Daily at configured time (e.g., 3 AM)
3. **Manual**: Explicit trigger via CLI or API

## Consolidation Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CONSOLIDATION PIPELINE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. DECAY PHASE                                                      │
│     ├── Calculate time since last access for each memory            │
│     ├── Apply decay: strength *= (decay_rate ^ days)                 │
│     └── Mark memories with strength < 0.1 as "faded"                 │
│                                                                      │
│  2. EDGE MAINTENANCE                                                 │
│     ├── Decay unactivated edges                                      │
│     ├── Prune edges with weight < 0.1                                │
│     └── Find new SIMILAR edges (embedding similarity > 0.8)          │
│                                                                      │
│  3. PATTERN DETECTION                                                │
│     ├── Cluster recent memories by topic                             │
│     ├── Identify recurring themes                                    │
│     └── Detect emotional patterns                                    │
│                                                                      │
│  4. RESEARCH PHASE (Active Consolidation)                            │
│     ├── Identify knowledge gaps                                      │
│     ├── Surface unasked questions                                    │
│     └── Generate reflections on patterns                             │
│                                                                      │
│  5. STRENGTHENING                                                    │
│     ├── High-salience memories get strength boost                    │
│     ├── Frequently accessed memories resist decay                   │
│     └── Multi-edge memories (well-connected) strengthen              │
│                                                                      │
│  6. LIVING SUMMARY UPDATES                                           │
│     └── Regenerate living summaries from current state               │
│                                                                      │
│  7. INSIGHT GENERATION                                               │
│     └── Generate consolidation summary with insights                 │
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

  // Research
  enableActiveResearch: boolean;
  maxInsightsPerRun: number;      // 5
}
```

---

# PART 8: CONTEXT INJECTION

## The "Morning" Phase

Before an AI conversation begins, Squire injects relevant context. The AI "wakes up" knowing things.

## Injection Process

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CONTEXT INJECTION FLOW                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  INPUT:                                                              │
│    - Profile (work/personal/general)                                 │
│    - Query context (if resuming conversation)                        │
│    - Token budget (e.g., 4000)                                       │
│    - Current timestamp                                               │
│                                                                      │
│  STEP 1: GATHER CANDIDATES                                           │
│    ├── Recent high-salience memories (last 7 days)                   │
│    ├── Relevant entities (based on profile)                          │
│    ├── Active beliefs (is_active = true)                             │
│    ├── Living summaries (always included)                            │
│    └── Query-relevant memories (if query provided)                   │
│                                                                      │
│  STEP 2: RANK & SCORE                                                │
│    Score = (salience × 0.4) + (recency × 0.3) + (relevance × 0.3)   │
│                                                                      │
│  STEP 3: TOKEN BUDGETING                                             │
│    ├── Reserve 1000 tokens for living summaries                      │
│    ├── Reserve 500 tokens for active beliefs                         │
│    ├── Fill remaining with ranked memories                           │
│    └── Ensure at least top 5 memories included                       │
│                                                                      │
│  STEP 4: FORMAT                                                      │
│    └── Output as structured markdown or JSON                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Context Package Format

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

# PART 9: PROCESSING PIPELINE

## Observation → Memory Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      INGESTION PIPELINE                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. RECEIVE                                                          │
│     ├── Validate input                                               │
│     ├── Detect/create session                                        │
│     └── Store raw in memories table (status: pending)                │
│                                                                      │
│  2. EMBED                                                            │
│     └── Generate embedding via Ollama nomic-embed-text               │
│                                                                      │
│  3. SCORE SALIENCE                                                   │
│     ├── Analyze for emotional intensity                              │
│     ├── Check novelty (compare to recent embeddings)                 │
│     ├── Check for self-reference patterns                            │
│     ├── Check for entity mentions (known important people)           │
│     ├── Check for temporal markers (dates, deadlines)                │
│     ├── Check for explicit importance markers                        │
│     ├── Check for action/commitment language                         │
│     └── Calculate final salience score                               │
│                                                                      │
│  4. TAG EMOTIONS                                                     │
│     └── Extract primary_emotion, intensity, valence, arousal         │
│                                                                      │
│  5. EXTRACT ENTITIES                                                 │
│     ├── Extract people                                               │
│     ├── Extract projects                                             │
│     ├── Extract concepts                                             │
│     ├── Extract places                                               │
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
│  8. FORM INITIAL EDGES                                               │
│     └── Create MENTIONS edges to extracted entities                  │
│                                                                      │
│  9. MARK COMPLETE                                                    │
│     └── Update status to 'processed'                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

# PART 10: IMPLEMENTATION PHASES

## Phase 1: Foundation (MVP)

**Goal**: Core memory storage with salience and basic retrieval

- [ ] Project setup (TypeScript, PostgreSQL, schema)
- [ ] Basic memory CRUD
- [ ] Embedding generation (Ollama)
- [ ] Salience scoring (simple version)
- [ ] Emotional tagging (basic)
- [ ] CLI: observe, query, list
- [ ] API: /observe, /query, /health

## Phase 2: Graph & Entities

**Goal**: Entity extraction and edge structure

- [ ] Entity extraction pipeline
- [ ] Entity tables and storage
- [ ] Edge creation (MENTIONS)
- [ ] Basic edge queries
- [ ] CLI: entities, who

## Phase 3: Consolidation

**Goal**: Per-session consolidation with decay

- [ ] Session management
- [ ] Decay implementation
- [ ] Edge maintenance
- [ ] Consolidation pipeline
- [ ] CLI: consolidate, sleep

## Phase 4: Living Summaries

**Goal**: Incremental summary updates

- [ ] Category classification
- [ ] Summary update prompts
- [ ] Living summary reads
- [ ] CLI: commits, people, projects, tensions, mood, narrative

## Phase 5: Context Injection

**Goal**: AI can "wake up" with context

- [ ] Context profiles
- [ ] Memory ranking
- [ ] Token budgeting
- [ ] Format output
- [ ] API: /context

## Phase 6: Object Storage

**Goal**: Handle images, audio, documents

- [ ] Local filesystem storage
- [ ] Object table
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

# PART 11: API DESIGN

## Core Endpoints

### Memory Operations

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
  Response: { memories[] } (semantic search)
```

### Entity Operations

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

### Context Injection

```
GET /api/context
  Query: { profile?, query?, max_tokens? }
  Response: { context_package }
```

### Session Operations

```
POST /api/sessions/start
  Body: { type, source? }
  Response: { session_id }

POST /api/sessions/:id/end
  Response: { summary, consolidation_scheduled }

GET /api/sessions/:id
  Response: { session, memories[] }
```

### Consolidation

```
POST /api/consolidate
  Body: { session_id? }  (optional: consolidate specific session)
  Response: { run_id }

GET /api/consolidate/:run_id
  Response: { run, status, results? }
```

### Health

```
GET /api/health
  Response: { status, database, llm_provider, embedding_provider }
```

---

# PART 12: OPEN QUESTIONS FOR SIRK

These are intentionally left unresolved for iterative refinement:

## Architecture Questions

1. **Session Boundary Detection**: How do we know when a session ends? Timeout? Explicit signal? Both?

2. **Cross-Session Context**: Should context injection include relevant memories from previous sessions even if not high-salience?

3. **Entity Resolution**: How aggressive should we be in merging entities? "Sarah" and "Sarah Chen" - same person or wait for confirmation?

4. **Belief Conflict Resolution**: When beliefs contradict, who decides which wins? Always newest? Ask user? Confidence-based?

## Salience Questions

5. **Novelty Calculation**: How exactly do we measure "how different from existing knowledge"? Embedding distance threshold? Topic modeling?

6. **Explicit Marking Patterns**: What phrases trigger explicit importance? "Remember this", "Important:", what else?

7. **Salience Drift**: Should salience scores update over time based on access patterns and edge formation?

## Graph Questions

8. **Edge Creation Threshold**: At what similarity threshold do we create SIMILAR edges? 0.8? 0.85? 0.9?

9. **Graph Traversal Depth**: For "what's related to X?" queries, how many hops?

10. **Cluster Detection**: What algorithm for detecting memory clusters? Simple community detection? Topic modeling?

## Consolidation Questions

11. **Research Phase Prompts**: What questions should the research phase ask? How do we detect "knowledge gaps"?

12. **Insight Quality**: How do we ensure generated insights are actually useful and not generic?

13. **Consolidation Frequency**: Per-session is the plan, but what if sessions are very short (< 5 minutes)?

## Emotional Questions

14. **Emotional Matching**: In context injection, how do we match emotional context? Same emotion? Same valence? Same arousal?

15. **Emotional Trajectory**: How do we represent the emotional arc of a session? Time series? Start/end points? Peak detection?

## Integration Questions

16. **Voice Input Chunking**: For continuous voice, how do we chunk into memories? Silence detection? Topic shifts? Time windows?

17. **Note Parsing**: For Obsidian-style notes, how do we handle structure (headers, links, tags)?

18. **Calendar Integration**: Bidirectional? One-way from calendar? One-way to calendar?

---

# PART 13: FILE STRUCTURE

```
squire/
├── docs/
│   └── SQUIRE-DESIGN-PLAN.md       # This document
├── schema/
│   ├── 001_core_tables.sql          # memories, edges, entities, beliefs
│   ├── 002_sessions.sql             # sessions, context_profiles
│   ├── 003_living_summaries.sql     # living_summaries, consolidation_runs
│   └── 004_objects.sql              # objects storage
├── src/
│   ├── index.ts                     # Entry point
│   ├── cli.ts                       # CLI interface
│   ├── config/
│   │   └── index.ts                 # Configuration management
│   ├── db/
│   │   ├── pool.ts                  # Database connection pool
│   │   └── migrations.ts            # Migration runner
│   ├── providers/
│   │   ├── index.ts                 # Provider factory
│   │   ├── ollama.ts                # Ollama client
│   │   ├── groq.ts                  # Groq client
│   │   └── types.ts                 # Provider interfaces
│   ├── services/
│   │   ├── ingestion/
│   │   │   ├── index.ts             # Ingestion pipeline
│   │   │   ├── salience.ts          # Salience scoring
│   │   │   ├── emotion.ts           # Emotion tagging
│   │   │   └── extraction.ts        # Entity/belief extraction
│   │   ├── consolidation/
│   │   │   ├── index.ts             # Consolidation pipeline
│   │   │   ├── decay.ts             # Decay logic
│   │   │   ├── edges.ts             # Edge maintenance
│   │   │   ├── patterns.ts          # Pattern detection
│   │   │   └── research.ts          # Active research
│   │   ├── context/
│   │   │   ├── index.ts             # Context injection
│   │   │   ├── profiles.ts          # Profile management
│   │   │   └── ranking.ts           # Memory ranking
│   │   ├── summaries/
│   │   │   └── index.ts             # Living summary updates
│   │   └── sessions/
│   │       └── index.ts             # Session management
│   ├── api/
│   │   ├── server.ts                # Express server
│   │   └── routes/
│   │       ├── memories.ts
│   │       ├── entities.ts
│   │       ├── context.ts
│   │       ├── sessions.ts
│   │       └── consolidate.ts
│   └── utils/
│       ├── embeddings.ts            # Embedding utilities
│       └── tokens.ts                # Token counting
├── data/
│   └── objects/                     # Object storage
├── tests/
│   └── ...
├── package.json
├── tsconfig.json
└── CLAUDE.md                        # AI instructions
```

---

# PART 14: SUCCESS CRITERIA

## MVP Success (Phase 1)

- [ ] Can store memories with salience scores
- [ ] Can retrieve memories by semantic search
- [ ] Salience affects retrieval ranking
- [ ] Basic emotional tagging works
- [ ] CLI is functional

## Full Vision Success

- [ ] Context injection works - AI "wakes up" informed
- [ ] Graph queries work - "what's related to X?"
- [ ] Consolidation runs per-session
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

# APPENDIX A: Keymaker Patterns Carried Forward

1. **Provider Factory**: Groq for generation, Ollama for embeddings
2. **Observations Pattern**: Immutable input layer
3. **Living Summaries**: Incremental updates at write-time
4. **Entity Extraction**: People, projects, commitments, beliefs
5. **Consolidation Concept**: Periodic "sleep" processing
6. **TypeScript + PostgreSQL + pgvector**: Proven stack

# APPENDIX B: Keymaker Gaps Addressed

1. **No Salience** → Squire has per-memory salience scoring
2. **No Per-Memory Emotions** → Squire tags emotions on each memory
3. **No Graph Structure** → Squire has edges table for relationships
4. **No Context Injection** → Squire has profiles and injection pipeline
5. **Passive Consolidation** → Squire has active research during consolidation
6. **All Equal** → Squire differentiates what matters

---

**Document Status**: Ready for SIRK iteration
**Next Steps**: Run through SIRK method to refine architecture, identify edge cases, find creative solutions

*This is Day 1. December 25, 2025. The birth of AI memory.*
