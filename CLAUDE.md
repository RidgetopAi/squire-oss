# Working on Squire with Claude Code

This file is loaded as context whenever Claude Code is invoked in this
repo. Keep it focused on what an AI contributor needs to know.

## What Squire is

A self-hosted personal AI memory system. TypeScript on the backend
(Express + Socket.IO, ~36k LOC), Next.js on the frontend, Postgres +
pgvector for storage, multi-provider LLM (Anthropic / xAI / OpenAI /
Groq / Gemini / Ollama), Ollama for embeddings by default.

## Codebase layout

```
src/
├── api/          REST routes + Socket.IO handlers + middleware
├── cli.ts        commander-based CLI (`squire <command>`)
├── cli/setup.ts  interactive first-run onboarding
├── config/       single config object built from env
├── constants/    system prompts (loads persona at runtime)
├── db/           pg pool + migrate runner
├── providers/    LLM + embedding clients (provider abstractions)
├── services/     domain logic, grouped by concern:
│   ├── agent/        — the tool-use loop
│   ├── analytics/    — affect, salience, trends, emotional synthesis
│   ├── chat/         — extraction, context building, enhanced recall
│   ├── courier/      — proactive scheduler
│   ├── daily-brief/  — morning email summary
│   ├── documents/    — file extractors (pdf/docx/csv/ocr/text)
│   ├── expression/   — output filter for memory salience
│   ├── google/       — Gmail + Calendar
│   ├── knowledge/    — beliefs, entities, edges, graph, insights, memories, patterns
│   ├── llm/          — unified LLM call/stream interface
│   ├── planning/     — commitments, goals, lists, reminders, recurrence
│   ├── routing/      — smart vs fast tier model router
│   ├── steward/      — system health checks
│   ├── storage/      — notes, objects, scratchpad
│   ├── story/        — narrative generation engine
│   └── telegram/     — bot poller + handler
├── tools/        all LLM-callable tools, gated by SQUIRE_ENABLE_DANGEROUS_TOOLS
└── utils/        shared helpers (url-safety, etc.)

web/             Next.js frontend
schema/          numbered SQL migrations (run via `npm run db:migrate`)
prompts/         persona files (persona.example.md ships, persona.local.md is gitignored)
scripts/examples/ deploy templates
docs/            ARCHITECTURE, CONFIGURATION, INTEGRATIONS
```

## Conventions

- **TypeScript everywhere.** `npx tsc --noEmit` must pass before committing.
- **Parameterized SQL only.** Never string-concat into queries. `pg`
  uses `pool.query(text, values)`.
- **No `exec(string)`** in tools that take LLM input. Use
  `execFile(cmd, [args], { shell: false })`. See `src/tools/browser/exec.ts`.
- **SSRF**: any new tool that fetches a URL must call
  `assertPublicUrl()` from `src/utils/url-safety.ts`.
- **No direct `console.log` of config or env.** Logs go through
  `console.log` directly (no logging framework yet) but never dump
  the full config object — keys leak.
- **One responsibility per file.** Some legacy files (cli.ts, research.ts,
  chatExtraction.ts, entities.ts, knowledge/graph.ts) are oversized and
  scheduled for split — see the architecture review.

## Adding a new tool

1. Decide whether it's safe-by-default or dangerous (writes files,
   shells out, fetches URLs, drives a browser).
2. Create `src/tools/<name>.ts` with `tools: ToolSpec[]` export.
3. If safe → add to `safeToolSpecs` in `src/tools/index.ts`.
   If dangerous → add to `dangerousToolSpecs` and document the threat
   in SECURITY.md.
4. Tool descriptions are seen by the LLM. Use clear language. Avoid
   user-specific names — the persona system already personalizes;
   tool descriptions should stay generic.
5. Test by running `squire chat` and asking the model to call your tool.

## Adding a new schema migration

1. Create `schema/NNN_description.sql` (next number, snake_case).
2. Run `npm run db:migrate` to apply.
3. Migrations run in filename order; never edit a previously-applied
   migration. Roll forward only.

## Working on the persona / system prompt

The system prompt is in `src/constants/prompts.ts`. It loads the user's
persona from `config.persona.file` at module init. **Don't hardcode user
details into the prompt.** If you need to reference the user, use
`${USER_NAME}` (template literal) or generic phrasing ("the user").

## Working on memory extraction

`src/services/chat/chatExtraction.ts` is the heart of memory creation.
It's currently a 1300-line god-file scheduled for splitting. When
modifying:

- Few-shot examples in prompts use neutral names ("Alex", "Sarah",
  "Robert"). Don't introduce new names; pick from those.
- Extraction sensitivity is calibrated; if you change thresholds,
  run the test suite (`npm test`).

## Don'ts

- **Don't add personal/biographical content** to prompts, regexes, or
  examples. Phase 2 of the OSS refactor stripped this; don't reintroduce.
- **Don't introduce hardcoded paths** like `/opt/squire`. Everything
  goes through env vars.
- **Don't remove the dangerous-tools gate.** It's the single most
  important security control — every prompt-injection vector → RCE
  without it.
- **Don't commit `.env` files** even if they look harmless. The
  `.gitignore` covers them, but double-check.

## Useful commands

```bash
npm install                         # install deps
npx tsc --noEmit                    # type-check
npm run db:up                       # start Postgres in Docker
npm run db:migrate                  # apply migrations
npx tsx src/cli.ts setup            # interactive setup
npx tsx src/cli.ts chat             # interactive chat session
npm run dev                         # tsx watch mode
npm run dev:api                     # API only
npm run dev:web                     # frontend only
npm test                            # run test suite
bash test-fresh-install.sh          # clean-clone install verification
```
