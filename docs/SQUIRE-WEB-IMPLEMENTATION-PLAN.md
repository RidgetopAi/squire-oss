# SQUIRE WEB APP - IMPLEMENTATION PLAN

## Overview

**Goal**: Transform Squire from CLI to a chat-first web application with rich memory visualization.

**Core Principles**:
- Chat-driven as primary interface
- Memory cards as the atomic visual unit
- User experience is priority #1
- Real-time, animated, futuristic feel
- Build incrementally, wire as we go

**Tech Stack**:
| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (App Router) + React 18 |
| Styling | Tailwind CSS + CSS variables for theming |
| State (Server) | TanStack Query |
| State (UI) | Zustand |
| Animation | Framer Motion |
| Graph Viz | react-force-graph |
| Real-time | Socket.IO |
| STT | Web Speech API |
| Backend | Existing Express API (extended) |
| Database | PostgreSQL + pgvector (unchanged) |

---

# PHASE 0: PROJECT SCAFFOLDING
**Duration**: 1 session
**Goal**: Set up the web app structure alongside existing CLI/API

## Tasks

### P0-T1: Create Next.js Web App
- [ ] Initialize Next.js 15 app in `squire/web/`
- [ ] Configure TypeScript
- [ ] Set up path aliases (@/components, @/lib, etc.)
- [ ] Configure ESLint + Prettier

### P0-T2: Install Core Dependencies
- [ ] Tailwind CSS + configuration
- [ ] Framer Motion
- [ ] TanStack Query
- [ ] Zustand
- [ ] Socket.IO client

### P0-T3: Configure Tailwind Theme
- [ ] Create cyber-futuristic color palette (dark mode, neon accents, gold highlights)
- [ ] Define CSS variables for salience/emotion color mapping
- [ ] Set up animation utilities
- [ ] Configure glassmorphism/glow effects

### P0-T4: Project Structure
- [ ] Create folder structure (see Component Architecture below)
- [ ] Set up API client utilities
- [ ] Create shared types (synced with backend)

### P0-T5: Development Environment
- [ ] Configure proxy to backend API (localhost:3001 → localhost:3000/api)
- [ ] Add `dev:web` script to package.json
- [ ] Test hot reload works

**Deliverable**: Empty Next.js app with theme, ready for components

---

# PHASE 1: CHAT FOUNDATION
**Duration**: 2-3 sessions
**Goal**: Working chat interface with basic LLM integration

## Tasks

### P1-T1: Layout Shell
- [ ] Create `<AppLayout>` with sidebar navigation
- [ ] Create `<HeaderBar>` (logo, profile selector placeholder, status)
- [ ] Create `<SideNav>` (Chat, Dashboard, Timeline, Graph, Settings links)
- [ ] Implement dark mode as default
- [ ] Mobile-responsive skeleton

### P1-T2: Chat UI Components
- [ ] Create `<ChatPage>` route at `/app/chat`
- [ ] Create `<ChatWindow>` container
- [ ] Create `<MessageList>` with scroll behavior
- [ ] Create `<MessageBubble>` (user vs assistant styling)
- [ ] Create `<ChatInputBar>` with text input
- [ ] Create `<SendButton>` with loading state

### P1-T3: Chat State Management
- [ ] Create `useChatStore` (Zustand)
  - messages array
  - conversationId
  - isLoading state
  - addMessage, updateMessage actions
- [ ] Implement message submission flow
- [ ] Handle optimistic updates

### P1-T4: Backend - Chat Endpoint
- [ ] Create `/api/chat` POST endpoint in Express
- [ ] Integrate with LLM provider (Groq)
- [ ] Accept: message, conversationId, context (optional)
- [ ] Return: assistant response
- [ ] Wire up context injection from `/api/context`

### P1-T5: Frontend-Backend Chat Wiring
- [ ] Create `chatApi.ts` client functions
- [ ] Wire `<ChatInputBar>` → API → `<MessageList>`
- [ ] Handle errors gracefully
- [ ] Add typing indicator

### P1-T6: STT Integration (Basic)
- [ ] Create `<STTButton>` component
- [ ] Implement Web Speech API hook (`useSpeechRecognition`)
- [ ] Wire transcript to chat input
- [ ] Visual feedback (recording state)

**Deliverable**: Working chat with LLM responses, basic STT input

---

# PHASE 2: MEMORY CONTEXT INTEGRATION
**Duration**: 2-3 sessions
**Goal**: Chat uses memory context, displays contextual memory cards

## Tasks

### P2-T1: Context Fetching
- [ ] Create `useContextPackage` hook (TanStack Query)
- [ ] Call `/api/context` with user query before LLM call
- [ ] Parse response: memories, entities, summaries

### P2-T2: Memory Card Component
- [ ] Create `<MemoryCard>` base component
  - Front face: excerpt, salience bar, emotion icons, timestamp
  - Back face: full content, entities, export buttons
- [ ] Implement flip animation (Framer Motion)
- [ ] Salience → glow intensity mapping
- [ ] Emotion → icon/color mapping

### P2-T3: Overlay System
- [ ] Create `useOverlayStore` (Zustand)
  - activeCards array
  - pushCard, dismissCard, clearCards
- [ ] Create `<OverlayPortal>` for rendering overlays
- [ ] Create `<ContextualMemoryOverlayStack>`
  - Positioned to side of chat
  - Animated entry/exit
  - Dismiss button per card

### P2-T4: Wire Context to Chat Flow
- [ ] On user message: fetch context → display cards → send to LLM
- [ ] Show "Recalling memories..." loading state
- [ ] Display memory cards in overlay
- [ ] Include context in LLM prompt

### P2-T5: Export Functionality
- [ ] Create export utility (memory → markdown, plain text)
- [ ] Add export buttons to MemoryCard back face
- [ ] Implement download as file

### P2-T6: Memory Badge in Chat
- [ ] Add "Used X memories" badge to assistant messages
- [ ] Click badge → show/hide related memory cards
- [ ] Visual connection between message and cards

**Deliverable**: Chat with contextual memory cards, export capability

---

# PHASE 3: DASHBOARD
**Duration**: 2 sessions
**Goal**: Interactive dashboard with key information at a glance

## Tasks

### P3-T1: Dashboard Layout
- [ ] Create `<DashboardPage>` route at `/app/dashboard`
- [ ] Grid layout for tiles/panels
- [ ] Responsive breakpoints

### P3-T2: Living Summary Panel
- [ ] Create `<LivingSummaryPanel>`
- [ ] Fetch from `/api/summaries`
- [ ] Display: mood, narrative, current goals
- [ ] Animated text reveal

### P3-T3: Today/Recent Panel
- [ ] Create `<TodayPanel>`
- [ ] High-salience recent memories
- [ ] Inferred commitments/tasks
- [ ] Quick-glance format

### P3-T4: Beliefs Panel
- [ ] Create `<BeliefsPanel>`
- [ ] Fetch from `/api/beliefs`
- [ ] Show top beliefs with confidence bars
- [ ] Grouped by type (values, preferences, etc.)

### P3-T5: Patterns Panel
- [ ] Create `<PatternsPanel>`
- [ ] Fetch from `/api/patterns`
- [ ] Frequency indicators
- [ ] Type icons (behavioral, temporal, emotional)

### P3-T6: Entities Panel
- [ ] Create `<EntitiesPanel>`
- [ ] Fetch from `/api/entities`
- [ ] Top people/projects as chips
- [ ] Mention counts, last seen

### P3-T7: Insights Panel
- [ ] Create `<InsightsPanel>`
- [ ] Fetch from `/api/insights`
- [ ] Priority-sorted cards
- [ ] Type icons (connection, warning, opportunity)

### P3-T8: Panel Interactions
- [ ] Click panel → expand as overlay or navigate
- [ ] Consistent with MemoryCard patterns
- [ ] Smooth transitions

**Deliverable**: Interactive dashboard with all key data types

---

# PHASE 4: TIMELINE VIEW
**Duration**: 2 sessions
**Goal**: Scrollable, animated memory timeline

## Tasks

### P4-T1: Timeline Page
- [ ] Create `<TimelinePage>` route at `/app/timeline`
- [ ] Full-height scrollable container

### P4-T2: Timeline Filters
- [ ] Create `<TimelineFilters>` component
- [ ] Date range picker
- [ ] Salience slider (min threshold)
- [ ] Source filter (checkboxes)
- [ ] Emotion filter

### P4-T3: Timeline Scroller
- [ ] Create `<TimelineScroller>` with virtualization
- [ ] Infinite scroll / pagination
- [ ] Load more on scroll

### P4-T4: Timeline Memory Cards
- [ ] Reuse `<MemoryCard>` component
- [ ] Chronological layout (vertical)
- [ ] Date separators/groupings
- [ ] Salience-based visual intensity

### P4-T5: Timeline Animations
- [ ] Entry animations (fade-in, slide-up)
- [ ] Parallax scroll effect
- [ ] Decay fade for older/low-salience items
- [ ] Hover effects

### P4-T6: Focus/Highlight
- [ ] Support `?focus=memoryId` URL param
- [ ] Scroll to and highlight specific memory
- [ ] From chat overlay "Open in timeline"

**Deliverable**: Beautiful scrollable memory timeline with filters

---

# PHASE 5: GRAPH VIEW
**Duration**: 2 sessions
**Goal**: Interactive network visualization of memories/entities

## Tasks

### P5-T1: Graph Page
- [ ] Create `<GraphPage>` route at `/app/graph`
- [ ] Install and configure react-force-graph

### P5-T2: Graph Data Fetching
- [ ] Create `/api/graph/visualization` endpoint
- [ ] Return nodes (memories, entities) and edges
- [ ] Support filters (type, salience, date range)

### P5-T3: Graph Visualization
- [ ] Create `<MemoryGraphView>` component
- [ ] Node types: memory (circle), entity (different shapes by type)
- [ ] Edge visualization (similarity strength)
- [ ] Color/glow by salience

### P5-T4: Graph Controls
- [ ] Create `<GraphControls>` panel
- [ ] Filter by entity type
- [ ] Salience threshold slider
- [ ] Time range filter
- [ ] Layout options

### P5-T5: Graph Interactions
- [ ] Click node → show details panel
- [ ] Hover → highlight connected nodes
- [ ] Double-click → focus/zoom
- [ ] Right-click → context menu

### P5-T6: Selection Details Panel
- [ ] Create `<SelectionDetailsPanel>`
- [ ] Show selected node details
- [ ] Related memories/entities
- [ ] Actions (open in timeline, etc.)

**Deliverable**: Interactive memory graph exploration

---

# PHASE 6: REAL-TIME & POLISH
**Duration**: 2 sessions
**Goal**: WebSocket integration, streaming, polish

## Tasks

### P6-T1: WebSocket Server
- [ ] Add Socket.IO to Express server
- [ ] Define event types (chat:response, memory:created, etc.)
- [ ] Handle connections/reconnections

### P6-T2: WebSocket Client
- [ ] Create `useWebSocket` hook
- [ ] Auto-connect on app load
- [ ] Reconnection logic
- [ ] Event handlers

### P6-T3: Streaming Chat
- [ ] Stream LLM responses via WebSocket
- [ ] Update message in real-time as tokens arrive
- [ ] Typing indicator while streaming

### P6-T4: Live Updates
- [ ] Push new memories to timeline/dashboard
- [ ] "New insight discovered" notifications
- [ ] Summary update notifications

### P6-T5: Polish & Microinteractions
- [ ] Loading skeletons for all data
- [ ] Error states with retry
- [ ] Empty states with guidance
- [ ] Keyboard shortcuts
- [ ] Toast notifications

### P6-T6: Performance Optimization
- [ ] Component memoization
- [ ] Query caching optimization
- [ ] Bundle size analysis
- [ ] Lazy loading for routes

**Deliverable**: Real-time, polished experience

---

# PHASE 7: ADVANCED FEATURES
**Duration**: Ongoing
**Goal**: Enhanced capabilities

## Tasks (Future)

### P7-T1: Reminders System
- [ ] Create reminders table/model
- [ ] Chat command: "Remind me to..."
- [ ] Notification system (browser, optional push)
- [ ] Reminders panel on dashboard

### P7-T2: Calendar Integration
- [ ] Calendar view component
- [ ] Event extraction from memories
- [ ] "Schedule" chat commands
- [ ] External calendar sync (future)

### P7-T3: Actions Framework
- [ ] Define action types (remind, schedule, note, etc.)
- [ ] Action confirmation flow
- [ ] Action history

### P7-T4: Multi-Profile
- [ ] Profile switching in header
- [ ] Different contexts (work, personal, family)
- [ ] Profile-specific summaries

### P7-T5: Mobile Optimization
- [ ] PWA configuration
- [ ] Touch gestures
- [ ] Mobile-specific layouts
- [ ] Offline support

---

# COMPONENT ARCHITECTURE

```
web/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Redirect to /app/chat
│   └── app/
│       ├── layout.tsx           # App layout (sidebar, header)
│       ├── chat/
│       │   └── page.tsx         # ChatPage
│       ├── dashboard/
│       │   └── page.tsx         # DashboardPage
│       ├── timeline/
│       │   └── page.tsx         # TimelinePage
│       ├── graph/
│       │   └── page.tsx         # GraphPage
│       └── settings/
│           └── page.tsx         # SettingsPage
│
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx
│   │   ├── HeaderBar.tsx
│   │   ├── SideNav.tsx
│   │   └── OverlayPortal.tsx
│   │
│   ├── chat/
│   │   ├── ChatWindow.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── ChatInputBar.tsx
│   │   ├── STTButton.tsx
│   │   └── ContextualMemoryOverlayStack.tsx
│   │
│   ├── cards/
│   │   ├── MemoryCard.tsx
│   │   ├── BeliefCard.tsx
│   │   ├── PatternCard.tsx
│   │   ├── InsightCard.tsx
│   │   └── EntityChip.tsx
│   │
│   ├── dashboard/
│   │   ├── LivingSummaryPanel.tsx
│   │   ├── TodayPanel.tsx
│   │   ├── BeliefsPanel.tsx
│   │   ├── PatternsPanel.tsx
│   │   ├── EntitiesPanel.tsx
│   │   └── InsightsPanel.tsx
│   │
│   ├── timeline/
│   │   ├── TimelineScroller.tsx
│   │   ├── TimelineFilters.tsx
│   │   └── DateSeparator.tsx
│   │
│   ├── graph/
│   │   ├── MemoryGraphView.tsx
│   │   ├── GraphControls.tsx
│   │   └── SelectionDetailsPanel.tsx
│   │
│   └── shared/
│       ├── SalienceMeter.tsx
│       ├── EmotionIcon.tsx
│       ├── LoadingSkeleton.tsx
│       ├── ErrorState.tsx
│       └── EmptyState.tsx
│
├── lib/
│   ├── api/
│   │   ├── client.ts            # Base fetch wrapper
│   │   ├── memories.ts
│   │   ├── context.ts
│   │   ├── entities.ts
│   │   ├── beliefs.ts
│   │   ├── patterns.ts
│   │   ├── insights.ts
│   │   ├── summaries.ts
│   │   ├── chat.ts
│   │   └── graph.ts
│   │
│   ├── hooks/
│   │   ├── useMemories.ts
│   │   ├── useContextPackage.ts
│   │   ├── useEntities.ts
│   │   ├── useSpeechRecognition.ts
│   │   └── useWebSocket.ts
│   │
│   ├── stores/
│   │   ├── chatStore.ts
│   │   ├── overlayStore.ts
│   │   └── uiStore.ts
│   │
│   ├── utils/
│   │   ├── export.ts
│   │   ├── formatting.ts
│   │   └── colors.ts
│   │
│   └── types/
│       └── index.ts             # Shared types
│
├── styles/
│   └── globals.css              # Tailwind + custom styles
│
├── public/
│   └── ...
│
├── tailwind.config.ts
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

# TASK ESTIMATION SUMMARY

| Phase | Sessions | Key Deliverable |
|-------|----------|-----------------|
| P0: Scaffolding | 1 | Project setup, theme |
| P1: Chat Foundation | 2-3 | Working chat + STT |
| P2: Memory Context | 2-3 | Memory cards in chat |
| P3: Dashboard | 2 | Interactive dashboard |
| P4: Timeline | 2 | Scrollable memory view |
| P5: Graph | 2 | Network visualization |
| P6: Real-time | 2 | WebSocket, streaming |
| P7: Advanced | Ongoing | Reminders, calendar, etc. |

**Total MVP (P0-P4)**: ~10 sessions
**Full Feature Set (P0-P6)**: ~14 sessions

---

# DEPENDENCIES & ORDER

```
P0 (Scaffolding)
    │
    ▼
P1 (Chat) ──────────────────┐
    │                       │
    ▼                       │
P2 (Memory Context) ◄───────┘
    │
    ├──────────────┬────────────────┐
    ▼              ▼                ▼
P3 (Dashboard)  P4 (Timeline)   P5 (Graph)
    │              │                │
    └──────────────┴────────────────┘
                   │
                   ▼
            P6 (Real-time)
                   │
                   ▼
            P7 (Advanced)
```

**Notes**:
- P3, P4, P5 can be done in parallel after P2
- P6 can start partially during P3-P5
- P7 is ongoing/incremental

---

# SUCCESS CRITERIA

## Phase 0 Complete When:
- [ ] `pnpm dev` runs Next.js app on localhost:3001
- [ ] Tailwind theme shows cyber-futuristic colors
- [ ] API proxy works to backend

## Phase 1 Complete When:
- [ ] User can type message and receive LLM response
- [ ] STT button captures speech to text
- [ ] Messages display in styled bubbles
- [ ] Navigation works between routes

## Phase 2 Complete When:
- [ ] Memory cards appear during chat
- [ ] Cards show salience, emotions, content
- [ ] Cards are dismissible
- [ ] Export to .md works

## Phase 3 Complete When:
- [ ] Dashboard shows all panel types
- [ ] Data loads from API
- [ ] Panels are interactive
- [ ] Consistent visual style

## Phase 4 Complete When:
- [ ] Timeline scrolls smoothly
- [ ] Filters work
- [ ] Animations are smooth
- [ ] Focus from URL works

## Phase 5 Complete When:
- [ ] Graph renders nodes and edges
- [ ] Interactions work (click, hover)
- [ ] Controls filter the view
- [ ] Details panel shows info

## Phase 6 Complete When:
- [ ] Chat streams in real-time
- [ ] New memories appear live
- [ ] Reconnection works
- [ ] Polish complete

---

# NEXT STEPS

1. **Review this plan** - confirm phases make sense
2. **Review wiring diagram** - see SQUIRE-WEB-WIRING-DIAGRAM.md
3. **Start Phase 0** - scaffolding session
4. **Iterate** - adjust plan as we learn

