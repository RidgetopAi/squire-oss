# SQUIRE WEB - WIRING DIAGRAM

## Purpose

This document tracks the connections between frontend components and backend APIs.
Update this as we build - it's our source of truth for what's wired and what's not.

**Legend**:

- ✅ Wired and working
- 🔧 In progress
- ⬜ Not started
- 🆕 New endpoint needed

---

# BACKEND API ENDPOINTS

## Existing Endpoints (from CLI)

| Endpoint                    | Method | Status   | Frontend Consumer             | Notes                  |
| --------------------------- | ------ | -------- | ----------------------------- | ---------------------- |
| `/api/health`               | GET    | ✅ Exists | StatusIndicator               | Health check           |
| `/api/memories`             | GET    | ✅ Exists | ⬜ TimelinePage, DashboardPage | List memories          |
| `/api/memories`             | POST   | ✅ Exists | ⬜ ChatPage (after response)   | Create memory          |
| `/api/memories/search`      | GET    | ✅ Exists | ⬜ TimelinePage                | Semantic search        |
| `/api/memories/:id`         | GET    | ✅ Exists | ⬜ MemoryCard detail           | Get single memory      |
| `/api/context`              | POST   | ✅ Exists | ⬜ ChatPage                    | Get context package    |
| `/api/context/profiles`     | GET    | ✅ Exists | ⬜ HeaderBar                   | List profiles          |
| `/api/entities`             | GET    | ✅ Exists | ⬜ EntitiesPanel, GraphPage    | List entities          |
| `/api/entities/:id`         | GET    | ✅ Exists | ⬜ EntityDetail                | Get entity + memories  |
| `/api/entities/search`      | GET    | ✅ Exists | ⬜ Search                      | Search entities        |
| `/api/beliefs`              | GET    | ✅ Exists | ⬜ BeliefsPanel                | List beliefs           |
| `/api/beliefs/:id`          | GET    | ✅ Exists | ⬜ BeliefCard detail           | Get belief + evidence  |
| `/api/patterns`             | GET    | ✅ Exists | ⬜ PatternsPanel               | List patterns          |
| `/api/patterns/:id`         | GET    | ✅ Exists | ⬜ PatternCard detail          | Get pattern + evidence |
| `/api/insights`             | GET    | ✅ Exists | ⬜ InsightsPanel               | List insights          |
| `/api/insights/:id`         | GET    | ✅ Exists | ⬜ InsightCard detail          | Get insight + sources  |
| `/api/insights/:id/dismiss` | POST   | ✅ Exists | ⬜ InsightCard                 | Dismiss insight        |
| `/api/insights/:id/action`  | POST   | ✅ Exists | ⬜ InsightCard                 | Mark actioned          |
| `/api/summaries`            | GET    | ✅ Exists | ⬜ LivingSummaryPanel          | Get all summaries      |
| `/api/summaries/:category`  | GET    | ✅ Exists | ⬜ Specific summary            | Get one summary        |
| `/api/graph/stats`          | GET    | ✅ Exists | ⬜ GraphPage                   | Graph statistics       |
| `/api/graph/neighbors/:id`  | GET    | ✅ Exists | ⬜ GraphPage                   | Entity neighbors       |
| `/api/graph/subgraph/:id`   | GET    | ✅ Exists | ⬜ GraphPage                   | Entity subgraph        |
| `/api/research/gaps`        | GET    | ✅ Exists | ⬜ Future                      | Knowledge gaps         |
| `/api/research/questions`   | GET    | ✅ Exists | ⬜ Future                      | Active questions       |
| `/api/objects`              | GET    | ✅ Exists | ⬜ Future                      | List objects           |
| `/api/consolidation/run`    | POST   | ✅ Exists | ⬜ Settings                    | Trigger consolidation  |
| `/api/consolidation/stats`  | GET    | ✅ Exists | ⬜ Settings                    | Consolidation stats    |

## New Endpoints Needed

| Endpoint                   | Method | Status    | Frontend Consumer | Purpose                        |
| -------------------------- | ------ | --------- | ----------------- | ------------------------------ |
| `/api/chat`                | POST   | 🆕 Needed | ChatPage          | Send message, get LLM response |
| `/api/chat/stream`         | WS     | 🆕 Needed | ChatPage          | Stream LLM response            |
| `/api/graph/visualization` | GET    | 🆕 Needed | GraphPage         | Full graph data for viz        |

---

# WEBSOCKET EVENTS

## Server → Client

| Event               | Status | Frontend Handler    | Payload                                      | Purpose           |
| ------------------- | ------ | ------------------- | -------------------------------------------- | ----------------- |
| `chat:response`     | 🆕     | ChatPage            | `{ conversationId, chunk, done }`            | Stream LLM tokens |
| `chat:context`      | 🆕     | OverlayStore        | `{ conversationId, memories[], entities[] }` | Context used      |
| `memory:created`    | 🆕     | Timeline, Dashboard | `{ memory }`                                 | New memory added  |
| `memory:updated`    | 🆕     | Timeline, Dashboard | `{ memory }`                                 | Memory changed    |
| `summary:updated`   | 🆕     | LivingSummaryPanel  | `{ category, summary }`                      | Summary refreshed |
| `insight:created`   | 🆕     | InsightsPanel       | `{ insight }`                                | New insight       |
| `connection:status` | 🆕     | HeaderBar           | `{ connected, latency }`                     | Connection health |

## Client → Server

| Event          | Status | Frontend Source | Payload                                | Purpose          |
| -------------- | ------ | --------------- | -------------------------------------- | ---------------- |
| `chat:message` | 🆕     | ChatInputBar    | `{ conversationId, message, profile }` | Send message     |
| `chat:cancel`  | 🆕     | ChatPage        | `{ conversationId }`                   | Cancel streaming |

---

# FRONTEND COMPONENTS → API MAPPING

## Layout Components

| Component       | API Dependencies                                | Status |
| --------------- | ----------------------------------------------- | ------ |
| `AppLayout`     | None                                            | ⬜      |
| `HeaderBar`     | `/api/context/profiles`, WS `connection:status` | ⬜      |
| `SideNav`       | None                                            | ⬜      |
| `OverlayPortal` | None (uses OverlayStore)                        | ⬜      |

## Chat Components

| Component                      | API Dependencies                       | Status |
| ------------------------------ | -------------------------------------- | ------ |
| `ChatPage`                     | `/api/chat`, `/api/context`, WS events | ⬜      |
| `ChatWindow`                   | ChatStore (local)                      | ⬜      |
| `MessageList`                  | ChatStore (local)                      | ⬜      |
| `MessageBubble`                | None                                   | ⬜      |
| `ChatInputBar`                 | `/api/chat` via ChatStore              | ⬜      |
| `STTButton`                    | Web Speech API (browser)               | ⬜      |
| `ContextualMemoryOverlayStack` | OverlayStore (from context response)   | ⬜      |

## Card Components

| Component     | API Dependencies                                        | Status |
| ------------- | ------------------------------------------------------- | ------ |
| `MemoryCard`  | Props only (data from parent)                           | ⬜      |
| `BeliefCard`  | Props only                                              | ⬜      |
| `PatternCard` | Props only                                              | ⬜      |
| `InsightCard` | `/api/insights/:id/dismiss`, `/api/insights/:id/action` | ⬜      |
| `EntityChip`  | Props only                                              | ⬜      |

## Dashboard Components

| Component            | API Dependencies                                 | Status |
| -------------------- | ------------------------------------------------ | ------ |
| `DashboardPage`      | Aggregates child panels                          | ⬜      |
| `LivingSummaryPanel` | `/api/summaries`                                 | ⬜      |
| `TodayPanel`         | `/api/memories` (filtered recent, high salience) | ⬜      |
| `BeliefsPanel`       | `/api/beliefs`                                   | ⬜      |
| `PatternsPanel`      | `/api/patterns`                                  | ⬜      |
| `EntitiesPanel`      | `/api/entities`                                  | ⬜      |
| `InsightsPanel`      | `/api/insights`                                  | ⬜      |

## Timeline Components

| Component          | API Dependencies              | Status |
| ------------------ | ----------------------------- | ------ |
| `TimelinePage`     | `/api/memories`               | ⬜      |
| `TimelineScroller` | Props from TimelinePage       | ⬜      |
| `TimelineFilters`  | Local state, triggers refetch | ⬜      |
| `DateSeparator`    | None                          | ⬜      |

## Graph Components

| Component               | API Dependencies                         | Status |
| ----------------------- | ---------------------------------------- | ------ |
| `GraphPage`             | `/api/graph/visualization` (new)         | ⬜      |
| `MemoryGraphView`       | Props from GraphPage                     | ⬜      |
| `GraphControls`         | Local state, triggers refetch            | ⬜      |
| `SelectionDetailsPanel` | `/api/entities/:id`, `/api/memories/:id` | ⬜      |

## Shared Components

| Component         | API Dependencies | Status |
| ----------------- | ---------------- | ------ |
| `SalienceMeter`   | Props only       | ⬜      |
| `EmotionIcon`     | Props only       | ⬜      |
| `LoadingSkeleton` | None             | ⬜      |
| `ErrorState`      | None             | ⬜      |
| `EmptyState`      | None             | ⬜      |

---

# STATE STORES

## Zustand Stores

| Store          | Purpose                                 | Status |
| -------------- | --------------------------------------- | ------ |
| `chatStore`    | Messages, conversationId, loading state | ⬜      |
| `overlayStore` | Active memory cards, push/dismiss       | ⬜      |
| `uiStore`      | Theme, sidebar state, selected profile  | ⬜      |

## TanStack Query Keys

| Query Key                             | Endpoint                   | Consumers                   |
| ------------------------------------- | -------------------------- | --------------------------- |
| `['memories', filters]`               | `/api/memories`            | TimelinePage, DashboardPage |
| `['memories', 'search', query]`       | `/api/memories/search`     | SearchResults               |
| `['memory', id]`                      | `/api/memories/:id`        | MemoryCard detail           |
| `['context', query, profile]`         | `/api/context`             | ChatPage                    |
| `['profiles']`                        | `/api/context/profiles`    | HeaderBar                   |
| `['entities', filters]`               | `/api/entities`            | EntitiesPanel, GraphPage    |
| `['entity', id]`                      | `/api/entities/:id`        | EntityDetail                |
| `['beliefs', filters]`                | `/api/beliefs`             | BeliefsPanel                |
| `['patterns', filters]`               | `/api/patterns`            | PatternsPanel               |
| `['insights', filters]`               | `/api/insights`            | InsightsPanel               |
| `['summaries']`                       | `/api/summaries`           | LivingSummaryPanel          |
| `['graph', 'visualization', filters]` | `/api/graph/visualization` | GraphPage                   |

---

# DATA FLOW DIAGRAMS

## Chat Message Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CHAT MESSAGE FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  User Types/Speaks                                                       │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────┐                                                     │
│  │  ChatInputBar   │                                                     │
│  │  + STTButton    │                                                     │
│  └────────┬────────┘                                                     │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────┐     ┌─────────────────┐                            │
│  │   chatStore     │────▶│  POST /api/     │                            │
│  │   addMessage()  │     │    context      │                            │
│  └────────┬────────┘     └────────┬────────┘                            │
│           │                       │                                      │
│           │              ┌────────▼────────┐                            │
│           │              │ ContextPackage  │                            │
│           │              │ - memories[]    │                            │
│           │              │ - entities[]    │                            │
│           │              │ - summaries[]   │                            │
│           │              └────────┬────────┘                            │
│           │                       │                                      │
│           │    ┌──────────────────┼──────────────────┐                  │
│           │    │                  │                  │                  │
│           │    ▼                  ▼                  ▼                  │
│           │  ┌──────────┐  ┌─────────────┐  ┌──────────────┐           │
│           │  │ Overlay  │  │ POST /api/  │  │ Disclosure   │           │
│           │  │ Store    │  │   chat      │  │ Logging      │           │
│           │  │ (cards)  │  │ (+ context) │  │              │           │
│           │  └────┬─────┘  └──────┬──────┘  └──────────────┘           │
│           │       │               │                                      │
│           │       ▼               ▼                                      │
│           │  ┌──────────┐  ┌─────────────┐                              │
│           │  │ Memory   │  │ WS stream   │                              │
│           │  │ Overlay  │  │ chat:resp   │                              │
│           │  │ Stack    │  └──────┬──────┘                              │
│           │  └──────────┘         │                                      │
│           │                       ▼                                      │
│           │              ┌─────────────────┐                            │
│           └─────────────▶│   MessageList   │                            │
│                          │   (renders)     │                            │
│                          └─────────────────┘                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Dashboard Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DASHBOARD DATA FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                       DashboardPage                              │    │
│  │                      (on mount)                                  │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│     ┌───────────────────────────┼───────────────────────────┐           │
│     │           │               │               │           │           │
│     ▼           ▼               ▼               ▼           ▼           │
│  ┌──────┐   ┌──────┐       ┌──────┐       ┌──────┐     ┌──────┐        │
│  │ GET  │   │ GET  │       │ GET  │       │ GET  │     │ GET  │        │
│  │/sum- │   │/memo-│       │/beli-│       │/patt-│     │/insi-│        │
│  │maries│   │ries  │       │efs   │       │erns  │     │ghts  │        │
│  └──┬───┘   └──┬───┘       └──┬───┘       └──┬───┘     └──┬───┘        │
│     │          │              │              │            │             │
│     ▼          ▼              ▼              ▼            ▼             │
│  ┌──────┐   ┌──────┐       ┌──────┐       ┌──────┐     ┌──────┐        │
│  │Living│   │Today │       │Belief│       │Patter│     │Insig-│        │
│  │Summ- │   │Panel │       │sPanel│       │nsPane│     │hts   │        │
│  │ary   │   │      │       │      │       │l     │     │Panel │        │
│  │Panel │   │      │       │      │       │      │     │      │        │
│  └──────┘   └──────┘       └──────┘       └──────┘     └──────┘        │
│                                                                          │
│  WebSocket Updates (live):                                               │
│  ┌─────────────────┐                                                     │
│  │ summary:updated │───▶ Invalidate summaries query                     │
│  │ memory:created  │───▶ Invalidate memories query                      │
│  │ insight:created │───▶ Invalidate insights query                      │
│  └─────────────────┘                                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# API CLIENT FUNCTIONS

Track implementation status of API client wrappers:

| Function                    | File                   | Status | Endpoint                       |
| --------------------------- | ---------------------- | ------ | ------------------------------ |
| `fetchMemories()`           | `lib/api/memories.ts`  | ⬜      | GET /api/memories              |
| `searchMemories()`          | `lib/api/memories.ts`  | ⬜      | GET /api/memories/search       |
| `getMemory()`               | `lib/api/memories.ts`  | ⬜      | GET /api/memories/:id          |
| `createMemory()`            | `lib/api/memories.ts`  | ⬜      | POST /api/memories             |
| `fetchContextPackage()`     | `lib/api/context.ts`   | ⬜      | POST /api/context              |
| `fetchProfiles()`           | `lib/api/context.ts`   | ⬜      | GET /api/context/profiles      |
| `sendChatMessage()`         | `lib/api/chat.ts`      | ⬜      | POST /api/chat                 |
| `fetchEntities()`           | `lib/api/entities.ts`  | ⬜      | GET /api/entities              |
| `getEntity()`               | `lib/api/entities.ts`  | ⬜      | GET /api/entities/:id          |
| `fetchBeliefs()`            | `lib/api/beliefs.ts`   | ⬜      | GET /api/beliefs               |
| `fetchPatterns()`           | `lib/api/patterns.ts`  | ⬜      | GET /api/patterns              |
| `fetchInsights()`           | `lib/api/insights.ts`  | ⬜      | GET /api/insights              |
| `dismissInsight()`          | `lib/api/insights.ts`  | ⬜      | POST /api/insights/:id/dismiss |
| `fetchSummaries()`          | `lib/api/summaries.ts` | ⬜      | GET /api/summaries             |
| `fetchGraphVisualization()` | `lib/api/graph.ts`     | ⬜      | GET /api/graph/visualization   |

---

# HOOKS

Track implementation status of React hooks:

| Hook                     | File                                | Status | Dependencies            |
| ------------------------ | ----------------------------------- | ------ | ----------------------- |
| `useMemories()`          | `lib/hooks/useMemories.ts`          | ⬜      | fetchMemories           |
| `useMemory()`            | `lib/hooks/useMemories.ts`          | ⬜      | getMemory               |
| `useContextPackage()`    | `lib/hooks/useContextPackage.ts`    | ⬜      | fetchContextPackage     |
| `useProfiles()`          | `lib/hooks/useProfiles.ts`          | ⬜      | fetchProfiles           |
| `useEntities()`          | `lib/hooks/useEntities.ts`          | ⬜      | fetchEntities           |
| `useBeliefs()`           | `lib/hooks/useBeliefs.ts`           | ⬜      | fetchBeliefs            |
| `usePatterns()`          | `lib/hooks/usePatterns.ts`          | ⬜      | fetchPatterns           |
| `useInsights()`          | `lib/hooks/useInsights.ts`          | ⬜      | fetchInsights           |
| `useSummaries()`         | `lib/hooks/useSummaries.ts`         | ⬜      | fetchSummaries          |
| `useGraphData()`         | `lib/hooks/useGraphData.ts`         | ⬜      | fetchGraphVisualization |
| `useSpeechRecognition()` | `lib/hooks/useSpeechRecognition.ts` | ⬜      | Web Speech API          |
| `useWebSocket()`         | `lib/hooks/useWebSocket.ts`         | ⬜      | Socket.IO               |

---

# UPDATE LOG

Track changes to wiring as we implement:

| Date | Phase | Change              | Components Affected |
| ---- | ----- | ------------------- | ------------------- |
| TBD  | P0    | Initial scaffolding | All                 |
|      |       |                     |                     |
|      |       |                     |                     |

---

# NOTES

- Update this document after completing each task
- Use status emoji consistently
- Add new endpoints to "New Endpoints Needed" before implementing
- Move from 🆕 → 🔧 → ✅ as work progresses
