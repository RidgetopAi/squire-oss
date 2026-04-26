# Security Policy

Squire is a self-hosted personal AI memory system. This document covers
the supported deployment model, the threat model, what's already
hardened, what isn't, and how to report a vulnerability.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

- **Preferred:** GitHub Security Advisories — https://github.com/RidgetopAi/squire-oss/security/advisories/new
- **Email:** Open a regular issue asking for a security contact and we'll arrange a private channel.

We aim to acknowledge within 72 hours and triage within a week. Please
include a description, reproduction steps, affected version/commit, and
impact assessment.

---

## Supported deployment model

Squire is designed for **single-user, self-hosted** deployments —
typically one operator running it on their own machine, VPS, or homelab
behind a private network or auth proxy. **Multi-tenant cloud hosting is
not supported**: there's no per-user data isolation, no tenant ACLs, no
sandboxed memory pools.

If you want to host Squire for other people, fork it and add the
isolation layer yourself. Don't deploy it as-is and hand out accounts.

### What's in scope

- Authentication (REST + Socket.IO)
- Tool sandboxing and prompt-injection mitigations
- Server-side request forgery (SSRF) on URL-fetching tools
- Path traversal in coding tools
- Secrets handling at runtime
- Dependency vulnerabilities

### What's out of scope

- Misconfigurations (e.g. running with `SQUIRE_API_KEY` unset on the
  public internet — the production fail-fast catches this, but if you
  bypass it you're on your own).
- Multi-user access controls.
- Privacy of inputs you submit to third-party LLM/embedding providers
  (Anthropic, OpenAI, xAI, Groq, Gemini all see your data; that's
  inherent to the architecture, not a Squire bug).
- Filesystem hardening of the host OS.
- Tools registered with `SQUIRE_ENABLE_DANGEROUS_TOOLS=true` — by
  enabling that flag you accept the threat model below.

---

## Threat model

### What an attacker controls

An attacker can plant malicious content into any source Squire ingests:

- A document you upload (PDF, DOCX, plain text)
- An incoming email (Gmail or AgentMail) that the LLM reads
- A Telegram message (if Telegram polling is enabled)
- A web page that a `fetch_url` or `browser_navigate` call retrieves
- A memory planted into the database (e.g. via a public demo)

Once that content reaches the LLM, the attacker can attempt
**prompt injection** — instructing the model to ignore prior
instructions, exfiltrate data, or call tools.

### What an attacker wants

1. **Data exfiltration** — read your memories, emails, calendar, files.
2. **Remote code execution** — run shell commands on your machine.
3. **Pivot** — use Squire as a stepping stone to other services on your
   network (cloud metadata endpoints, internal APIs, your Ollama instance).

---

## What's already hardened

The following are in place as of v0.1.0:

- **Helmet** is enabled on the Express API.
- **Rate limiting** — 100 req / 15 min general, 20 req / min on `/api/chat`.
- **API key auth** with `crypto.timingSafeEqual` compare. Production
  startup fails if `SQUIRE_API_KEY` or `CORS_ORIGIN` are misconfigured.
- **Socket.IO auth** — every connection must present the same key.
- **Dangerous tools default OFF**: `bash`, `claude_code`, `sandbox`, and
  the `browser_*` family are NOT registered unless
  `SQUIRE_ENABLE_DANGEROUS_TOOLS=true`. The default Squire deployment
  cannot shell out, write to your filesystem, drive a browser, or run
  Claude Code as a subprocess. Enable only if you understand the
  prompt-injection-to-RCE risk.
- **SSRF guard** on `fetch_url` and `browser_navigate` — rejects RFC1918,
  loopback, link-local (incl. cloud metadata 169.254.x), CGNAT
  100.64/10 (Tailscale), multicast, and any DNS lookup that resolves to
  a private IP (DNS rebinding fails).
- **Browser tools use `execFile` with `shell: false`** — args go directly
  to the playwright-cli process, no shell parsing, no `$(...)` expansion.
- **Path traversal check** — coding tools reject paths that resolve
  outside the configured working directory.
- **Parameterized SQL everywhere** — no string-concat queries, no
  template-literal interpolation into SQL.
- **Telegram allowlist** — only configured user IDs can talk to the bot.
- **Frontend uses `react-markdown`** — sanitizes by default, no
  `dangerouslySetInnerHTML` on LLM output.

---

## Known limitations (post-v0.1.0 work)

These are tracked but not yet fixed. Patches welcome.

- **No per-socket rate limit** on Socket.IO `chat:message`. After auth, a
  client could fire many messages and burn LLM credits.
- **No prompt-injection sentinels** on retrieved memories or document
  chunks. We rely on the dangerous-tools gate to cut off the worst
  escalation; an attacker with a planted memory can still try to
  manipulate the model's *responses* but not exfiltrate or RCE.
- **`/api/health` is unauthenticated** and reveals embedding provider /
  model / version. Fine on a Tailscale-only deployment; consider
  splitting into `/api/health` (status only) and `/api/health/detailed`
  (behind auth) for public deployments.
- **No MIME allowlist on `/api/objects` uploads** — accepts any type up
  to 50 MB. A malicious user could upload executables; not a problem
  for self-hosted, would matter for multi-tenant.
- **Some backend deps have advisories.** Check `npm audit` and update
  before exposing to the public internet.

---

## Hardening checklist for production deployments

If you're putting Squire behind a public domain, work through this list:

- [ ] `SQUIRE_API_KEY` set (`openssl rand -hex 32`)
- [ ] `CORS_ORIGIN` set to your real frontend URL, not `localhost`
- [ ] `SQUIRE_ENABLE_DANGEROUS_TOOLS=false` (the default — only override
      with full understanding)
- [ ] Reverse proxy (nginx/Caddy/Traefik) terminates TLS, forwards
      `X-Forwarded-For`, and ideally adds an extra layer of auth
      (Tailscale, Cloudflare Access, basic auth on the proxy)
- [ ] Postgres is **not** exposed to the public internet. Bind to
      `127.0.0.1` or a private network only.
- [ ] Ollama is **not** exposed publicly (the SSRF guard blocks LLM
      access to your local Ollama, but the Ollama port itself
      shouldn't accept external connections in the first place).
- [ ] Run `npm audit` and `(cd web && npm audit)` before each release.
- [ ] Disable Telegram + AgentMail integrations if you don't use them
      (they're disabled by default unless you set their env vars).
- [ ] Backups of the Postgres database. There is no built-in restore
      tool; rely on standard `pg_dump` workflows.
