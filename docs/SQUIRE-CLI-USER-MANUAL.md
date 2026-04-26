# Squire CLI User Manual

**Version 0.1.0** | December 2025

---

## What is Squire?

Squire is your personal AI memory system. It remembers things for you so AI assistants can know you better.

Think of it this way: every time you use ChatGPT or Claude, you start from scratch. They don't remember your projects, your colleagues, your preferences, or what you discussed yesterday. Squire changes that.

**Squire does three things:**

1. **Captures** your observations, thoughts, and experiences
2. **Understands** what's important through salience scoring, entity extraction, and pattern detection
3. **Provides context** to AI assistants so they can help you more effectively

The result: AI conversations that feel continuous rather than starting fresh each time.

---

## Quick Start (5 Minutes)

Get started with just five commands:

```bash
# 1. Check that everything is working
squire status

# 2. Record your first memory
squire observe "Starting to learn Squire - excited to have an AI that remembers me"

# 3. Search your memories
squire search "Squire"

# 4. See what Squire knows about you
squire context

# 5. Let Squire form connections between memories
squire sleep
```

That's it. You now have a working memory system.

---

## Installation

### Requirements

- **Node.js 18+**
- **PostgreSQL** with pgvector extension
- **Ollama** (for embeddings) - running locally

### Setup

```bash
# Clone the repository
git clone https://github.com/RidgetopAi/squire.git
cd squire

# Install dependencies
npm install

# Create your environment file
cp .env.example .env
# Edit .env with your database credentials and API keys

# Start PostgreSQL (if using Docker)
docker compose up -d

# Run database migrations
npm run db:migrate

# Build the project
npm run build

# Install the CLI globally
npm link
```

Now `squire` is available from anywhere on your system.

---

## Core Concepts

Understanding these concepts will help you get the most from Squire.

### Memories

Everything in Squire starts with a memory. A memory is any observation, thought, or piece of information you want to remember.

```bash
squire observe "Had coffee with Sarah - she's worried about the Q4 deadline"
```

Memories are stored with:
- **Salience score** (0-10): How important is this?
- **Entities**: People, projects, places mentioned
- **Timestamp**: When you recorded it
- **Embeddings**: Vector representation for semantic search

### Salience

Not all memories are equally important. Squire automatically scores each memory 0-10 based on:

| Factor | Examples | Weight |
|--------|----------|--------|
| Temporal markers | "deadline Friday", "next week" | 20% |
| Relationships | "met with Sarah", "discussed with team" | 20% |
| Actions | "decided to", "committed to", "agreed" | 20% |
| Explicit importance | "important", "remember this" | 15% |
| Self-reference | "I feel", "I think", "I decided" | 15% |
| Detail/length | Richer content = more likely important | 10% |

**Low salience** (1-2): "Need to buy milk"
**High salience** (5+): "Sarah offered me CTO position - decide by Friday"

High-salience memories resist decay and rank higher in search results.

### Entities

Squire automatically extracts entities from your memories:

- **People**: Sarah Chen, Dr. Smith
- **Projects**: Quantum, Phoenix initiative
- **Organizations**: Acme Corp, Google
- **Places**: New York, the office
- **Concepts**: machine learning, Q4 goals

Entities connect your memories into a knowledge graph. When you ask "who is Sarah?", Squire finds every memory mentioning her.

### Consolidation

Like human memory, Squire needs to "sleep" to process what it's learned:

```bash
squire sleep
```

During consolidation:
- **Decay**: Low-importance, unaccessed memories fade
- **Strengthen**: Important, frequently-accessed memories become stronger
- **Connect**: Similar memories form "SIMILAR" edges
- **Detect patterns**: Recurring behaviors and themes
- **Generate insights**: Cross-references that reveal connections
- **Find gaps**: What don't we know that we should?

Run consolidation regularly (daily is good) to keep your memory system healthy.

### Context Profiles

When you ask for context, Squire tailors its output based on a profile:

| Profile | Focus | Use When |
|---------|-------|----------|
| **general** | Balanced context | Default for most situations |
| **work** | Projects, deadlines, commitments | During work hours |
| **personal** | Relationships, feelings | Personal conversations |
| **creative** | Ideas, explorations | Brainstorming sessions |

```bash
squire context --profile work --query "Q4 planning"
```

---

## Commands Reference

Commands are organized by what you're trying to do.

---

### Recording Memories

#### observe

**Purpose**: Store a new observation, thought, or experience.

This is your primary way of adding information to Squire.

```bash
squire observe "content to remember"
```

**Options:**
- `-s, --source <source>` - Where this came from (default: "cli")
- `-t, --type <type>` - Content type (default: "text")

**Examples:**
```bash
# Basic observation
squire observe "Met with Tom about architecture review"

# With source metadata
squire observe "Client wants feature by March" --source meeting

# Longer, detailed observation (automatically gets higher salience)
squire observe "Sarah offered me the CTO position today. Excited but nervous. Need to decide by Friday. Concerns: bigger team, less coding, more politics."
```

**What happens:**
1. Memory is stored with timestamp
2. Salience score is calculated automatically
3. Entities are extracted (people, projects, etc.)
4. Memory is classified into summary categories
5. Beliefs are extracted and checked for conflicts

**Output:**
```
Memory stored successfully!
  ID: d2b62af3
  Salience: 5.1
  Created: 12/25/2025, 10:00:24 PM
  Entities: Sarah (person), CTO (concept)
  Categories: commitments, people
  Beliefs: 1 new
```

---

### Searching & Retrieving

#### search

**Purpose**: Find memories by meaning, not just keywords.

Squire uses semantic search - it understands what you mean, not just what you typed.

```bash
squire search "query"
```

**Options:**
- `-l, --limit <n>` - Maximum results (default: 10)
- `-m, --min-similarity <0-1>` - How close a match must be (default: 0.3)

**Examples:**
```bash
# Find anything about deadlines
squire search "upcoming deadlines"

# Find emotional content
squire search "times I felt frustrated"

# Find with high precision
squire search "CTO decision" --min-similarity 0.5
```

**Why semantic search matters:**
Traditional search finds "deadline" only if you typed "deadline". Squire finds "due next Friday", "need to finish by EOW", and "client wants it soon" - all related concepts.

**How results are scored:**
`score = (similarity × 60%) + (salience × 40%)`

Important memories float to the top even with slightly lower match scores.

---

#### list

**Purpose**: See your recent memories at a glance.

```bash
squire list
```

**Options:**
- `-l, --limit <n>` - How many to show (default: 10)
- `-s, --source <source>` - Filter by source

**Examples:**
```bash
# Recent memories
squire list

# Show more
squire list --limit 50

# Only from meetings
squire list --source meeting
```

---

#### related

**Purpose**: See memories connected to a specific memory.

Memories form connections during consolidation based on semantic similarity.

```bash
squire related <memory-id>
```

**Options:**
- `-l, --limit <n>` - Maximum related memories (default: 10)

**Example:**
```bash
squire related d2b62af3

# Output:
Memory: d2b62af3
  Met with Sarah about project timeline
  salience: 4.2 | strength: 0.94

Connected Memories (3):
  [8b7c2e1f] weight: 1.00 | similarity: 87%
    Sarah mentioned Q4 deadline concerns
  [a3f91b2c] weight: 0.85 | similarity: 78%
    Project timeline discussion with team
```

---

### Understanding People & Things

#### who

**Purpose**: Get everything Squire knows about a person or entity.

This is one of Squire's most powerful features - instant recall of everything related to someone.

```bash
squire who "name"
```

**Examples:**
```bash
squire who "Sarah"
squire who "Quantum project"
squire who "Acme Corp"
```

**Output:**
```
Sarah Chen
  Type: person
  Mentions: 12
  First seen: 11/15/2025
  Last seen: 12/25/2025

Related Memories:

  [d2b62af3] 12/25/2025
    Sarah offered me the CTO position - deadline Friday
    salience: 5.1

  [7a8b9c0d] 12/20/2025
    Sarah worried about Q4 timeline, needs more resources
    salience: 3.8
```

**Use before meetings**: Run `squire who "Sarah"` before your 1:1 to refresh your memory of recent conversations.

---

#### entities

**Purpose**: List all extracted entities.

```bash
squire entities
```

**Options:**
- `-t, --type <type>` - Filter by: person, project, concept, place, organization
- `-l, --limit <n>` - Maximum to show (default: 20)
- `-s, --search <query>` - Search by name

**Examples:**
```bash
# All entities
squire entities

# Just people
squire entities --type person

# Search for someone
squire entities --search "Sarah"
```

---

### Getting Context for AI

#### context

**Purpose**: Generate a context package to give to an AI assistant.

This is how you make Claude or ChatGPT "remember" you.

```bash
squire context
```

**Options:**
- `-p, --profile <name>` - Profile: general, work, personal, creative
- `-q, --query <query>` - Focus context on a specific topic
- `-t, --max-tokens <n>` - Limit output size
- `--json` - Output as JSON instead of markdown

**Examples:**
```bash
# General context
squire context

# Focused on a project
squire context --query "Quantum project status"

# Work-focused with topic
squire context --profile work --query "upcoming deadlines"

# For programmatic use
squire context --json > context.json
```

**Output (markdown):**
```markdown
# Context for AI Assistant

## Living Summaries
**Commitments**: CTO decision by Friday, Q4 deliverables...
**People**: Sarah Chen (CTO offer), Tom (architecture)...

## Key Entities
**Persons:** Sarah Chen, Tom Bradley
**Projects:** Quantum, Phoenix

## High-Priority Memories
- Sarah offered me the CTO position - deadline Friday (salience: 5.1)

## Recent Context
- Met with architecture team about scaling concerns
- Client meeting pushed to Thursday

---
Tokens: ~850 | Memories: 12 | Disclosure: a3b4c5d6
```

**Workflow**: Copy this output and paste it at the start of your AI conversation.

---

#### profiles

**Purpose**: List available context profiles and their settings.

```bash
squire profiles
```

Each profile has different weights for how it selects memories:
- **sal**: Salience (importance)
- **rel**: Relevance to query
- **rec**: Recency
- **str**: Memory strength

---

### Memory Processing

#### consolidate

**Purpose**: Process memories - decay, strengthen, connect, analyze.

Like sleep for your brain, consolidation is when Squire does its deep processing.

```bash
squire consolidate
```

**Options:**
- `-v, --verbose` - Show detailed statistics

**What happens:**
1. **Decay**: Unimportant, unaccessed memories fade
2. **Strengthen**: Important, accessed memories get stronger
3. **Edges**: Similar memories get connected
4. **Patterns**: Recurring behaviors are detected
5. **Insights**: Cross-references generate new understanding
6. **Gaps**: Missing knowledge is identified
7. **Questions**: Research questions are generated

**Output:**
```
Consolidation complete!
  Memories processed: 51
  Decayed: 45
  Strengthened: 6
  Edges created: 12
  Patterns: 3 new, 8 reinforced
  Insights: 2 new, 1 validated
  Gaps: 1 new
  Questions: 2 new
  Duration: 1247ms
```

---

#### sleep

**Purpose**: Friendly alias for consolidate.

Same functionality, different vibe.

```bash
squire sleep
```

**Output:**
```
Squire is sleeping... consolidating memories...

Squire wakes up refreshed!
  Processed 51 memories
  45 faded, 6 strengthened
  12 new connections formed
  3 patterns discovered, 8 reinforced
  2 insights generated
```

**Recommendation**: Run `squire sleep` at the end of each day.

---

### Living Summaries

Summaries are distilled understanding across categories, updated incrementally as you add memories.

#### summaries

**Purpose**: List all living summary categories.

```bash
squire summaries
```

**Options:**
- `-a, --all` - Include empty categories
- `-r, --regenerate` - Update all summaries with new memories

**Categories:**
| Category | What It Tracks |
|----------|---------------|
| **commitments** | Things you've agreed to do |
| **people** | Relationships and interactions |
| **projects** | Work and initiatives |
| **tensions** | Conflicts and concerns |
| **mood** | Emotional state over time |
| **narrative** | Your life story arc |
| **goals** | What you're working toward |

---

#### summary

**Purpose**: View or regenerate a specific summary.

```bash
squire summary <category>
```

**Options:**
- `-r, --regenerate` - Incorporate new memories into summary

**Example:**
```bash
squire summary people --regenerate

# Output:
PEOPLE
────────────────────────────────────
Sarah Chen: CTO offer pending, decision by Friday. Previously discussed Q4
concerns and resource needs. Key relationship - potential future manager.

Tom Bradley: Architecture lead. Recent focus on scaling concerns. Generally
aligned on technical direction.

Dr. Robert Smith: External contact from Acme Corp. Met once for partnership
discussion.
────────────────────────────────────
Version: 3 | Memories: 24 | Last updated: 12/25/2025, 3:45 PM
```

---

### Beliefs System

Beliefs are persistent conclusions extracted from your memories - what you think, prefer, and predict.

#### beliefs

**Purpose**: List extracted beliefs.

```bash
squire beliefs
```

**Options:**
- `-t, --type <type>` - Filter by type (see below)
- `-l, --limit <n>` - Maximum to show (default: 20)
- `--conflicts` - Show unresolved conflicts only

**Belief types:**
| Type | Examples |
|------|----------|
| **value** | "I believe honesty is important" |
| **preference** | "I prefer working in the morning" |
| **self_knowledge** | "I'm good at debugging" |
| **prediction** | "The project will ship late" |
| **about_person** | "Sarah is a strong leader" |
| **about_project** | "Quantum has technical debt" |
| **about_world** | "Remote work is here to stay" |
| **should** | "We should invest in testing" |

**Example:**
```bash
squire beliefs --type preference

# Output:
[a1b2c3d4] preference
  "I prefer morning meetings to afternoon ones"
  confidence: 75% | sources: 3 | reinforced: 2x
```

---

#### belief

**Purpose**: View a belief with its supporting evidence.

```bash
squire belief <id>
```

Shows the belief and all memories that support or challenge it.

---

### Pattern Detection

Patterns are recurring behaviors, habits, and tendencies detected across your memories.

#### patterns

**Purpose**: List detected patterns.

```bash
squire patterns
```

**Options:**
- `-t, --type <type>` - Filter by type
- `-l, --limit <n>` - Maximum to show (default: 20)
- `--dormant` - Include dormant (inactive) patterns

**Pattern types:**
| Type | Examples |
|------|----------|
| **behavioral** | "Tends to procrastinate on documentation" |
| **temporal** | "Most productive between 9-11am" |
| **emotional** | "Gets stressed before client meetings" |
| **social** | "Collaborates frequently with Sarah" |
| **cognitive** | "Thinks through problems by writing" |
| **physical** | "Energy dips after lunch" |

---

#### pattern

**Purpose**: View a pattern with supporting evidence.

```bash
squire pattern <id>
```

---

### Insights System

Insights are cross-references and realizations generated by analyzing patterns, beliefs, and memories together.

#### insights

**Purpose**: List generated insights.

```bash
squire insights
```

**Options:**
- `-t, --type <type>` - Filter: connection, contradiction, opportunity, warning
- `-p, --priority <level>` - Filter: low, medium, high, critical
- `-l, --limit <n>` - Maximum to show (default: 20)
- `--all` - Include dismissed and actioned insights

**Insight types:**
| Type | Meaning |
|------|---------|
| **connection** | Two things relate in a non-obvious way |
| **contradiction** | Something doesn't add up |
| **opportunity** | Potential action to consider |
| **warning** | Something needs attention |

---

#### insight

**Purpose**: View, dismiss, or act on an insight.

```bash
squire insight <id>
squire insight <id> --dismiss "Not relevant to current situation"
squire insight <id> --action
```

---

### Active Research

Squire identifies what it doesn't know (gaps) and suggests questions to fill those gaps.

#### gaps

**Purpose**: List knowledge gaps.

```bash
squire gaps
```

**Options:**
- `-t, --type <type>` - Filter by type
- `-p, --priority <level>` - Filter by priority
- `-l, --limit <n>` - Maximum to show
- `--all` - Include filled and dismissed gaps

**Gap types:**
entity, relationship, timeline, outcome, context, commitment, preference, history

---

#### gap

**Purpose**: View, dismiss, or fill a gap.

```bash
squire gap <id>
squire gap <id> --dismiss "No longer relevant"
squire gap <id> --fill
```

---

#### questions

**Purpose**: List research questions to ask.

```bash
squire questions
```

**Options:**
- `-t, --type <type>` - Filter by type
- `-p, --priority <level>` - Filter by priority
- `--timing <hint>` - Filter by timing (immediately, next_session, when_relevant)
- `-l, --limit <n>` - Maximum to show
- `--all` - Include answered and dismissed

**Question types:**
clarification, follow_up, exploration, verification, deepening, connection, outcome, preference

---

#### question

**Purpose**: Track and answer a question.

```bash
squire question <id>
squire question <id> --ask              # Mark as asked
squire question <id> --answer "text"    # Record the answer
squire question <id> --dismiss          # Dismiss as irrelevant
```

---

### Graph Exploration

Explore the knowledge graph - how entities and memories connect.

#### graph

**Purpose**: View knowledge graph statistics.

```bash
squire graph
```

Shows node counts, edge counts, and connectivity metrics.

---

#### neighbors

**Purpose**: Find entities that appear together with a given entity.

```bash
squire neighbors <entity>
```

**Options:**
- `-l, --limit <n>` - Maximum to show (default: 10)
- `-m, --min <count>` - Minimum shared memories (default: 1)
- `-t, --type <type>` - Filter by entity type

**Example:**
```bash
squire neighbors Sarah

# Output:
Neighbors of Sarah Chen (person)

Found 5 connected entities:

  [project] Quantum
    shared memories: 8 | strength: 85%

  [person] Tom Bradley
    shared memories: 4 | strength: 62%
```

**Use case**: Discover who works with whom, or which projects a person is involved in.

---

#### path

**Purpose**: Find how two entities are connected.

```bash
squire path <entity1> <entity2>
```

**Options:**
- `-m, --max-hops <n>` - Maximum hops to search (default: 4)

**Example:**
```bash
squire path "Sarah" "Quantum project"

# Output:
Sarah Chen → Quantum project

Directly connected via 8 shared memories:

  [d2b62af3] Met with Sarah about Quantum deadline...
  [7a8b9c0d] Sarah leading Quantum team meeting...
```

---

#### explore

**Purpose**: Multi-hop traversal from an entity.

Discover the wider network around someone or something.

```bash
squire explore <entity>
```

**Options:**
- `-h, --hops <n>` - Maximum hops (default: 2)
- `-l, --limit <n>` - Maximum entities to show (default: 20)

**Example:**
```bash
squire explore "Sarah" --hops 2

# Output:
Exploring from Sarah Chen (up to 2 hops)

1 hop away (5):
  [project] Quantum (85%)
  [person] Tom Bradley (62%)
  [org] Acme Corp (41%)

2 hops away (8):
  [person] Dr. Robert Smith (35%)
  [concept] Q4 planning (28%)
```

---

#### network

**Purpose**: Show the local subgraph around an entity.

```bash
squire network <entity>
```

**Options:**
- `-m, --memories <n>` - Maximum memories to include (default: 10)
- `-e, --entities <n>` - Maximum entities to include (default: 5)

---

### Object Storage

Store files, images, and documents linked to your memories and entities.

#### upload

**Purpose**: Upload a file to Squire.

```bash
squire upload <file>
```

**Options:**
- `-n, --name <name>` - Display name (defaults to filename)
- `-d, --description <desc>` - Description
- `-t, --tags <tags>` - Comma-separated tags
- `-m, --memory <id>` - Link to a memory
- `-e, --entity <id>` - Link to an entity

**Example:**
```bash
squire upload meeting-notes.pdf -n "Q4 Planning Notes" -t work,planning
squire upload team-photo.jpg -d "Team offsite 2025" -e <sarah-entity-id>
```

---

#### objects

**Purpose**: List stored objects.

```bash
squire objects
```

**Options:**
- `-l, --limit <n>` - Maximum to show (default: 20)
- `-t, --type <type>` - Filter: image, document, audio, video, archive, other
- `--tag <tag>` - Filter by tag
- `-s, --search <query>` - Search by name/description

---

#### object

**Purpose**: View or modify an object.

```bash
squire object <id>
squire object <id> --add-tag vacation
squire object <id> --link-memory <memory-id>
squire object <id> --delete
```

---

#### tags

**Purpose**: List all object tags with counts.

```bash
squire tags
```

---

#### collections

**Purpose**: List object collections (albums/folders).

```bash
squire collections
```

---

#### collection

**Purpose**: View or modify a collection.

```bash
squire collection <id>
squire collection <id> --add <object-id>
squire collection <id> --remove <object-id>
```

---

#### collection-create

**Purpose**: Create a new collection.

```bash
squire collection-create "Vacation Photos 2025" -d "Trip to Italy"
```

---

### Data Import

#### import

**Purpose**: Import memories from a JSON file.

```bash
squire import <file>
```

**Options:**
- `--dry-run` - Preview without importing
- `--allow-duplicates` - Import even if similar exists
- `--skip-entities` - Skip entity extraction (faster)
- `--min-length <n>` - Minimum content length (default: 10)
- `-q, --quiet` - Show only summary

**File format** (JSONL or array):
```json
{"content": "Memory content here", "occurred_at": "2025-01-15", "source": "journal"}
{"content": "Another memory", "tags": ["work", "project"]}
```

---

#### import-stats

**Purpose**: Show statistics about imported memories.

```bash
squire import-stats
```

---

### System

#### status

**Purpose**: Check system health and statistics.

```bash
squire status
```

**Output:**
```
Squire Status

  Database: Connected
  Embedding: Connected
    Provider: ollama
    Model: nomic-embed-text
    Dimension: 768
  LLM: Connected
    Provider: groq
    Model: llama-3.3-70b-versatile
  Memories: 51 (48 active, 3 dormant)
  Entities: 34
  Edges: 16 SIMILAR connections
  Summaries: 7/7 (0 pending)
```

---

## Workflows

### Daily Capture

Throughout your day, observe things that matter:

```bash
squire observe "Morning standup - team blocked on API integration"
squire observe "1:1 with Sarah - she mentioned burnout concerns"
squire observe "Had insight: our testing strategy is reactive, not proactive"
squire observe "Client meeting moved to Thursday - they need more review time"
```

End of day:
```bash
squire sleep
```

### Preparing for a Meeting

Before meeting with someone:
```bash
# Remember everything about them
squire who "Sarah"

# Find relevant project context
squire search "Quantum project status"

# Get full context for the topic
squire context --profile work --query "Sarah Quantum meeting"
```

### Giving Context to AI

When starting a conversation with Claude or ChatGPT:

```bash
# Generate and copy context
squire context --query "help me plan Q4"

# Paste output at start of AI conversation
```

For programmatic use:
```bash
squire context --json | pbcopy  # macOS
```

### Weekly Review

```bash
# What patterns has Squire noticed?
squire patterns

# Any new insights?
squire insights

# What don't we know?
squire gaps

# Questions to explore?
squire questions

# Update all summaries
squire summaries --regenerate
```

### Exploring Connections

```bash
# Who does Sarah work with?
squire neighbors Sarah

# How is X connected to Y?
squire path "Sarah" "Quantum"

# What's the broader network around this project?
squire explore "Quantum" --hops 3
```

---

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5435/squire

# Embeddings (Ollama - local)
EMBED_PROVIDER=ollama
EMBED_MODEL=nomic-embed-text
EMBED_DIMENSION=768
OLLAMA_URL=http://localhost:11434

# LLM (Groq - cloud)
GROQ_API_KEY=your_key_here
LLM_PROVIDER=groq
LLM_MODEL=llama-3.3-70b-versatile
```

### Consolidation Tuning

Edit `src/services/consolidation.ts` to adjust:

```typescript
CONSOLIDATION_CONFIG = {
  decay: {
    baseRate: 0.05,        // 5% decay per cycle
    minStrength: 0.1,      // Dormant threshold
  },
  strengthen: {
    baseGain: 0.1,
    maxStrength: 1.0,
    highSalienceThreshold: 6.0,
  },
  edges: {
    similarityThreshold: 0.75,  // 75%+ similarity = edge
    maxEdgesPerMemory: 10,
  },
}
```

---

## Troubleshooting

### "Embedding: Disconnected"

Ollama isn't running:
```bash
ollama serve
ollama pull nomic-embed-text
```

### "Database: Disconnected"

PostgreSQL isn't running:
```bash
docker compose up -d
```

### No search results

Lower the similarity threshold:
```bash
squire search "query" --min-similarity 0.2
```

### Memories not connecting

Run consolidation:
```bash
squire consolidate
```

### Summaries not updating

Regenerate with pending memories:
```bash
squire summaries --regenerate
```

---

## API Reference

Squire also exposes a REST API on port 3000:

```bash
npm run server
```

### Core Endpoints
- `GET /api/health` - Health check
- `GET /api/memories` - List memories
- `POST /api/memories` - Create memory
- `GET /api/memories/search?query=X` - Search
- `POST /api/context` - Generate context

### Entities
- `GET /api/entities` - List entities
- `GET /api/entities/who/:name` - Query entity

### Consolidation
- `POST /api/consolidation/run` - Run consolidation
- `GET /api/consolidation/stats` - Get stats

### Summaries
- `GET /api/summaries` - List summaries
- `POST /api/summaries/:category/generate` - Regenerate

### Beliefs, Patterns, Insights
- `GET /api/beliefs`, `GET /api/patterns`, `GET /api/insights`
- Full CRUD and filtering available

### Research
- `GET /api/research/gaps` - List gaps
- `GET /api/research/questions` - List questions

### Graph
- `GET /api/graph/stats` - Graph statistics
- `GET /api/graph/entities/:id/neighbors` - Entity neighbors
- `GET /api/graph/path/entities/:start/:end` - Path finding

### Objects
- `GET /api/objects` - List objects
- `POST /api/objects` - Upload (multipart)
- `GET /api/objects/:id/download` - Download file

---

## Philosophy

Squire is built on a few beliefs:

1. **Your context is valuable**. Every AI conversation shouldn't start from scratch.

2. **Importance varies**. Not all information deserves equal weight.

3. **Connections matter**. Understanding is in the relationships between things.

4. **Memory should be active**. It should fade, strengthen, and form new connections over time.

5. **You own your data**. Squire runs locally. Your memories stay yours.

---

*Last Updated: December 27, 2025*
*Squire v0.1.0 - Slice 7 Complete*
