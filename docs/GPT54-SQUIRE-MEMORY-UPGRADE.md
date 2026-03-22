# GPT-5.4 Review: Squire Memory Upgrade Plan

## Executive Summary

Squire already has the bones of a serious memory system: salience, embeddings, context profiles, beliefs, patterns, summaries, scratchpad, consolidation, and proactive outreach. The current system is good at **remembering facts, projects, and structured context**. It is weaker at **remembering felt experience, unfinished/finished transitions, and the evolving human shape of Brian over time**.

The central gap is this:

> Squire is better at storing **what happened** than carrying forward **what it meant**, **what changed**, and **what still matters now**.

Right now, Squire often knows:
- a plan was made
- a project exists
- a belief or preference was expressed
- a memory was important

But it does not consistently know:
- whether the plan became reality
- whether Brian felt energized, burdened, discouraged, relieved, or proud
- whether a thread is emotionally live even when not recently mentioned
- what unresolved tension sits underneath current work
- how this week compares to last week

That means Squire is still closer to **a very smart personal memory database** than **a long-term human partner with continuity of care and working awareness**.

This document proposes how to close that gap.

---

## The Core Design Diagnosis

### What Squire does well today

From the code and design docs, the current architecture already supports:

1. **Atomic memories with salience and strength**
   - `memories` track `salience_score`, `current_strength`, confidence, and tier.
   - This is a strong foundation for importance-aware memory.

2. **Semantic retrieval + profile-based context injection**
   - `generateContext()` combines salience, relevance, recency, and strength.
   - Context profiles and disclosure logging are thoughtful and production-grade.

3. **Beliefs, patterns, summaries, and graph structure**
   - Beliefs capture persistent self-knowledge and opinions.
   - Patterns can detect emotional/temporal/social tendencies.
   - Living summaries give a higher-level "what you know about them" layer.

4. **Scratchpad and agent goals**
   - There is already a notion of short-term working memory (`scratchpad`) and persistent agent intention (`squire_goals`).
   - This is exactly the right direction for moving beyond passive recall.

5. **Session/consolidation architecture**
   - The system has explicit sessions and a "sleep" phase.
   - That is the right place to turn raw experiences into continuity.

### Where the architecture is weak

The weaknesses are not mostly about missing vector search or poor retrieval. They are about **memory representation**.

#### 1. Memories are mostly event/fact shaped, not state/meaning shaped
The system stores:
- observations
- extracted memories
- beliefs
- patterns
- summaries

But it does not have a first-class layer for:
- emotional state over time
- live burdens / pressure sources
- unresolved concerns
- meaning transitions (planned -> started -> completed -> abandoned)
- support signals (what deserves a check-in)

So the model knows the story fragments but not the living state of the person.

#### 2. Context injection overweights retrieval and underweights continuity
`generateContext()` is strong for retrieving relevant solid memories, but it still behaves like an advanced selector over static records.

It lacks a dedicated **continuity layer** for things like:
- what changed since last conversation
- what completed since last conversation
- what remains open
- what is emotionally active despite low recent mention frequency
- what the AI should naturally follow up on

A good human partner starts from:
- “Here’s what changed”
- “Here’s what still seems alive”
- “Here’s what might need checking in on”

Squire currently starts more from:
- “Here are relevant memories and summaries”

#### 3. The completion delta problem is architectural, not incidental
Your example — design remembered, implementation not surfaced — is not just a ranking bug.

It reveals a missing model of **state transition memory**.

Today, a plan and a ship are two memories. The system may retrieve one and miss the other.

What is needed is a concept like:
- thread / initiative / workstream
- current state
- latest milestone
- last meaningful change
- confidence that this supersedes prior state

Without that, Squire can remember all pieces yet fail to present the current truth.

#### 4. Emotional texture is gestured at but not made first-class
The design docs mention emotional tagging. The summaries include `wellbeing`. Patterns include `emotional`.

But in practice, there is no strong “state of Brian lately” substrate. There is no stable representation of:
- stress trend
- energy trend
- discouragement / hope / pressure
- what felt heavy this week
- what felt meaningful or energizing
- what seemed avoided, sensitive, or painful

That’s a major reason support stays surface-level.

#### 5. No explicit layer for “felt but unspoken” context
Human closeness relies on carrying forward things like:
- what someone is worried about but not constantly mentioning
- what they are protecting
- where they are bruised or tender
- what topics should be approached gently
- what has existential weight

Beliefs and summaries capture some of this indirectly, but there is no explicit representation of:
- vulnerabilities
- pressure domains
- protective priorities
- latent grief/disappointment/fear

This is the difference between knowing a biography and knowing a person.

#### 6. Longitudinal memory is underpowered
Patterns exist, but the context system does not appear to strongly surface:
- changes across weeks
- momentum or stall
- repeated returns to the same unresolved problem
- whether mood/energy is improving or degrading

A friend notices drift. Squire mainly notices documents.

#### 7. Working memory exists, but is not yet the center of the architecture
Scratchpad is promising, but it appears sidecar rather than central.

For a personal agent, working memory should be a top-level bridge between:
- raw new observations
- active open loops
- near-term follow-up needs
- recently completed transitions
- the next conversation’s opening awareness

Today, scratchpad is available. It is not yet the primary continuity engine.

---

## The Real Architectural Shift Needed

Squire should evolve from a system centered on **memory retrieval** to one centered on **stateful relationship continuity**.

That means introducing a model with at least four distinct layers:

1. **Episodic Memory** — what happened
2. **Semantic Self Model** — who Brian is
3. **State & Trajectory Model** — how Brian seems to be doing lately
4. **Active Continuity / Working Memory** — what is currently alive, changing, unresolved, or newly completed

Squire has (1) and much of (2).
It partially has fragments of (3).
It has a weak version of (4).

That is the gap.

---

## Proposed Upgrade: A Four-Layer Memory Model

## Layer A: Episodic Memory (keep, refine)

This is the current `memories` system.

Role:
- store observations/events/facts
- retain salience, embedding, confidence, source
- support semantic retrieval and evidence chains

### Improvements to Layer A

1. **Add memory state transition metadata**
   Add explicit metadata for memories that describe progress changes:
   - `thread_id` / `initiative_id`
   - `state_transition_type`: planned | started | blocked | resumed | completed | abandoned
   - `supersedes_memory_id`
   - `transition_confidence`

2. **Track “this changed reality” memories differently**
   Some memories should be marked as state-updating rather than merely descriptive.
   Example:
   - “We planned the job hunter” = planning state
   - “I finished the job hunter” = current-state update

3. **Prefer latest valid state over prior mention frequency**
   In context generation, when a newer state transition supersedes an older one, it should outrank the earlier memory even if the earlier one has more reinforcement.

This solves the “planned but not shipped” gap.

---

## Layer B: Semantic Self Model (expand)

This is currently spread across beliefs, summaries, relationships, goals, preferences.

Role:
- answer “who is Brian?”
- provide durable identity and personality understanding
- track preferences, values, working style, relationships, life context

### Improvements to Layer B

1. **Separate stable self-knowledge from dynamic current state**
   Keep these distinct:
   - durable: values, identity, working style, relationships, recurring preferences
   - dynamic: current pressure, motivation, emotional state, live concerns

2. **Add first-class “protective priorities” and “vulnerability themes”**
   Create explicit representations for:
   - what Brian is trying to protect
   - what hurts disproportionately
   - what failure modes recur
   - what support style works best when stressed

Possible examples:
- “Brian fears wasting his potential in the day job.”
- “Rejection around competence/recognition carries unusually high weight.”
- “He is protective of his wife and family stability.”
- “He responds best to grounded encouragement plus concrete next steps, not generic reassurance.”

These are not just beliefs. They are **relationship-critical support primitives**.

3. **Introduce confidence + sensitivity flags**
   Some self-model items should carry:
   - confidence
   - sensitivity
   - freshness
   - whether proactive mention is appropriate

This prevents the model from becoming intrusive.

---

## Layer C: State & Trajectory Model (new, crucial)

This is the biggest missing piece.

Role:
- represent the person as moving through time
- answer “how has Brian been lately?”
- support emotionally intelligent continuity

### New concept: `state_snapshots`
Create a periodic, generated layer that summarizes recent internal state.

Proposed fields:
- `period_start`, `period_end`
- `stress_level` (0-1 or 1-5)
- `energy_level`
- `motivation_level`
- `emotional_tone` (hopeful, burdened, discouraged, energized, scattered, steady, etc.)
- `dominant_pressures` (JSON array)
- `dominant_energizers` (JSON array)
- `open_loops_summary`
- `confidence`
- `source_memory_ids`
- `generated_by_model`

These are not truths. They are **best-effort inferred state estimates**.

### Why this matters
The model should be able to say internally:
- “He seems more energized this week.”
- “This topic has been quietly heavy for several days.”
- “He got something important done and may need that recognized.”
- “He keeps circling this same decision.”

That requires explicit temporal state summarization, not just raw memory retrieval.

### New concept: `trajectory_signals`
Track trends across snapshots:
- stress increasing / decreasing
- energy increasing / decreasing
- project momentum improving / stalling
- burden concentration by domain (job, family, startup, health)
- confidence trend around a particular initiative

This gives Squire a way to notice drift.

---

## Layer D: Active Continuity / Working Memory (promote to first-class)

This should become the heart of session continuity.

Role:
- carry what is currently alive between conversations
- bridge “yesterday” and “today”
- surface recent completions, unresolved items, and follow-up opportunities

The current scratchpad is the seed of this, but it needs to become more structured.

### New concept: `continuity_threads`
Introduce a first-class thread model for active lines of life/work.

Each thread represents something like:
- a project
- a pressure source
- a relationship situation
- a family concern
- a health concern
- a meaningful internal struggle

Suggested fields:
- `id`
- `title`
- `thread_type` (project, emotional, relationship, family, health, admin, identity, etc.)
- `status` (active, watch, blocked, resolved, dormant)
- `importance`
- `emotional_weight`
- `last_meaningful_update_at`
- `last_state_change_at`
- `current_state_summary`
- `next_followup_question`
- `last_completion_at`
- `related_entity_ids`
- `related_memory_ids`
- `source_confidence`

### Why threads matter
This lets Squire know that:
- “job hunter” is not two random memories but one ongoing thread
- “wife caregiving situation” is not just a fact but a continuing situation
- “Anthropic rejection” may belong to a deeper thread around recognition / direction / career wound

### New concept: `continuity_events`
Whenever something important changes, append a continuity event:
- thread created
- thread escalated
- completion logged
- blocked state detected
- emotional weight increased
- support-needed flag added

Then at conversation start, the model can be shown:
- what changed since last talk
- what remains open
- what may deserve acknowledgment

This is the fix for recent-session continuity.

---

## Specific Design Changes Recommended

## 1. Add a "What Changed Since Last Time" preamble

At conversation start, before generic relevant context, provide a compact continuity preamble with sections like:

- **Changed since last conversation**
- **Recently completed**
- **Still active / unresolved**
- **Potentially worth checking in on**
- **Emotional/weather note**

Example shape:

```markdown
# Continuity Since Last Time

## Changed Since Last Conversation
- Brian finished the job hunter implementation after previously discussing the design.
- He moved from planning to shipped state on that thread.

## Recently Completed
- Job hunter shipped.

## Still Active
- Balancing day job with bigger ambitions remains a live pressure.
- Wife caregiving context likely still has background emotional weight.

## Emotional Weather
- Recent signals suggest determined but stretched.
```

This should not rely on simple retrieval. It should be generated from continuity threads and recent state transitions.

---

## 2. Add explicit completion detection and supersession logic

The current system needs a hard concept of:
- plan
u2192 implementation
u2192 completed
n- concern
u2192 addressed
n- hypothesis
u2192 confirmed
n- open loop
u2192 closed

### Recommended implementation
- Add `continuity_threads`
- Detect status-changing utterances during extraction/consolidation
- Update thread state rather than only writing another memory
- Preserve evidence chain back to memories

### Important principle
Context should prefer:
- latest authoritative thread state
nover
- older high-salience discussion memories

---

## 3. Make emotional state inference a real subsystem

You do not need “perfect emotion detection.” You need **useful emotional continuity**.

### Recommended new subsystem: `affect.ts`
Responsibilities:
- infer emotional signals from memories/messages
- classify emotions, intensity, direction, and domain
- aggregate into daily/weekly state snapshots

Signal types:
- burden / pressure
- discouragement / hurt
- hope / excitement
- pride / relief
- anxiety / uncertainty
- tenderness / concern
- resentment / frustration
- steadiness / groundedness

Store both:
- per-memory affect annotations
- aggregated time-window summaries

### Why aggregate matters
A single message is noisy.
A week of signals is meaningful.

---

## 4. Create a “support model,” not just a fact model

A partner doesn’t just know facts. They know how to respond.

Introduce a layer for:
- what kind of support helps Brian when he’s stressed
- what tends to make things worse
- when to challenge versus when to steady
- what should be acknowledged explicitly

This could live in a new table or in structured belief/self-model records.

Potential categories:
- `support_preference`
- `trigger_sensitivity`
- `care_guideline`
- `encouragement_style`

Examples:
- “When overloaded, Brian responds better to narrowing to one concrete next action.”
- “He dislikes vague motivational language when under pressure.”
- “Recognition of completed work matters more than generic praise.”

This becomes a major differentiator.

---

## 5. Use scratchpad as a dynamic activation layer, not just a note bin

Scratchpad should be auto-populated and auto-maintained by the system.

Suggested uses:
- promote newly active continuity threads into scratchpad
- add temporary “follow up next conversation” entries
- add “do not forget this changed” entries
- auto-resolve entries when completion is detected

### Key rule
Scratchpad should hold:
- **active cognitive load**, not archival memory

Good scratchpad items:
- “Brian finished the job hunter — acknowledge next time.”
- “Day job vs bigger ambition remains emotionally loaded.”
- “Ask gently about wife caregiving context if relevant opening appears.”
- “Anthropic rejection still seems like a live wound / caution zone.”

This turns scratchpad into true working memory.

---

## 6. Add a “live concerns” layer for the unspoken stuff

Create a first-class table or structured summary set for concerns with fields like:
- concern
- domain
- emotional_weight
- confidence
- evidence recency
- followup appropriateness
- stale_after

Examples:
- fear of stagnation in day job
- concern about wife’s burden
- disappointment around rejection / recognition
- anxiety about momentum slipping on bigger vision

These should not all be surfaced directly to Brian. They should shape tone, follow-up, and prioritization.

That is the distinction between:
- memory as record
- memory as care

---

## 7. Longitudinal summaries should compare periods, not just accumulate

Current summaries are mostly cumulative. Add comparative summaries such as:
- this week vs last week
- last 30 days trend
- improving / worsening / unchanged

Potential generated outputs:
- `weekly_state_summary`
- `project_momentum_summary`
- `relationship_attention_summary`
- `support_opportunities_summary`

Questions they should answer:
- What has become heavier?
- What has become lighter?
- What is repeatedly deferred?
- What got completed and should be recognized?
- What theme is quietly recurring?

---

## 8. Rebalance context assembly: continuity before retrieval

Today `generateContext()` is basically:
- fetch relevant memories
- score them
- add summaries/notes/lists/docs
nIt should become more like:

1. continuity preamble
2. current state summary
3. recently changed / completed items
4. active threads
5. durable self-model
6. relevant episodic memories
7. notes/lists/docs as supporting evidence

### Proposed new context order

```markdown
# Current Continuity
# How Brian Seems Lately
# Active Threads
# What You Know About Them
# Relevant Context
# Relevant Notes / Lists / Documents
```

That better matches how a close person “loads” context.

---

## 9. Separate "Brian memory" from "agent work memory"

You want Squire to know Brian and also serve as working memory for the model.
These are related but not identical.

I recommend explicitly splitting memory into two top-level domains:

### A. Human model memory
For:
- identity
- emotional state
- values
- relationships
- life context
- support signals

### B. Agent execution memory
For:
- active tasks
- working hypotheses
- tool outcomes
- plans vs completions
- unresolved implementation threads
- session handoff / recent wins

Today these blur together.
That causes the model to sometimes surface design discussion but miss ship status.

A clean approach:
- continue using `scratchpad`, `squire_goals`, and task context for agent work memory
- add continuity threads and state snapshots for the Brian relationship model
- then combine both during context assembly depending on conversation mode

For example:
- work / coding conversation: heavier weight on agent execution continuity
- personal conversation: heavier weight on Brian state + support continuity
- mixed conversation: both

---

## Recommended Concrete Implementation Plan

## Phase 1 — Fix continuity failures fast (1-3 days)

### Goals
- solve the “planned but not shipped” problem
- make recent completions show up at conversation start
- improve continuity without deep schema upheaval yet

### Changes
1. **Add continuity preamble generation to `generateContext()`**
   - derive from recent memories + scratchpad + sessions + commitments
   - explicitly compute:
     - recent completions
     - recent changes
     - open threads

2. **Add extraction of state-transition markers**
   - detect planned / started / blocked / completed / abandoned in `chatExtraction.ts`
   - store in `source_metadata` initially if you want a low-migration path

3. **Auto-create scratchpad continuity entries on important state changes**
   - e.g. completion, new burden, unresolved blocker
   - auto-expire or resolve them after surfacing

4. **Add “recently completed” section ahead of summaries**
   - this alone will materially improve perceived memory continuity

### Why Phase 1 matters
It gives visible improvement quickly and validates the direction.

---

## Phase 2 — Add structured continuity threads (3-7 days)

### Goals
- unify scattered memories into living threads
- represent current state rather than only stored fragments

### New schema
- `042_continuity_threads.sql`
- `043_continuity_events.sql`

### Core service
- `src/services/continuity.ts`

Responsibilities:
- create/update threads
- infer thread state transitions
- surface stale active threads
- generate “what changed since last time”
- generate “what remains open”

### Initial thread types
- project
- work-pressure
- family
- health
- relationship
- identity/career
- emotional-load

### Retrieval behavior
At context generation time, include the top active threads by:
- recency of meaningful update
- importance
- emotional weight
- unresolved status

---

## Phase 3 — Add state snapshots and emotional continuity (4-8 days)

### Goals
- give Squire a sense of how Brian has been lately
- support natural, caring follow-up

### New schema
- `044_state_snapshots.sql`
- optional `045_concern_signals.sql`

### New services
- `src/services/affect.ts`
- `src/services/stateSnapshots.ts`

### Snapshot cadence
- daily or per-session-end
- weekly rollup

### Output examples
- “This week Brian seems more energized but still stretched.”
- “Work momentum improved after shipping job hunter.”
- “Family/caregiving context remains background-heavy.”

### Important guardrail
These should be marked as inferred, confidence-weighted, and non-authoritative.

---

## Phase 4 — Build the support model (3-5 days)

### Goals
- move from recall to helpful companionship
- improve emotional fit of responses

### New structured memory types
- support_preference
- trigger_sensitivity
- protective_priority
- vulnerability_theme

### Use in prompt/context
These should shape:
- tone
- follow-up style
- whether to acknowledge completion
- whether to be gentle/direct
- whether to ask or simply hold awareness

This is where Squire starts to feel like it knows Brian rather than only knowing data about Brian.

---

## Phase 5 — Longitudinal trend intelligence (later, high leverage)

### Goals
- notice drift
- detect momentum/stall
- identify recurring patterns with practical value

### Improvements
1. Upgrade patterns to use embeddings and stronger temporal aggregation.
2. Generate trend summaries over 7/30-day windows.
3. Detect repeated return-to-problem loops.
4. Track project momentum and emotional burden by domain.

### Why later
This layer is powerful, but continuity/state fixes should come first.

---

## Code-Level Recommendations

## `src/services/context.ts`

This is the most important file to evolve first.

### Add before memory retrieval output:
- `buildContinuityPreamble(conversationId?)`
- `getRecentCompletions()`
- `getActiveThreads()`
- `getCurrentStateSnapshot()`
- `getCheckInCandidates()`

### Change output order
From:
- schedule
- summaries
- memories
- notes/lists/documents

To:
- schedule
- continuity preamble
- current state snapshot
- active threads
- summaries
- memories
- notes/lists/documents

## `src/services/chatExtraction.ts`

Enhance extraction to identify:
- progress transitions
- completion language
- burden / strain / energy signals
- emotionally loaded topics
- support-relevant signals

This does **not** have to create many new memories.
It can instead update continuity/state layers.

## `src/services/scratchpad.ts`

Promote it from utility to automatic continuity bridge.

Add helpers like:
- `upsertContinuityEntry()`
- `resolveEntriesForThread()`
- `listHighPriorityContinuityEntries()`

## `src/services/summaries.ts`

Keep current summaries, but add a separate summary class for:
- current state
- recent trend
- emotional weather
- live concerns

Do not overload the durable identity summaries with dynamic week-to-week state.

## `src/services/patterns.ts`

This is promising but incomplete.
Notably:
- no embedding-based similarity yet
- likely not central enough in context generation

Use patterns more as evidence feeding the state/trajectory layer rather than directly as primary user-facing context.

---

## Principles to Preserve

A few things in the current design are strong and should remain central:

1. **Salience-first philosophy**
   Good and differentiating.

2. **Consolidation / sleep metaphor**
   Very right. Keep investing here.

3. **Disclosure logging**
   Essential, especially as memory gets more intimate.

4. **Profile-based context**
   Keep it, but add continuity-aware assembly on top.

5. **Single-human design**
   This focus is a strength, not a limitation.

---

## The Most Important Product Insight

To move from “knowing about Brian” to “knowing Brian,” Squire must remember not just:
- facts
- preferences
- projects
- semantic matches

It must also remember:
- what changed
- what remains unresolved
- what carried emotional weight
- what has been getting heavier or lighter
- what deserves acknowledgment
- what should be held gently in the background

In other words:

> The next leap is not better retrieval. It is better continuity of significance.

That means upgrading Squire into a system that maintains:
- a **self model**,
- a **state model**,
- a **continuity model**,
- and a **working memory model**,
all connected to episodic evidence.

That is the path from personal memory system to genuine long-term partner memory.

---

## Priority Recommendations

If only a few things are done next, I would prioritize them in this order:

### Top 5
1. **Add continuity preamble to context generation**
2. **Add explicit completion / state transition tracking**
3. **Create continuity threads for ongoing life/work situations**
4. **Add daily/weekly inferred state snapshots (stress/energy/emotional weather)**
5. **Create a support model for how to respond well to Brian**

### Highest immediate ROI
If you want the biggest improvement quickly:
- implement recent completions + changed-since-last-time + active threads

That alone will make Squire feel much more continuous.

### Highest long-term differentiator
If you want the deepest moat:
- implement emotional/state snapshots + vulnerability/protective-priority modeling

That is what turns the system from smart memory to relational memory.

---

## Closing

Squire is already unusually thoughtful. The current architecture proves the concept: salience, consolidation, summaries, beliefs, graph, context injection. The next step is not starting over. It is **completing the picture**.

The design should evolve from:
- “What memories are relevant?”

to:
- “What is true now?”
- “What changed?”
- “What matters underneath the facts?”
- “How has Brian been?”
- “What should a caring, competent partner naturally carry forward?”

That is the upgrade path.
