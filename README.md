# Squire

**AI memory that knows the user**

Squire inverts the traditional approach to personal data. Instead of storing data about you for later retrieval, Squire gives AI genuine memory. The AI *knows* you—your patterns, priorities, relationships, and goals. Every conversation starts with context, not cold.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white)
![Status](https://img.shields.io/badge/Status-Active_Development-yellow)

---

## The Problem with AI Memory

Current AI assistants are amnesiacs. Every conversation starts from zero—they don't remember:
- What you told them yesterday
- The decision you made and why
- Who Sarah is (your cofounder, not your sister)
- That you work best in the morning but hate Mondays

RAG-style retrieval helps, but it just returns the top-N similar documents. It doesn't *understand*.

## The Squire Approach

Squire is structured like human memory:

**Daytime (Active)** — Memories flow in from multiple sources. Each receives a salience score (how important?) and emotional tags. Entities are extracted. Beliefs are identified.

**Sleep (Consolidation)** — Periodic processing strengthens important memories, decays trivial ones, forms connections between concepts, and generates insights.

**Morning (Context)** — Before any AI conversation, relevant context is injected. The AI "wakes up" informed about you—your recent commitments, ongoing projects, relationship dynamics.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         INPUT LAYER                              │
│   Chat │ Voice │ Notes │ Calendar │ Documents │ API             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       INGESTION LAYER                            │
├──────────────────────────────────────────────────────────────────┤
│  Embedding Generation    │  Salience Scoring                     │
│  └── OpenAI/Local        │  └── Temporal, Relationship, Action   │
│                          │  └── Self-reference, Explicit marking │
│  Entity Extraction       │                                       │
│  └── People, Places      │  Belief Extraction                    │
│  └── Projects, Orgs      │  └── Values, Preferences              │
│                          │  └── Self-knowledge, Predictions      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      KNOWLEDGE LAYER                             │
├──────────────────────────────────────────────────────────────────┤
│  Memories               │  Living Summaries                      │
│  └── Raw observations   │  └── Auto-updating category summaries  │
│  └── Semantic vectors   │                                        │
│                         │  Patterns                              │
│  Entity Graph           │  └── Recurring behaviors               │
│  └── Relationships      │  └── Temporal patterns                 │
│  └── Co-occurrences     │                                        │
│                         │  Insights                              │
│  Beliefs                │  └── LLM-generated observations        │
│  └── Evidence tracking  │  └── Priority-ranked                   │
│  └── Conflict detection │                                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       OUTPUT LAYER                               │
├──────────────────────────────────────────────────────────────────┤
│  Story Engine               │  Context Injection                 │
│  └── "Generate Not Retrieve"│  └── Profile-based (work/personal) │
│  └── Biographical narratives│  └── Token-budgeted                │
│  └── Graph traversal        │  └── Disclosure logging            │
│                             │                                    │
│  REST API (18+ endpoints)   │  WebSocket (real-time)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Innovations

### Story Engine: "Generate Not Retrieve"

Unlike RAG, which returns top-N similar chunks, the Story Engine:
1. Understands the *intent* behind your question
2. Traverses the memory graph to gather evidence
3. Synthesizes a coherent narrative from multiple sources

Ask "What happened on my birthday last year?" and get a story, not a list of documents.

### Salience-First Design

Not all memories are equal. Squire scores every memory on:

| Factor | Weight | Signal |
|--------|--------|--------|
| Temporal relevance | 20% | Deadlines, dates, time-sensitivity |
| Relationships | 20% | People mentioned, social context |
| Action language | 20% | Decisions, commitments, changes |
| Explicit marking | 15% | "Important", "remember", "don't forget" |
| Self-reference | 15% | Identity, feelings, personal growth |
| Length/complexity | 10% | Detail richness |

High-salience memories float to the top. Low-salience fades over time.

### Belief Extraction & Tracking

Squire extracts persistent beliefs from your memories:

- **Values**: "I value honesty over diplomacy"
- **Preferences**: "I prefer morning meetings"
- **Self-knowledge**: "I work best under pressure"
- **Predictions**: "This project will succeed because..."
- **About people**: "Sarah is reliable under pressure"

Beliefs accumulate evidence. Conflicts are detected. Confidence scores update as evidence strengthens or contradicts.

### Memory Village (3D Visualization)

A WebGL-powered medieval village where memories become buildings:

- **Taverns** (pink): Social memories—friends, family, conversations
- **Libraries** (blue): Learning—books, courses, discoveries
- **Blacksmiths** (orange): Work—projects, deadlines, code
- **Churches** (violet): Reflection—journaling, goals, insights

Click a building to see light beams connecting related memories. Entities appear as villagers walking the streets.

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL with pgvector extension
- OpenAI API key (for embeddings and LLM)

### Setup

```bash
git clone https://github.com/RidgetopAi/squire.git
cd squire

# Install dependencies
npm install
cd web && pnpm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with your database and API credentials

# Start PostgreSQL
docker compose up -d

# Run migrations
npm run db:migrate

# Start API server
npm run dev:api      # Terminal 1 (http://localhost:4000)

# Start web UI
npm run dev:web      # Terminal 2 (http://localhost:3000)
```

### CLI Usage

```bash
# Store a memory
npx squire observe "Had a great call with Sarah about the Q1 roadmap. She's excited about the AI features."

# Search memories
npx squire search "roadmap discussions"

# Generate context for AI
npx squire context --profile work --query "project planning"

# View beliefs
npx squire beliefs list

# Explore the entity graph
npx squire graph neighbors "Sarah"
```

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Backend | TypeScript, Node.js | Core services |
| Database | PostgreSQL + pgvector | Memory storage, vector search |
| Web UI | Next.js, React | Dashboard and visualization |
| 3D | Three.js / WebGL | Memory Village visualization |
| API | Express + Socket.IO | REST + real-time updates |
| Documents | pdf-parse, mammoth, Tesseract.js | PDF, DOCX, OCR processing |
| Calendar | Google Calendar API | External memory source |
| Embeddings | OpenAI / local | Semantic vectors |

---

## Database Schema

32 migrations defining:

- **raw_observations** — Immutable input records
- **memories** — Processed memories with embeddings and salience
- **entities** — People, places, projects, organizations
- **entity_mentions** — Links between memories and entities
- **memory_edges** — Graph connections (similar, temporal, causal)
- **living_summaries** — Auto-updating category summaries
- **beliefs** — Extracted beliefs with evidence chains
- **patterns** — Recurring behavioral patterns
- **insights** — AI-generated observations
- **active_research** — Gaps and questions to explore
- **commitments** — Tracked promises and obligations
- **notes / lists** — Structured knowledge
- **document_chunks** — Processed document segments

---

## API Endpoints

| Route | Purpose |
|-------|---------|
| `/api/memories` | CRUD for memories, search, bulk operations |
| `/api/context` | Generate context packets for AI injection |
| `/api/entities` | Entity management and graph queries |
| `/api/beliefs` | Belief extraction, evidence, conflicts |
| `/api/patterns` | Pattern detection and tracking |
| `/api/insights` | AI-generated insights |
| `/api/research` | Gaps, questions, active research |
| `/api/graph` | Graph traversal, neighbors, paths |
| `/api/chat` | Conversational interface |
| `/api/commitments` | Commitment tracking |
| `/api/reminders` | Reminder scheduling |
| `/api/notes` | Note management |
| `/api/lists` | List management |
| `/api/documents` | Document processing |
| `/api/calendar` | Google Calendar integration |
| `/api/identity` | User identity profile |

---

## Project Stats

- **~36,000 lines** of TypeScript
- **32 database migrations**
- **18+ REST API endpoints**
- **15+ web components**
- **3D WebGL visualization**
- **Google Calendar integration**
- **PDF/DOCX/OCR document processing**

---

## Design Philosophy

> **"This is not user memory. This is AI memory that knows the user."**

Traditional systems store data about users for later retrieval. Squire inverts this: the AI becomes the entity with memory. The AI knows its human partner—their patterns, priorities, emotional landscape, relationships, and goals.

### Core Principles

1. **AI-Agnostic** — Memory layer any AI can tap into (Claude, GPT, local models)
2. **Local-First** — All core features work offline; cloud is backup, not compute
3. **Salience-First** — Importance drives everything; not all memories are equal
4. **Graph-Structured** — Relationships between concepts, not flat storage
5. **Single Human** — One AI ↔ One Human; no multi-tenancy complexity

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Ensure TypeScript compiles (`npm run typecheck`)
4. Run tests (`npm test`)
5. Submit a pull request

---

## License

MIT License — See [LICENSE](LICENSE) for details.

---

Built by [RidgetopAI](https://github.com/RidgetopAi) — giving AI the memory it deserves.
