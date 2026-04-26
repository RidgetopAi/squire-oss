# SQUIRE WEB - BUILD HANDOFF GUIDE

## Purpose

This document provides instructions for any agent (or human) picking up the Squire Web App build. It establishes the workflow, conventions, and procedures to maintain consistency and traceability.

---

# PROJECT CONTEXT

## What We're Building

**Squire Web App** - A chat-first web interface for the Squire AI memory system.

**Core Philosophy**: "AI memory that knows the user" - not just data retrieval, but genuine knowing that compounds over time.

**Visual Direction**: Cyber-futuristic dark mode with neon glows, gold accents, animated cards, and an experience that feels like the future.

## Key Documents

| Document | Location | Purpose |
|----------|----------|---------|
| Design Vision | `docs/SQUIRE-DESIGN-PLAN.md` | Original architecture & philosophy |
| Implementation Plan | `docs/SQUIRE-WEB-IMPLEMENTATION-PLAN.md` | Phased tasks, component architecture |
| Wiring Diagram | `docs/SQUIRE-WEB-WIRING-DIAGRAM.md` | API connections, status tracking |
| This Handoff | `docs/SQUIRE-WEB-BUILD-HANDOFF.md` | Build procedures & conventions |

## Tech Stack

- **Frontend**: Next.js 15, React 18, TypeScript
- **Styling**: Tailwind CSS with custom cyber-futuristic theme
- **State**: TanStack Query (server), Zustand (UI)
- **Animation**: Framer Motion
- **Real-time**: Socket.IO
- **Backend**: Existing Express API (extended)

---

# BUILD WORKFLOW

## Starting a Session

1. **Connect to Mandrel**
   ```
   project_switch squire
   context_get_recent 5
   ```

2. **Check Current Task**
   ```
   task_list
   ```
   Find the next `todo` task in the current phase (P0, P1, etc.)

3. **Read Relevant Context**
   - Review `SQUIRE-WEB-IMPLEMENTATION-PLAN.md` for task details
   - Check `SQUIRE-WEB-WIRING-DIAGRAM.md` for API dependencies

4. **Set Task In Progress**
   ```
   task_update taskId="<id>" status="in_progress"
   ```

## During Development

### For Each Task:

1. **Implement the Feature**
   - Follow component architecture in implementation plan
   - Use existing patterns from codebase
   - Maintain TypeScript strict mode

2. **Update Wiring Diagram**
   - Change status from `⬜` to `🔧` when starting
   - Change to `✅` when complete
   - Add any new endpoints discovered
   - Update the UPDATE LOG at the bottom

3. **Test Your Work**
   - Run `pnpm dev` to test frontend
   - Run `pnpm dev:api` to test backend
   - Verify API connections work

4. **Commit and Push**
   ```bash
   git add .
   git commit -m "P<phase>-T<task>: <description>"
   git push
   ```
   
   Commit message format examples:
   - `P0-T1: Initialize Next.js 15 web app`
   - `P1-T2: Build chat UI components`
   - `P2-T4: Wire context to chat flow`

5. **Update Mandrel Task**
   ```
   task_update taskId="<id>" status="completed"
   ```

## Ending a Session

1. **Store Handoff Context in Mandrel**
   ```
   context_store type="handoff" content="<handoff notes>"
   ```
   
   Include:
   - What was completed
   - Current state of the build
   - Any blockers or decisions made
   - What should be done next

2. **Update Implementation Plan** (if needed)
   - Mark checkboxes as completed
   - Add notes about deviations
   - Update estimates if tasks took longer/shorter

3. **Update Wiring Diagram**
   - Add entry to UPDATE LOG
   - Update component/API status

---

# WIRING DIAGRAM USAGE

## Purpose

The wiring diagram (`SQUIRE-WEB-WIRING-DIAGRAM.md`) is the source of truth for:
- What frontend components exist
- What API endpoints they depend on
- What's connected vs. what's pending

## Status Icons

| Icon | Meaning |
|------|---------|
| ✅ | Wired and working |
| 🔧 | In progress |
| ⬜ | Not started |
| 🆕 | New endpoint needed (backend work) |

## When to Update

Update the wiring diagram when you:
- Start working on a component (⬜ → 🔧)
- Complete a component (🔧 → ✅)
- Create a new API endpoint
- Add a new hook or API client function
- Discover a missing dependency

## Sections to Update

1. **Backend API Endpoints** - Track existing and new endpoints
2. **WebSocket Events** - Track real-time event definitions
3. **Frontend Components → API Mapping** - Main tracking table
4. **API Client Functions** - Track `lib/api/*.ts` implementations
5. **Hooks** - Track `lib/hooks/*.ts` implementations
6. **UPDATE LOG** - Add entry for each session

---

# MANDREL WORKFLOW

## Task Lifecycle

```
todo → in_progress → completed
```

## Commands Reference

| Action | Command |
|--------|---------|
| List tasks | `task_list` |
| Start task | `task_update taskId="<id>" status="in_progress"` |
| Complete task | `task_update taskId="<id>" status="completed"` |
| Get task details | `task_details taskId="<id>"` |
| Store context | `context_store type="<type>" content="<content>"` |
| Get recent context | `context_get_recent <limit>` |
| Search context | `context_search query="<query>"` |

## Context Types

| Type | When to Use |
|------|-------------|
| `handoff` | End of session, next agent pickup |
| `completion` | Feature/task completed |
| `decision` | Technical decision made |
| `planning` | Planning notes |
| `error` | Error encountered and resolution |

---

# COMMIT CONVENTIONS

## Message Format

```
P<phase>-T<task>: <short description>

<optional longer description>
```

## Examples

```
P0-T1: Initialize Next.js 15 web app

- Created squire/web directory
- Configured TypeScript and ESLint
- Added path aliases
```

```
P1-T4: Create /api/chat endpoint with LLM integration

- Added chat route to Express server
- Integrated with Groq LLM provider
- Accepts message, conversationId, context
```

## When to Commit

- After each task is complete
- At logical stopping points within large tasks
- Before ending a session

---

# DOCUMENTATION REQUIREMENTS

## After Completing a Task

Update these as needed:

1. **Wiring Diagram** - Component/API status
2. **Implementation Plan** - Check off completed items
3. **Code Comments** - Only if complex logic needs explanation
4. **README** (if significant) - Usage instructions

## If Something Changes

Document deviations in:
- Implementation Plan (add note to task)
- Wiring Diagram (add to UPDATE LOG)
- Handoff context (explain why)

---

# HANDOFF CONTEXT TEMPLATE

When storing handoff context to Mandrel, use this structure:

```
## Session Summary
- Date: YYYY-MM-DD
- Tasks Completed: P<x>-T<y>, P<x>-T<z>
- Phase Progress: <current phase> (<percent>% complete)

## What Was Built
- <component/feature 1>
- <component/feature 2>

## Changes from Plan
- <any deviations and why>

## Current State
- Web app runs: yes/no
- Chat works: yes/no
- <other status>

## Blockers / Issues
- <any problems encountered>

## Next Up
- Next task: P<x>-T<y>
- Dependencies: <anything needed before starting>
- Notes: <helpful context for next session>
```

---

# QUICK START FOR NEW SESSION

```bash
# 1. Navigate to project
cd ~/projects/squire

# 2. Check Mandrel for context
project_switch squire
context_get_recent 3
task_list

# 3. Find next task (first 'todo' in current phase)
# 4. Read implementation plan for task details
# 5. Set task in_progress
task_update taskId="<id>" status="in_progress"

# 6. Start dev servers (once web app exists)
cd web && pnpm dev      # Frontend on :3001
cd .. && pnpm dev:api   # Backend on :3000

# 7. Implement task
# 8. Update wiring diagram
# 9. Commit and push
git add .
git commit -m "P<x>-T<y>: <description>"
git push

# 10. Mark complete
task_update taskId="<id>" status="completed"

# 11. Store handoff (end of session)
context_store type="handoff" content="..."
```

---

# PHASE OVERVIEW

| Phase | Focus | Tasks |
|-------|-------|-------|
| P0 | Scaffolding | 5 tasks - Project setup, theme, structure |
| P1 | Chat Foundation | 6 tasks - Working chat with LLM + STT |
| P2 | Memory Context | 6 tasks - Memory cards, overlays, export |
| P3 | Dashboard | 8 tasks - All dashboard panels |
| P4 | Timeline | 6 tasks - Scrollable memory timeline |
| P5 | Graph | 6 tasks - Network visualization |
| P6 | Real-time | 6 tasks - WebSocket, streaming, polish |

**MVP = P0-P4** (~10 sessions)
**Full Feature = P0-P6** (~14 sessions)

---

# CURRENT STATUS

**Phase**: P0 (Not Started)
**Next Task**: P0-T1: Initialize Next.js 15 Web App in squire/web/

**Prerequisites**:
- Node.js 20+ installed
- pnpm installed (recommended) or npm
- Existing Squire backend running

---

# CONTACT / ESCALATION

If blocked:
1. Check existing docs and implementation plan
2. Search Mandrel context for prior decisions
3. Consult Oracle for technical guidance
4. Document the issue in handoff context

---

*Last Updated: 2025-12-27*
*Created By: Planning Session*
