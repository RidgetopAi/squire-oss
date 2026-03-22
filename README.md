# Squire

**AI memory that actually knows you.**

Squire gives your AI assistant persistent, structured memory. Instead of starting every conversation from zero, the AI wakes up knowing your patterns, priorities, relationships, and goals — because Squire remembers them.

It works like human memory: experiences flow in during the day, consolidation strengthens what matters overnight, and relevant context surfaces when needed. The result is an AI that doesn't just retrieve documents — it *understands* you.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Why Squire?

Most AI assistants are amnesiacs. Every conversation starts from scratch. RAG helps — but returning the top-N similar documents isn't the same as understanding someone.

Squire takes a different approach:

- **Memories are scored by importance** — not all information is equal. A life decision matters more than what you had for lunch.
- **Beliefs are extracted and tracked** — "I work best in the morning" accumulates evidence over time, and conflicts are detected.
- **Entities form a knowledge graph** — people, projects, places, and the relationships between them.
- **Consolidation runs like sleep** — strengthening important memories, decaying trivial ones, and generating insights.
- **Context is generated, not retrieved** — the Story Engine synthesizes narratives from multiple memory sources instead of dumping raw chunks.

The AI doesn't search your data. It *knows* you.

---

## Quick Start

### Option A: Interactive Setup (recommended)

```bash
git clone https://github.com/RidgetopAi/squire-oss.git
cd squire-oss
npm install

npx tsx src/cli.ts setup
```

The setup wizard walks you through everything: database, LLM provider, embedding provider, your identity, and initial memories. It takes about 5 minutes.

### Option B: Manual Setup

**1. Clone and install**

```bash
git clone https://github.com/RidgetopAi/squire-oss.git
cd squire-oss
npm install
```

**2. Start PostgreSQL** (requires Docker)

```bash
docker compose up -d
```

This starts PostgreSQL 16 with pgvector on port 5435.

**3. Configure environment**

```bash
cp .env.example .env
```

Edit `.env` with your settings. At minimum you need:

```bash
# Database (default works with the Docker container above)
DATABASE_URL=postgresql://squire:squire_dev@localhost:5435/squire

# LLM — pick one provider
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Embeddings — Ollama (free, local) or OpenAI
EMBED_PROVIDER=ollama
EMBED_MODEL=nomic-embed-text
EMBED_DIMENSION=768
```

If using Ollama for embeddings, [install Ollama](https://ollama.com) and pull the model:

```bash
ollama pull nomic-embed-text
```

If using OpenAI for embeddings instead:

```bash
EMBED_PROVIDER=openai
EMBED_MODEL=text-embedding-3-small
EMBED_DIMENSION=1536
OPENAI_API_KEY=sk-...
```

**4. Run database migrations**

```bash
npm run db:migrate
```

**5. Start the server**

```bash
# API server (http://localhost:3000)
npm run dev:api
```

**6. Start the web UI** (optional, separate terminal)

```bash
cd web && pnpm install && cd ..
npm run dev:web
# Opens at http://localhost:3001
```

### Option C: Full Docker Stack

Uncomment the `api`, `web`, and optionally `ollama` services in `docker-compose.yml`, then:

```bash
cp .env.example .env
# Edit .env with your API keys

docker compose up -d
```

This runs everything in containers: PostgreSQL, API server, web frontend, and optionally Ollama.

---

## How It Works

```
 YOU ──── Chat, Notes, Voice, Calendar, Documents ────┐
                                                       ▼
                                              ┌─────────────────┐
                                              │    INGESTION     │
                                              │                  │
                                              │  Embeddings      │
                                              │  Salience Score  │
                                              │  Entity Extract  │
                                              │  Belief Extract  │
                                              └────────┬─────────┘
                                                       ▼
                                              ┌─────────────────┐
                                              │    KNOWLEDGE     │
                                              │                  │
                                              │  Memories        │
                                              │  Entity Graph    │
                                              │  Beliefs         │
                                              │  Patterns        │
                                              │  Summaries       │
                                              │  Insights        │
                                              └────────┬─────────┘
                                                       ▼
                                              ┌─────────────────┐
                                              │     OUTPUT       │
                                              │                  │
                                              │  Story Engine    │
                                              │  Context Inject  │
                                              │  REST API        │
                                              │  WebSocket       │
                                              └──────────────────┘
```

**Ingestion** — Every input gets an embedding vector, a salience score (how important is this?), entity extraction (who and what is mentioned?), and belief extraction (what does this reveal about you?).

**Knowledge** — Memories live in a PostgreSQL database with pgvector. They're connected by a graph of relationships — similarity, temporal proximity, causation. Living summaries auto-update as new information arrives. Patterns and insights emerge from consolidation.

**Output** — The Story Engine generates coherent narratives from the memory graph (not just top-N retrieval). Context injection provides any AI with a profile-based briefing before a conversation starts.

For a deeper technical walkthrough, see [ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Using Squire

### Web UI

The web dashboard at `http://localhost:3001` provides:

- **Chat** — Conversational interface with full memory context
- **Dashboard** — Overview of recent memories, beliefs, and activity
- **Timeline** — Chronological view of all memories
- **Graph** — Interactive entity relationship visualization
- **Memory Village** — 3D WebGL visualization where memories become buildings in a medieval village
- **Notes & Lists** — Structured knowledge management
- **Commitments & Reminders** — Track promises and schedule reminders
- **Documents** — Upload and process PDFs, DOCX, images (OCR)
- **Calendar** — Google Calendar integration view
- **Settings** — Manage integrations and preferences

### CLI

```bash
# Store a memory
npx squire observe "Had coffee with Sarah. She's leaving her job next month — thinking about starting a consultancy."

# Search memories
npx squire search "Sarah's career plans"

# Generate context for an AI conversation
npx squire context --profile work --query "project planning"

# View what Squire believes about you
npx squire beliefs list

# Explore the entity graph
npx squire graph neighbors "Sarah"

# Check system health
npx squire health

# Run memory consolidation manually
npx squire consolidate

# View living summaries
npx squire summaries

# Set your identity
npx squire identity set --name "Your Name"
```

### REST API

The API server exposes 25 endpoints. Key ones:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/memories` | Store a new memory |
| `GET /api/memories/search?q=...` | Semantic memory search |
| `POST /api/context` | Generate context for AI injection |
| `GET /api/entities` | List known entities (people, projects, etc.) |
| `GET /api/beliefs` | View extracted beliefs |
| `GET /api/graph/neighbors/:id` | Traverse the entity graph |
| `POST /api/chat` | Send a message with memory-aware context |
| `GET /api/health` | Server health check |

Real-time updates are available via Socket.IO on the same port.

---

## Key Concepts

### Salience Scoring

Not all memories are equal. Every memory is scored on:

| Factor | Weight | What it measures |
|--------|--------|------------------|
| Temporal relevance | 20% | Deadlines, dates, time-sensitivity |
| Relationships | 20% | People mentioned, social context |
| Action language | 20% | Decisions, commitments, changes |
| Explicit marking | 15% | "Important", "remember", "don't forget" |
| Self-reference | 15% | Identity, feelings, personal growth |
| Length/complexity | 10% | Detail richness |

High-salience memories surface first. Low-salience fades over time.

### Belief Extraction

Squire identifies persistent beliefs from your memories:

- **Values** — "I value honesty over diplomacy"
- **Preferences** — "I prefer morning meetings"
- **Self-knowledge** — "I work best under pressure"
- **About people** — "Sarah is reliable under pressure"
- **Predictions** — "This project will succeed because..."

Beliefs accumulate evidence over time. Conflicting beliefs are detected and flagged. Confidence scores adjust as evidence strengthens or contradicts.

### Story Engine

Traditional RAG returns the top-N similar chunks. The Story Engine does something different:

1. Understands the *intent* behind the query
2. Traverses the memory graph to gather relevant evidence
3. Synthesizes a coherent narrative from multiple sources

Ask "What happened on my birthday last year?" and get a story, not a list of database rows.

### Memory Consolidation

Like human sleep, consolidation periodically:

- Strengthens frequently-reinforced memories
- Decays unused, low-salience memories
- Finds connections between concepts
- Generates insights from patterns
- Updates living summaries

Run it manually with `npx squire consolidate` or let it run on a schedule.

### Memory Village

A WebGL-powered 3D visualization where your memories become buildings in a medieval village:

- **Taverns** (pink) — Social memories: friends, family, conversations
- **Libraries** (blue) — Learning: books, courses, discoveries
- **Blacksmiths** (orange) — Work: projects, deadlines, code
- **Churches** (violet) — Reflection: journaling, goals, insights

Click a building to see light beams connecting related memories. Entities appear as villagers walking the streets.

---

## Configuration

Squire is configured entirely through environment variables in `.env`. See [CONFIGURATION.md](docs/CONFIGURATION.md) for the complete reference.

### LLM Providers

| Provider | Config | Notes |
|----------|--------|-------|
| Anthropic Claude | `LLM_PROVIDER=anthropic` | Recommended. Requires `ANTHROPIC_API_KEY` |
| Groq | `LLM_PROVIDER=groq` | Fast inference. Requires `GROQ_API_KEY` |
| xAI Grok | `LLM_PROVIDER=xai` | Requires `XAI_API_KEY` |
| Google Gemini | `LLM_PROVIDER=gemini` | Requires `GEMINI_API_KEY` |
| Ollama | `LLM_PROVIDER=ollama` | Free, local. Requires [Ollama](https://ollama.com) running |

### Embedding Providers

| Provider | Config | Notes |
|----------|--------|-------|
| Ollama | `EMBED_PROVIDER=ollama` | Free, local, private. Default. |
| OpenAI | `EMBED_PROVIDER=openai` | Easy setup. Requires `OPENAI_API_KEY` |

### Optional Integrations

All integrations are off by default and gracefully skip when unconfigured:

- **Google Calendar** — Sync events as memories. See [INTEGRATIONS.md](docs/INTEGRATIONS.md)
- **Telegram** — Chat with Squire via Telegram bot
- **Courier** — Proactive task reminders (opt-in via `COURIER_ENABLED=true`)
- **Commune** — Multi-agent coordination (opt-in via `COMMUNE_ENABLED=true`)
- **Goal Worker** — Autonomous goal execution (opt-in via `GOAL_WORKER_ENABLED=true`)

---

## Project Structure

```
squire-oss/
├── src/
│   ├── api/           # Express server, routes, Socket.IO handlers
│   ├── cli/           # CLI setup wizard
│   ├── cli.ts         # CLI command definitions (50+ commands)
│   ├── config/        # Environment variable configuration
│   ├── constants/     # LLM prompt templates
│   ├── db/            # Database connection and migration runner
│   ├── providers/     # LLM and embedding provider wrappers
│   ├── services/      # Core business logic (100+ modules)
│   └── tools/         # LLM tool definitions for function calling
├── schema/            # 47 PostgreSQL migration files
├── web/               # Next.js frontend (React 19, Three.js, TanStack Query)
├── tests/             # Test suite
├── docker-compose.yml # PostgreSQL + optional full stack
├── Dockerfile         # API server container
└── web/Dockerfile     # Frontend container
```

---

## Database

Squire uses PostgreSQL with the pgvector extension for semantic vector search. The schema is managed through 47 migration files in `schema/`.

Key tables:

| Table | Purpose |
|-------|---------|
| `raw_observations` | Immutable input records |
| `memories` | Processed memories with embeddings and salience scores |
| `entities` | People, places, projects, organizations |
| `entity_mentions` | Links between memories and entities |
| `memory_edges` | Graph connections (similar, temporal, causal) |
| `living_summaries` | Auto-updating category summaries |
| `beliefs` | Extracted beliefs with evidence chains |
| `patterns` | Recurring behavioral patterns |
| `insights` | AI-generated observations |
| `commitments` | Tracked promises and obligations |
| `notes` | Structured notes linked to entities |
| `document_chunks` | Processed document segments with embeddings |

---

## Development

```bash
# Type checking
npm run typecheck          # Backend
npm run typecheck:web      # Frontend

# Run tests
npm test

# Build for production
npm run build              # Backend (TypeScript → dist/)
npm run build:web          # Frontend (Next.js build)

# Development servers (with hot reload)
npm run dev:api            # API on http://localhost:3000
npm run dev:web            # Web on http://localhost:3001
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Ensure TypeScript compiles: `npm run typecheck`
5. Run tests: `npm test`
6. Submit a pull request

---

## License

MIT License — see [LICENSE](LICENSE) for details.

Built by [RidgetopAI](https://github.com/RidgetopAi). Open source under MIT.
