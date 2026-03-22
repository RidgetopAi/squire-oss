# Squire Calendar & Reminders - Build Requirements

**Purpose**: Standard workflow for multi-session implementation. Follow these requirements every session.

---

## Session Startup (REQUIRED)

Before any implementation work:

1. **Read the tracker**
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
- [ ] Backend builds: `npm run build`
- [ ] Frontend builds: `cd web && pnpm build`

### After Completing Each Task

1. **Update IMPLEMENTATION-TRACKER.md**
   - Change status: 🔲 → ✅ for completed items
   - Add any new items discovered during implementation

3. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: <description>"
   git push
   ```

4. **Deploy to production** (if requested)
   ```bash
   cd $SQUIRE_PRODUCTION_DIR && sudo git pull && npm run build && sudo systemctl restart squire squire-web
   ```

---

## Session End (REQUIRED)

Before ending any session:

### 1. Update IMPLEMENTATION-TRACKER.md

- Mark completed items ✅
- Mark in-progress items 🔄
- Add any new items discovered
- Note any blockers or issues

### 2. Commit Tracker Updates

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
- Production migrations: `sudo -u postgres psql -d squire -f $SQUIRE_PRODUCTION_DIR/schema/XXX_name.sql`

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

## Production Deployment

| Item | Value |
|------|-------|
| App path | `$SQUIRE_PRODUCTION_DIR` |
| Frontend | `https://your-domain.com` |
| Backend service | `squire` (port 3001) |
| Frontend service | `squire-web` (port 3000) |
| Database | `squire` (PostgreSQL) |

---

## Quick Reference Commands

```bash
# Local build check
npm run build

# Frontend build check
cd web && pnpm build

# Run local backend
npm run dev

# Run local frontend
cd web && pnpm dev

# Production deploy
cd $SQUIRE_PRODUCTION_DIR && sudo git pull && npm run build && sudo systemctl restart squire squire-web

# Production logs
tail -f /var/log/squire.log

# Production database
sudo -u postgres psql -d squire
```
