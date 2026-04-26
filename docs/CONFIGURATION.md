# Configuration Reference

Squire is configured through environment variables defined in a `.env` file at the project root. Copy `.env.example` to get started:

```bash
cp .env.example .env
```

This document covers every configuration option, organized by category.

---

## Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string. Must point to a database with the pgvector extension installed. |

**Example:**

```bash
# Local Docker (from docker-compose.yml)
DATABASE_URL=postgresql://squire:squire_dev@localhost:5435/squire

# Custom PostgreSQL
DATABASE_URL=postgresql://user:password@db.example.com:5432/squire
```

The database must have pgvector installed. The Docker Compose setup handles this automatically using the `pgvector/pgvector:pg16` image.

---

## Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Port the API server listens on. |
| `CORS_ORIGIN` | No | `http://localhost:3001` | Allowed CORS origin for the web frontend. |

---

## Embedding Provider

Squire needs an embedding provider to convert text into semantic vectors for similarity search.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMBED_PROVIDER` | No | `ollama` | Provider: `ollama` or `openai`. |
| `EMBED_MODEL` | No | `nomic-embed-text` | Model name for embedding generation. |
| `EMBED_DIMENSION` | No | `768` | Vector dimension. Must match the model's output dimension. |
| `OLLAMA_URL` | No | `http://localhost:11434` | Ollama server URL. Used when `EMBED_PROVIDER=ollama`. |
| `OPENAI_API_KEY` | When using OpenAI | — | OpenAI API key. Used when `EMBED_PROVIDER=openai`. |
| `OPENAI_URL` | No | `https://api.openai.com/v1` | OpenAI-compatible API base URL. Override for proxies or alternative providers. |

### Ollama (default — free, local, private)

```bash
EMBED_PROVIDER=ollama
EMBED_MODEL=nomic-embed-text
EMBED_DIMENSION=768
OLLAMA_URL=http://localhost:11434
```

Install [Ollama](https://ollama.com) and pull the model:

```bash
ollama pull nomic-embed-text
```

Alternative local models:

| Model | Dimensions | Notes |
|-------|-----------|-------|
| `nomic-embed-text` | 768 | Recommended. Good quality, fast. |
| `mxbai-embed-large` | 1024 | Higher quality, larger vectors. |

### OpenAI

```bash
EMBED_PROVIDER=openai
EMBED_MODEL=text-embedding-3-small
EMBED_DIMENSION=1536
OPENAI_API_KEY=sk-...
```

| Model | Dimensions | Notes |
|-------|-----------|-------|
| `text-embedding-3-small` | 1536 | Recommended. Cheap, good quality. |
| `text-embedding-3-large` | 3072 | Highest quality, higher cost. |

**Important:** Once you start storing memories with a given dimension, changing `EMBED_DIMENSION` requires re-embedding all existing data. Choose your provider before storing significant amounts of data.

---

## LLM Provider

Squire uses an LLM for chat, belief extraction, salience scoring, and other reasoning tasks.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_PROVIDER` | No | `anthropic` | Provider: `anthropic`, `groq`, `xai`, `gemini`, or `ollama`. |
| `LLM_MODEL` | No | `claude-sonnet-4-6` | Model name to use. |
| `LLM_MAX_TOKENS` | No | `8192` | Maximum tokens in LLM responses. |
| `LLM_TEMPERATURE` | No | `0.7` | Sampling temperature (0.0–1.0). |
| `LLM_API_TIMEOUT_MS` | No | `60000` | Request timeout in milliseconds. Increase for slow models or complex tool chains. |

### API Keys (provide the one matching your provider)

| Variable | Provider |
|----------|----------|
| `ANTHROPIC_API_KEY` | Anthropic Claude |
| `GROQ_API_KEY` | Groq |
| `XAI_API_KEY` | xAI Grok |
| `GEMINI_API_KEY` | Google Gemini |

Ollama doesn't need an API key — it runs locally.

### Custom API Endpoints

Override the default API URLs for proxies, self-hosted deployments, or alternative providers:

| Variable | Default |
|----------|---------|
| `ANTHROPIC_URL` | `https://api.anthropic.com` |
| `GROQ_URL` | `https://api.groq.com/openai/v1` |
| `XAI_URL` | `https://api.x.ai/v1` |
| `GEMINI_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |

### Provider Examples

**Anthropic Claude (recommended):**

```bash
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=sk-ant-...
```

**Groq (fast inference):**

```bash
LLM_PROVIDER=groq
LLM_MODEL=llama-3.3-70b-versatile
GROQ_API_KEY=gsk_...
```

**Ollama (free, local):**

```bash
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
# No API key needed — just have Ollama running
```

---

## Model Routing

Squire can route requests to different models based on task complexity. A "smart" tier handles complex reasoning, while a "fast" tier handles simpler tasks.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ROUTING_ENABLED` | No | `true` | Enable model routing. When `false`, all requests go to the primary LLM. |
| `ROUTING_DEFAULT_TIER` | No | `smart` | Default tier: `smart` or `fast`. |
| `ROUTING_SMART_PROVIDER` | No | `anthropic` | Provider for complex tasks. |
| `ROUTING_SMART_MODEL` | No | `claude-sonnet-4-6` | Model for complex tasks. |
| `ROUTING_FAST_PROVIDER` | No | `xai` | Provider for simple tasks. |
| `ROUTING_FAST_MODEL` | No | `grok-4-1-fast-reasoning` | Model for simple tasks. |

If you only want one model, set `ROUTING_ENABLED=false` and configure just the primary LLM settings.

---

## Search Thresholds

Control the minimum similarity score required for search results. Lower values return more results (potentially less relevant). Higher values are stricter.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEARCH_DOCUMENT_THRESHOLD` | No | `0.55` | Minimum similarity for document chunk search. |
| `SEARCH_CONTEXT_THRESHOLD` | No | `0.5` | Minimum similarity for context generation. |
| `SEARCH_NOTES_THRESHOLD` | No | `0.35` | Minimum similarity for note search (lower because notes are short). |

---

## Enhanced Recall

The recall pipeline retrieves relevant memories for context generation. These settings control caching and optional LLM-based reranking.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RECALL_USER_STOPWORDS` | No | — | Comma-separated words to ignore in recall queries (e.g., your name if it appears in every memory). |
| `RECALL_CACHE_TTL_MS` | No | `300000` | Cache TTL for IDF/graph indexes in milliseconds (default: 5 minutes). |
| `RECALL_RERANKER_ENABLED` | No | `false` | Enable LLM-based reranking of recall results. Improves quality but adds latency and cost. |
| `RECALL_RERANKER_PROVIDER` | No | `xai` | LLM provider for reranking: `xai` or `anthropic`. |
| `RECALL_RERANKER_MODEL` | No | `grok-4-1-fast-reasoning` | Model for reranking. |
| `RECALL_RERANKER_POOL` | No | `15` | Number of candidate memories to rerank per query. |

---

## Telegram Integration

Connect Squire to a Telegram bot for chat-based interaction.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | When using Telegram | — | Bot token from [@BotFather](https://t.me/BotFather). |
| `TELEGRAM_ALLOWED_USER_IDS` | When using Telegram | — | Comma-separated Telegram user IDs allowed to interact. Find yours via [@userinfobot](https://t.me/userinfobot). |
| `TELEGRAM_POLLING_INTERVAL_MS` | No | `1000` | How often to poll for new messages (milliseconds). |

See [INTEGRATIONS.md](INTEGRATIONS.md) for full setup instructions.

---

## Google Calendar

Sync Google Calendar events as memories. Requires Google Cloud OAuth credentials.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | When using Calendar | — | OAuth 2.0 client ID from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | When using Calendar | — | OAuth 2.0 client secret. |
| `GOOGLE_REDIRECT_URI` | No | `http://localhost:3000/api/integrations/google/callback` | OAuth callback URL. |

See [INTEGRATIONS.md](INTEGRATIONS.md) for full setup instructions.

---

## Feature Flags

These features are **disabled by default** for new installs. Enable them explicitly when you're ready.

| Variable | Default | Description |
|----------|---------|-------------|
| `COURIER_ENABLED` | `false` | Proactive task scheduler — checks commitments and sends reminders. |
| `COMMUNE_ENABLED` | `false` | Multi-agent proactive outreach — Squire initiates conversations. |
| `GOAL_WORKER_ENABLED` | `false` | Autonomous goal execution — Squire works on goals in the background. |
| `EXPRESSION_EVALUATOR_ENABLED` | `false` | Expression/emotion analysis on memories. |
| `RECALL_RERANKER_ENABLED` | `false` | LLM-based reranking for memory recall (improves quality, adds cost). |
| `ENABLE_EMOTION_TAGGING` | `false` | Tag memories with emotional context. |

---

## Courier (Proactive Reminders)

When enabled, the Courier periodically checks commitments and sends reminders via your configured channel.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COURIER_ENABLED` | No | `false` | Enable the Courier service. |
| `COURIER_INTERVAL_MS` | No | `1800000` | Check interval (default: 30 minutes). |
| `COURIER_QUIET_START` | No | `22` | Quiet hours start (24h format, e.g., 22 = 10pm). |
| `COURIER_QUIET_END` | No | `7` | Quiet hours end (24h format, e.g., 7 = 7am). |
| `COURIER_RETRY_ATTEMPTS` | No | `3` | Retry attempts for failed deliveries. |
| `COURIER_RETRY_DELAY_MS` | No | `15000` | Delay between retries (default: 15 seconds). |

---

## Commune (Proactive Outreach)

When enabled, Squire can initiate conversations — checking in, following up on goals, or sharing insights.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COMMUNE_ENABLED` | No | `false` | Enable proactive outreach. |
| `COMMUNE_INTERVAL_MS` | No | `900000` | Check interval (default: 15 minutes). |
| `COMMUNE_QUIET_START` | No | `22` | Quiet hours start (24h). |
| `COMMUNE_QUIET_END` | No | `7` | Quiet hours end (24h). |
| `COMMUNE_MAX_DAILY` | No | `5` | Maximum outreach messages per day. |
| `COMMUNE_MIN_HOURS_BETWEEN` | No | `2` | Minimum hours between outreach messages. |
| `COMMUNE_DEFAULT_CHANNEL` | No | `telegram` | Delivery channel: `telegram`, `push`, or `email`. |

---

## Goal Worker (Autonomous Execution)

When enabled, Squire autonomously works toward goals you've defined — breaking them into steps, executing tasks, and reporting progress.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOAL_WORKER_ENABLED` | No | `false` | Enable the goal worker. |
| `GOAL_WORKER_INTERVAL_MS` | No | `3600000` | How often to check for goal work (default: 1 hour). |
| `GOAL_WORKER_MAX_TURNS` | No | `15` | Maximum LLM turns per goal execution cycle. |
| `GOAL_WORKER_MAX_EXECUTION_MS` | No | `300000` | Maximum execution time per cycle (default: 5 minutes). |

---

## Expression Evaluator

Analyzes memories for emotional expression and tone. Runs a smaller model for efficient batch processing.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EXPRESSION_EVALUATOR_ENABLED` | No | `false` | Enable expression analysis. |
| `EXPRESSION_EVALUATOR_PROVIDER` | No | `ollama` | LLM provider for analysis. |
| `EXPRESSION_EVALUATOR_MODEL` | No | `qwen2.5:3b` | Model for analysis (smaller model recommended). |
| `EXPRESSION_EVALUATOR_BATCH_SIZE` | No | `10` | Memories to process per batch. |

---

## AgentMail

Email-based interaction through [AgentMail](https://agentmail.to).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AGENTMAIL_API_KEY` | When using AgentMail | — | AgentMail API key. |
| `AGENTMAIL_INBOX_ID` | When using AgentMail | — | AgentMail inbox address (e.g. `your-squire-inbox@agentmail.to`). |
| `AGENTMAIL_BASE_URL` | No | `https://api.agentmail.to/v0` | AgentMail API base URL. |

---

## Coding Worker

Squire can dispatch coding tasks to Claude Code. These settings control the worker's execution environment.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CODING_WORKING_DIR` | No | Current directory | Working directory for code operations. |
| `CODING_TIMEOUT_MS` | No | `30000` | Command execution timeout (default: 30 seconds). |
| `CODING_MAX_OUTPUT_BYTES` | No | `1048576` | Maximum output capture (default: 1MB). |

A built-in blocklist prevents dangerous commands (`rm -rf /`, `mkfs`, fork bombs, etc.) regardless of configuration.

---

## Minimal Configuration

The absolute minimum to get Squire running:

```bash
# Database
DATABASE_URL=postgresql://squire:squire_dev@localhost:5435/squire

# LLM (pick one)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Embeddings (pick one)
EMBED_PROVIDER=ollama
EMBED_MODEL=nomic-embed-text
EMBED_DIMENSION=768
```

Everything else has sensible defaults. Add integrations as you need them.
