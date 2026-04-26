# Squire Agent Roadmap

**Goal:** Transform Squire from a personal assistant into an autonomous coding partner with a persistent agent loop.

**Architecture Reference:** `~/projects/cartography/squire-agent-architecture.md`

---

## Phase 1: Telegram Bridge

Connect Squire to Telegram as the primary mobile interface.

- [ ] Set up Telegram Bot (BotFather, get token)
- [ ] Implement long-polling listener in Node
- [ ] Route messages to existing Squire chat service
- [ ] Handle responses back to Telegram (text, code blocks)
- [ ] Test memory retrieval works via Telegram

**Outcome:** Can chat with Squire from phone, memory works.

---

## Phase 2: Agent Loop Core

Port the two-loop pattern from ridge-control concepts to TypeScript.

- [ ] Design AgentEngine state machine (Idle → Gathering → Streaming → Tools → Response)
- [ ] Implement inner loop: run until no tools called
- [ ] Implement outer loop: event-driven triggers
- [ ] Add turn tracking and conversation threading
- [ ] Handle graceful interruption/cancellation

**Outcome:** Agent can work autonomously until task complete.

---

## Phase 3: Coding Tools

Add file system and development tools.

- [ ] Read tool (file contents)
- [ ] Write tool (create/overwrite files)
- [ ] Edit tool (surgical string replacement)
- [ ] Bash tool (command execution with policies)
- [ ] Grep/Glob tools (search)
- [ ] Git operations (status, diff, commit)
- [ ] Tool policies and confirmation gates

**Outcome:** Agent can read, write, edit code and run commands.

---

## Phase 4: Mandrel Integration

Full MCP access for working memory.

- [ ] Connect agent to Mandrel MCP tools
- [ ] Auto-store context during work sessions
- [ ] Project switching based on work directory
- [ ] Task tracking integration
- [ ] Decision recording for architecture choices

**Outcome:** Agent uses Mandrel as working memory, tracks its own work.

---

## Phase 5: Model Routing

Multi-model orchestration for cost efficiency.

- [ ] Add Grok provider for cheap tasks
- [ ] Implement routing logic (task type → model selection)
- [ ] Define task categories (search, edit, complex, planning)
- [ ] Add Haiku for personal/lightweight tasks
- [ ] Specialist agent stubs (Code Review, Planner, Wizard)

**Outcome:** Right model for the right task, costs managed.

---

## Phase 6: Agent Memory

The agent's own learning system.

- [ ] Design lesson storage schema
- [ ] Define lesson criteria (what qualifies as a lesson)
- [ ] Implement lesson writing with careful prompting
- [ ] Add self-tuning notes (preferences for working with Brian)
- [ ] Memory preference adjustments (salience tuning)
- [ ] Lesson retrieval and injection into context

**Outcome:** Agent learns from experience, remembers what worked.

---

## Phase 7: Dogfooding

Agent works on itself.

- [ ] Agent can work on Squire codebase
- [ ] Agent can read its own logs and errors
- [ ] Feedback loops for self-improvement
- [ ] Monitoring and alerting integration
- [ ] Agent can suggest and implement its own improvements

**Outcome:** True self-improving system.

---

## Dependencies

```
Phase 1 (Telegram) ─────┐
                        ├──► Phase 2 (Loop) ──► Phase 3 (Tools) ──► Phase 7 (Dogfood)
Phase 4 (Mandrel) ──────┘           │
                                    ▼
                            Phase 5 (Routing)
                                    │
                                    ▼
                            Phase 6 (Agent Memory)
```

**Critical Path:** Phases 1-3 are sequential. Phase 4 can run in parallel with Phase 2. Phases 5-6 build on top. Phase 7 is the capstone.

---

## Quick Reference

| Phase | Core Deliverable | Key Decision |
|-------|------------------|--------------|
| 1 | Telegram bot | Long-polling, not webhooks |
| 2 | Agent loop | Two-loop pattern (inner runs until no tools) |
| 3 | Coding tools | Claude Code style (Read, Edit, Write, Bash) |
| 4 | Mandrel | Full MCP integration |
| 5 | Model routing | Grok for cheap, Claude for complex |
| 6 | Agent memory | Lessons + self-tuning |
| 7 | Dogfooding | Self-improvement capability |

---

## Current Status

**Completed:**
- [x] Squire running on Claude Opus 4.5
- [x] System prompt with Brian personality
- [x] Anthropic streaming in socket handler
- [x] Mandrel project created (squire-agent)
- [x] Architecture documented

**Next:** Phase 1 - Telegram Bridge

---

*Last Updated: 2026-02-01*
*Working Document: Break each phase into detailed plan when starting*
