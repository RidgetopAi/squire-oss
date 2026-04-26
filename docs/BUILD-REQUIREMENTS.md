# Squire Calendar & Reminders - Build Requirements

**Purpose**: Standard workflow for multi-session implementation. Follow these requirements every session.

---

## Session Startup (REQUIRED)

Before any implementation work:

1. **Read recent Mandrel context**
   ```
   context_get_recent
   ```

2. **Check current Mandrel tasks**
   ```
   task_list
   ```

3. **Read the tracker**
   - Open `docs/IMPLEMENTATION-TRACKER.md`
   - Note what's ✅ complete, 🔄 in progress, 🔲 pending

4. **Get task assignment from user**
   - User will specify which task(s) to work on
   - Confirm scope before starting

---

## During Implementation (REQUIRED)

### Before Adding Anything New

- [ ] Check `IMPLEMENTATION-TRACKER.md` for locked naming conventions
- [ ] Verify route/table/service names match the tracker exactly
- [ ] If something isn't in the tracker, add it before implementing

### Quality Gates

- [ ] TypeScript compiles: `npm run build` passes
- [ ] No type errors in new code
- [ ] Backend builds: `cd /home/ridgetop/projects/squire && npm run build`
- [ ] Frontend builds: `cd /home/ridgetop/projects/squire/web && pnpm build`

### After Completing Each Task

1. **Update Mandrel task status**
   ```
   task_update(taskId, status: "completed")
   ```

2. **Update IMPLEMENTATION-TRACKER.md**
   - Change status: 🔲 → ✅ for completed items
   - Add any new items discovered during implementation

3. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: <description>"
   git push
   ```

4. **Deploy to VPS** (if requested)
   ```bash
   ssh hetzner 'cd /opt/squire && sudo git pull && npm run build && sudo systemctl restart squire squire-web'
   ```

---

## Session End (REQUIRED)

Before ending any session:

### 1. Update IMPLEMENTATION-TRACKER.md

- Mark completed items ✅
- Mark in-progress items 🔄
- Add any new items discovered
- Note any blockers or issues

### 2. Store Mandrel Handoff Context

```
context_store(
  content: "## HANDOFF: [Date]\n\n### Completed\n- ...\n\n### In Progress\n- ...\n\n### Next Session\n- ...\n\n### Blockers\n- ...",
  type: "handoff",
  tags: ["handoff", "calendar-reminders", "phase-X"]
)
```

**Handoff must include:**
- What was completed (with file paths)
- What's in progress (with current state)
- What to do next (specific tasks)
- Any blockers or decisions needed
- Any edge cases discovered

### 3. Commit Tracker Updates

```bash
git add docs/IMPLEMENTATION-TRACKER.md
git commit -m "docs: update implementation tracker"
git push
```

---

## Code Standards

### Backend (Node.js/TypeScript)

- Services go in `src/services/`
- Routes go in `src/api/routes/`
- Use existing patterns from `memories.ts`, `chatExtraction.ts`
- All database queries use parameterized queries (no SQL injection)
- Use `pool.query()` for database access

### Frontend (Next.js/React)

- Pages go in `web/src/app/app/`
- Components go in `web/src/components/`
- Types go in `web/src/lib/types/`
- Use existing UI patterns from dashboard components
- Tailwind CSS for styling

### Database

- Migrations go in `schema/` with sequential numbering (018, 019, etc.)
- Run migrations: `psql -d squire -f schema/XXX_name.sql`
- VPS migrations: `ssh hetzner 'sudo -u postgres psql -d squire -f /opt/squire/schema/XXX_name.sql'`

---

## Edge Case Tracking

When you discover edge cases during implementation, add them here:

| Phase | Edge Case | Status | Notes |
|-------|-----------|--------|-------|
| - | - | - | - |

---

## Blockers Log

Track issues that block progress:

| Date | Blocker | Status | Resolution |
|------|---------|--------|------------|
| - | - | - | - |

---

## Reference Files

| Purpose | Path |
|---------|------|
| Implementation plan | `docs/CALENDAR-REMINDERS-PLAN.md` |
| Progress tracker | `docs/IMPLEMENTATION-TRACKER.md` |
| Existing schema | `schema/001-017*.sql` |
| Memory service (pattern) | `src/services/memories.ts` |
| Chat extraction (pattern) | `src/services/chatExtraction.ts` |
| Existing routes | `src/api/routes/` |
| Frontend types | `web/src/lib/types/index.ts` |

---

## VPS Deployment

| Item | Value |
|------|-------|
| SSH | `ssh hetzner` |
| App path | `/opt/squire` |
| Frontend | `https://squire.ridgetopai.net` |
| Backend service | `squire` (port 3001) |
| Frontend service | `squire-web` (port 3000) |
| Database | `squire` (PostgreSQL) |

---

## Mandrel Task Workflow

### Creating Tasks
```
task_create(title: "Phase 1.1: Create commitments migration")
```

### Updating Status
```
task_update(taskId: "xxx", status: "in_progress")
task_update(taskId: "xxx", status: "completed")
```

### Valid Statuses
- `todo` - Not started
- `in_progress` - Currently working
- `blocked` - Waiting on something
- `completed` - Done
- `cancelled` - No longer needed

---

## Quick Reference Commands

```bash
# Local build check
cd /home/ridgetop/projects/squire && npm run build

# Frontend build check
cd /home/ridgetop/projects/squire/web && pnpm build

# Run local backend
cd /home/ridgetop/projects/squire && npm run dev

# Run local frontend
cd /home/ridgetop/projects/squire/web && pnpm dev

# VPS deploy
ssh hetzner 'cd /opt/squire && sudo git pull && npm run build && sudo systemctl restart squire squire-web'

# VPS logs
ssh hetzner 'tail -f /var/log/squire.log'

# VPS database
ssh hetzner 'sudo -u postgres psql -d squire'
```
