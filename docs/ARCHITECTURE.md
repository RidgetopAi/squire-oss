# Architecture

This document describes Squire's internal architecture for contributors and power users who want to understand how the system works.

---

## System Overview

Squire is a three-layer system: **ingestion** processes incoming information, the **knowledge layer** stores and connects it, and the **output layer** surfaces it when needed.

```
┌────────────────────────────────────────────────────────────┐
│                       INPUT SOURCES                        │
│   Chat │ CLI │ Notes │ Calendar │ Documents │ Telegram     │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│                    INGESTION LAYER                          │
│                                                            │
│   Embedding Generation ──── Salience Scoring               │
│   Entity Extraction    ──── Belief Extraction              │
│   Category Classification    Chat Extraction               │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE LAYER                          │
│                                                            │
│   Memories ──────── Entity Graph ──────── Beliefs          │
│   Memory Edges ──── Living Summaries ──── Patterns         │
│   Insights ──────── Research Gaps ──────── Commitments     │
│   Notes ─────────── Lists ────────────── Documents         │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│                     OUTPUT LAYER                            │
│                                                            │
│   Story Engine ─── Context Injection ─── Enhanced Recall   │
│   REST API (25 endpoints) ─── Socket.IO (real-time)        │
│   CLI (50+ commands) ─── Web UI (Next.js)                  │
└────────────────────────────────────────────────────────────┘
```

---

## Ingestion Pipeline

When a memory enters Squire — whether from a chat message, CLI observation, document upload, or calendar sync — it passes through several processing stages.

### 1. Raw Observation

The input is stored as an immutable `raw_observation` record. This is the original, unprocessed text — never modified after creation.

### 2. Embedding Generation

The text is converted to a vector using the configured embedding provider (Ollama or OpenAI). This vector enables semantic similarity search across all memories.

**Service:** `src/providers/embeddings.ts`

### 3. Salience Scoring

Every memory receives a salience score (0.0–1.0) that determines its importance. The score is a weighted combination of six factors:

| Factor | Weight | Signal |
|--------|--------|--------|
| Temporal relevance | 20% | Dates, deadlines, time-sensitivity |
| Relationships | 20% | People mentioned, social context |
| Action language | 20% | Decisions, commitments, changes |
| Explicit marking | 15% | "Remember this", "important", "don't forget" |
| Self-reference | 15% | Identity, feelings, personal growth |
| Length/complexity | 10% | Detail richness |

High-salience memories are prioritized in recall and context generation. Low-salience memories decay over time during consolidation.

**Service:** `src/services/salience.ts`

### 4. Entity Extraction

The LLM identifies entities mentioned in the memory — people, places, projects, organizations. These become nodes in the entity graph, connected to the memory via `entity_mentions`.

**Service:** `src/services/entities.ts`

### 5. Belief Extraction

The LLM extracts persistent beliefs: values, preferences, self-knowledge, predictions, and assessments of others. Each belief accumulates evidence over time. When conflicting beliefs are detected, they're flagged.

**Service:** `src/services/beliefs.ts`

### 6. Category Classification

Memories are classified into categories (work, social, health, learning, etc.) which feed into living summaries — auto-updating paragraph-length summaries for each category.

**Service:** `src/services/summaries.ts`

### 7. Chat Extraction

For conversational inputs, additional extraction identifies commitments, action items, and follow-up questions embedded in the conversation.

**Service:** `src/services/chatExtraction.ts`

---

## Knowledge Layer

### Memory Storage

Memories are stored in PostgreSQL with pgvector. Each memory record includes:

- Raw text content
- Embedding vector (for semantic search)
- Salience score
- Source type (chat, observation, document, calendar, etc.)
- Category tags
- Timestamps (created, last accessed)
- Decay factor (modified by consolidation)

**Table:** `memories`
**Service:** `src/services/memories.ts`

### Entity Graph

Entities (people, places, projects, organizations) form a knowledge graph. The graph tracks:

- **Entity nodes** — who/what exists in the user's world
- **Entity mentions** — which memories reference which entities
- **Co-occurrences** — which entities appear together frequently
- **Relationships** — typed connections between entities (e.g., "works with", "friend of")

**Tables:** `entities`, `entity_mentions`
**Services:** `src/services/entities.ts`, `src/services/graph.ts`, `src/services/memoryGraph.ts`

### Memory Edges

Memories are connected by typed edges:

- **Similar** — semantically related (via embedding distance)
- **Temporal** — close in time
- **Causal** — one event led to another
- **Contradicts** — conflicting information

These edges power graph traversal in the Story Engine.

**Table:** `memory_edges`
**Service:** `src/services/edges.ts`

### Living Summaries

Auto-updating summaries for each memory category. When a new memory is classified into a category, the summary for that category is regenerated to incorporate the new information. This gives the system a continuously-current "understanding" of each area of your life.

**Table:** `living_summaries`
**Service:** `src/services/summaries.ts`

### Beliefs

Extracted beliefs with evidence tracking:

- Each belief has a type (value, preference, self-knowledge, prediction, about_person, about_project)
- Evidence chain links back to the memories that support or contradict the belief
- Confidence score adjusts as evidence accumulates
- Conflict detection flags contradictory beliefs

**Table:** `beliefs`
**Service:** `src/services/beliefs.ts`

### Patterns

Recurring behavioral patterns detected through consolidation:

- Temporal patterns (daily routines, weekly rhythms)
- Behavioral patterns (how you respond to stress, what triggers productivity)
- Relationship patterns (communication styles with different people)

**Table:** `patterns`
**Service:** `src/services/patterns.ts`

### Insights

AI-generated observations about the user, produced during consolidation. These are higher-order conclusions drawn from patterns, beliefs, and memory clusters.

**Table:** `insights`
**Service:** `src/services/insights.ts`

---

## Output Layer

### Enhanced Recall

The retrieval pipeline that finds relevant memories for a given query. It goes beyond simple vector search:

1. **Vector search** — find semantically similar memories via pgvector
2. **BM25/keyword search** — catch keyword matches that embedding similarity misses
3. **Graph expansion** — follow memory edges to find related context
4. **IDF weighting** — boost rare, informative terms
5. **Recency weighting** — prefer recent memories when relevance is similar
6. **LLM reranking** (optional) — a second LLM pass scores candidates for true relevance

**Service:** `src/services/enhancedRecall.ts`

### Story Engine

The Story Engine is Squire's primary output mechanism. Instead of returning a list of matching documents (RAG-style), it:

1. **Analyzes intent** — what is the user actually asking? (factual recall, narrative, comparison, etc.)
2. **Gathers evidence** — retrieves relevant memories, traverses the entity graph, pulls beliefs and summaries
3. **Synthesizes a narrative** — the LLM generates a coherent response grounded in the gathered evidence

This means asking "What happened with the product launch?" produces a story, not a list of database rows.

**Services:** `src/services/storyEngine.ts`, `src/services/storyIntent.ts`, `src/services/storyCache.ts`

### Context Injection

Generates a context packet for injecting into any AI conversation. The packet includes:

- User identity and profile
- Relevant living summaries
- Recent high-salience memories
- Active beliefs
- Pending commitments

Context is token-budgeted — it fits within a configurable token limit so it can be prepended to any LLM system prompt.

**Service:** `src/services/context.ts`

---

## Consolidation

Consolidation is Squire's equivalent of sleep. It runs periodically (or manually via `npx squire consolidate`) and performs:

1. **Reinforcement** — memories that have been accessed or referenced get their salience boosted
2. **Decay** — old, unreinforced, low-salience memories fade
3. **Edge discovery** — new connections between memories are identified via embedding similarity
4. **Pattern detection** — recurring behaviors and temporal patterns are extracted
5. **Insight generation** — the LLM produces higher-order observations from clusters of related memories
6. **Summary updates** — living summaries are regenerated for categories with new content

**Service:** `src/services/consolidation.ts`, `src/services/reinforcement.ts`

---

## Database Schema

The schema is managed through 47 sequential migration files in `schema/`. Key tables:

| Migration | Table | Purpose |
|-----------|-------|---------|
| 001 | — | pgvector extension |
| 002 | `raw_observations` | Immutable input records |
| 003 | `memories` | Processed memories with salience |
| 004 | — | Embedding indexes |
| 005 | `context_profiles` | Context generation profiles |
| 006 | `disclosure_log` | What context was shared and when |
| 007 | `entities` | People, places, projects, orgs |
| 008 | `entity_mentions` | Memory ↔ entity links |
| 009 | `sessions` | Chat sessions |
| 010 | `memory_edges` | Graph connections between memories |
| 011 | `living_summaries` | Auto-updating category summaries |
| 012 | `beliefs` | Extracted beliefs with evidence |
| 013 | `patterns` | Recurring patterns |
| 014 | `insights` | AI-generated observations |
| 015 | `active_research` | Knowledge gaps and questions |
| 016 | `objects` | Custom objects and collections |
| 017 | `chat_messages` | Chat persistence |
| 018 | `commitments` | Tracked promises |
| 019 | `reminders` | Scheduled reminders |
| 020+ | Various | Notes, lists, documents, calendar, goals, etc. |

Migrations run in order via `npm run db:migrate`. They are idempotent — safe to run multiple times.

---

## API Server

The API server (`src/api/server.ts`) is an Express application with Socket.IO for real-time events.

### REST API

25 route modules registered under `/api/`:

- Core: `memories`, `context`, `entities`, `graph`, `beliefs`, `patterns`, `insights`, `research`
- Data: `notes`, `lists`, `commitments`, `reminders`, `documents`, `objects`
- Chat: `chat` (persistence), Socket.IO handlers (real-time streaming)
- Integrations: `integrations/google`, `calendar`, `notifications`
- System: `health`, `identity`, `tools`, `tts`, `saved-cards`

### Socket.IO

Real-time bidirectional communication for:

- Streaming chat responses (token-by-token)
- Memory creation/update notifications
- Tool execution progress
- Entity graph changes

### Startup Sequence

On server start:

1. Express middleware initialization (JSON parsing, CORS)
2. Socket.IO attachment with mobile-friendly timeouts
3. Route registration (25 modules)
4. Identity migration check
5. Reminder scheduler start
6. Google Calendar sync (if configured)
7. Telegram poller (if configured)
8. Courier service (if enabled)
9. Commune scheduler (if enabled)

---

## CLI

The CLI (`src/cli.ts`) provides 50+ commands covering every Squire feature. Commands are grouped:

- **Memory:** `observe`, `list`, `search`, `count`, `get`
- **Knowledge:** `context`, `summaries`, `beliefs`, `patterns`, `insights`, `research`
- **Graph:** `entities`, `graph neighbors`, `graph paths`
- **Data:** `notes`, `lists`, `commitments`, `reminders`, `documents`
- **System:** `health`, `setup`, `consolidate`, `identity`, `import`
- **Integrations:** `google auth`, `google status`

---

## Web Frontend

The frontend (`web/`) is a Next.js 16 application with React 19.

### Key Technologies

- **State management:** Zustand + TanStack React Query
- **Real-time:** Socket.IO client
- **3D visualization:** Three.js via react-three-fiber
- **Graph visualization:** react-force-graph-2d
- **Styling:** Tailwind CSS 4
- **Animation:** Framer Motion

### Pages

| Route | Feature |
|-------|---------|
| `/app/dashboard` | Overview of recent activity, beliefs, entities |
| `/app/chat` | Conversational interface with memory context |
| `/app/timeline` | Chronological memory view |
| `/app/graph` | Interactive entity relationship visualization |
| `/app/village` | 3D Memory Village (WebGL) |
| `/app/notes` | Note editor |
| `/app/lists` | To-do list management |
| `/app/commitments` | Commitment tracker |
| `/app/reminders` | Reminder dashboard |
| `/app/documents` | Document upload and processing |
| `/app/calendar` | Calendar integration view |
| `/app/settings` | Integrations and preferences |

---

## Provider Abstraction

Squire abstracts both LLM and embedding providers behind interfaces, so you can swap providers without changing application code.

### LLM Providers

`src/providers/llm.ts` wraps five providers behind a common interface:

- **Anthropic** — Claude models via the Anthropic API
- **Groq** — Fast inference (Llama, Mixtral) via OpenAI-compatible API
- **xAI** — Grok models via OpenAI-compatible API
- **Gemini** — Google models via OpenAI-compatible API
- **Ollama** — Local models via OpenAI-compatible API

### Embedding Providers

`src/providers/embeddings.ts` wraps two providers:

- **Ollama** — Local models (nomic-embed-text, mxbai-embed-large)
- **OpenAI** — Cloud models (text-embedding-3-small, text-embedding-3-large)

### Model Routing

When routing is enabled, Squire maintains two LLM tiers:

- **Smart tier** — complex reasoning tasks (belief extraction, story generation, chat)
- **Fast tier** — simple tasks (classification, entity extraction, salience scoring)

This lets you use a capable but expensive model for important tasks and a cheap/fast model for routine processing.

---

## Directory Structure

```
squire-oss/
├── src/
│   ├── api/
│   │   ├── routes/         # 25 REST endpoint modules
│   │   ├── socket/         # Socket.IO event handlers
│   │   └── server.ts       # Express app initialization
│   ├── cli/
│   │   └── setup.ts        # Interactive onboarding wizard
│   ├── cli.ts              # CLI command definitions
│   ├── config/
│   │   └── index.ts        # Environment variable configuration
│   ├── constants/
│   │   └── prompts.ts      # LLM prompt templates
│   ├── db/
│   │   ├── index.ts        # Database connection pool
│   │   └── migrate.ts      # Migration runner
│   ├── providers/
│   │   ├── llm.ts          # LLM provider abstraction
│   │   └── embeddings.ts   # Embedding provider abstraction
│   ├── services/           # ~45 service modules (core logic)
│   └── tools/              # LLM tool definitions
├── schema/                 # 47 SQL migration files
├── web/                    # Next.js frontend
├── tests/                  # Test suite
├── scripts/                # Build and deployment scripts
└── docker-compose.yml      # Development infrastructure
```
