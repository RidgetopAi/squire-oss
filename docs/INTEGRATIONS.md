# Integration Guides

Squire's integrations are all optional. The core memory system works without any of them. Each integration gracefully skips on startup when its credentials aren't configured — no errors, just a log message.

---

## Google Calendar

Sync your Google Calendar events into Squire as memories. Events become part of your memory graph, linked to entities and available for context generation.

### Prerequisites

- A Google Cloud project with the Calendar API enabled
- OAuth 2.0 credentials (Web application type)

### Step 1: Create Google Cloud Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services > Library**
4. Search for "Google Calendar API" and enable it
5. Go to **APIs & Services > Credentials**
6. Click **Create Credentials > OAuth 2.0 Client ID**
7. Choose **Web application** as the application type
8. Add an authorized redirect URI:
   - For local development: `http://localhost:3000/api/integrations/google/callback`
   - For production: `https://your-domain.com/api/integrations/google/callback`
9. Copy the Client ID and Client Secret

### Step 2: Configure Environment

Add to your `.env`:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
```

### Step 3: Authorize

1. Start the Squire API server
2. Open the web UI and go to **Settings > Integrations**
3. Click "Connect Google Calendar" — this redirects to Google's OAuth consent screen
4. Grant calendar read access
5. You'll be redirected back to Squire

Alternatively, use the CLI:

```bash
npx squire google auth
```

### Step 4: Verify

```bash
npx squire google status
```

Calendar events will sync periodically (every 15 minutes by default). Each synced event becomes a memory tagged with calendar metadata.

---

## Telegram Bot

Chat with Squire through Telegram. Send messages, store memories, and get context-aware responses from your phone.

### Prerequisites

- A Telegram account
- Your Telegram user ID (for access control)

### Step 1: Create a Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Choose a name (e.g., "My Squire") and username (e.g., `my_squire_bot`)
4. BotFather gives you an API token — save it

### Step 2: Find Your User ID

1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It replies with your user ID (a number like `123456789`)

### Step 3: Configure Environment

Add to your `.env`:

```bash
TELEGRAM_BOT_TOKEN=7123456789:AAH...your-bot-token
TELEGRAM_ALLOWED_USER_IDS=123456789
```

To allow multiple users, separate IDs with commas:

```bash
TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
```

### Step 4: Start and Test

Restart the Squire API server. You should see a log message like:

```
Telegram poller started
```

Open Telegram, find your bot, and send a message. Squire responds with full memory context.

### Optional Settings

```bash
# Polling interval (default: 1 second)
TELEGRAM_POLLING_INTERVAL_MS=1000
```

---

## AgentMail

Interact with Squire via email using [AgentMail](https://agentmail.to).

### Step 1: Get API Credentials

1. Sign up at [agentmail.to](https://agentmail.to)
2. Create an inbox and note the inbox address
3. Get your API key from the dashboard

### Step 2: Configure Environment

```bash
AGENTMAIL_API_KEY=your-agentmail-api-key
AGENTMAIL_INBOX_ID=your-inbox@agentmail.to
```

### Step 3: Verify

Restart the server. Send an email to your AgentMail inbox and check that Squire processes it.

---

## Courier (Proactive Reminders)

The Courier service periodically checks your commitments and reminders, then proactively notifies you through your configured channel (Telegram, push notifications, or email).

### Prerequisites

- At least one delivery channel configured (Telegram recommended)
- Some commitments or reminders stored in Squire

### Enable

```bash
COURIER_ENABLED=true
```

### How It Works

1. Every 30 minutes (configurable), Courier checks for upcoming or overdue commitments
2. If something needs attention, it crafts a message and sends it through your delivery channel
3. It respects quiet hours (10pm–7am by default) — no messages while you sleep

### Configuration

```bash
COURIER_ENABLED=true
COURIER_INTERVAL_MS=1800000          # Check every 30 minutes
COURIER_QUIET_START=22               # No messages after 10pm
COURIER_QUIET_END=7                  # Resume at 7am
COURIER_RETRY_ATTEMPTS=3             # Retry failed deliveries
COURIER_RETRY_DELAY_MS=15000         # 15 seconds between retries
```

---

## Commune (Proactive Outreach)

Commune enables Squire to initiate conversations — not just respond. It might check in about a goal, follow up on something you mentioned, or share an insight it generated during consolidation.

### Prerequisites

- At least one delivery channel configured (Telegram recommended)
- Some memories and goals stored in Squire

### Enable

```bash
COMMUNE_ENABLED=true
```

### How It Works

1. Periodically, Squire evaluates whether there's something worth reaching out about
2. It considers your recent activity, pending goals, and generated insights
3. If something is relevant and timely, it sends a message
4. Rate limits prevent it from being annoying — max 5 messages per day, at least 2 hours apart

### Configuration

```bash
COMMUNE_ENABLED=true
COMMUNE_INTERVAL_MS=900000           # Check every 15 minutes
COMMUNE_QUIET_START=22               # Quiet after 10pm
COMMUNE_QUIET_END=7                  # Resume at 7am
COMMUNE_MAX_DAILY=5                  # Max 5 outreach messages per day
COMMUNE_MIN_HOURS_BETWEEN=2          # At least 2 hours between messages
COMMUNE_DEFAULT_CHANNEL=telegram     # telegram, push, or email
```

---

## Goal Worker (Autonomous Execution)

The Goal Worker lets Squire autonomously work toward goals you define. It breaks goals into steps, executes them using available tools, and reports progress.

### Prerequisites

- A configured LLM provider
- Goals defined in Squire (via chat or CLI)

### Enable

```bash
GOAL_WORKER_ENABLED=true
```

### How It Works

1. Every hour (configurable), the worker checks for active goals
2. It selects a goal to work on, plans the next steps, and executes them
3. Each cycle is limited to 15 LLM turns and 5 minutes (configurable)
4. Progress is stored as memories, so you can ask "how's the project going?"

### Configuration

```bash
GOAL_WORKER_ENABLED=true
GOAL_WORKER_INTERVAL_MS=3600000      # Check every hour
GOAL_WORKER_MAX_TURNS=15             # Max LLM turns per cycle
GOAL_WORKER_MAX_EXECUTION_MS=300000  # Max 5 minutes per cycle
```

---

## Expression Evaluator

Analyzes memories for emotional tone and expression. Useful for tracking emotional patterns over time and providing more empathetic responses.

### Prerequisites

- An LLM provider (Ollama with a small model recommended for cost efficiency)

### Enable

```bash
EXPRESSION_EVALUATOR_ENABLED=true
```

### Configuration

```bash
EXPRESSION_EVALUATOR_ENABLED=true
EXPRESSION_EVALUATOR_PROVIDER=ollama    # ollama recommended (free)
EXPRESSION_EVALUATOR_MODEL=qwen2.5:3b  # Small model is sufficient
EXPRESSION_EVALUATOR_BATCH_SIZE=10      # Memories per batch
```

If using Ollama, pull the model first:

```bash
ollama pull qwen2.5:3b
```

---

## LLM Reranker (Enhanced Recall)

The reranker uses a second LLM pass to improve memory retrieval quality. After the initial vector search returns candidates, the reranker evaluates each one for relevance to the actual query.

### Prerequisites

- An API key for the reranker provider (xAI recommended for speed/cost)

### Enable

```bash
RECALL_RERANKER_ENABLED=true
```

### Configuration

```bash
RECALL_RERANKER_ENABLED=true
RECALL_RERANKER_PROVIDER=xai              # xai or anthropic
RECALL_RERANKER_MODEL=grok-4-1-fast-reasoning
RECALL_RERANKER_POOL=15                   # Candidates to rerank
XAI_API_KEY=xai-...                       # Required for xai provider
```

### Trade-offs

- **Quality:** Noticeably better recall, especially for nuanced queries
- **Latency:** Adds 1–3 seconds per retrieval (depends on pool size and model)
- **Cost:** Each retrieval makes an additional LLM call

---

## Checking Integration Status

### From the CLI

```bash
npx squire health
```

This checks connectivity to the database, LLM provider, embedding provider, and all configured integrations.

### From the API

```
GET http://localhost:3000/api/health
```

Returns a JSON object with the status of each subsystem.
