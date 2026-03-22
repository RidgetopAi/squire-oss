# Squire Calendar & Reminders - Implementation Tracker

**Created**: 2025-12-28
**Plan Document**: [CALENDAR-REMINDERS-PLAN.md](./CALENDAR-REMINDERS-PLAN.md)

---

## Phase Status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Core Commitments | ✅ Complete |
| 2 | Reminders + PWA Push | ✅ Complete |
| 3 | Google Calendar Sync | ✅ Complete |
| 4 | Recurrence (RRULE) | ✅ Complete |
| 5 | Resolution Detection | ✅ Complete |

---

## Schema (Migrations)

| Table | Migration | Status | Notes |
|-------|-----------|--------|-------|
| `commitments` | 018_commitments.sql | ✅ | Core commitment tracking |
| `reminders` | 019_reminders.sql | ✅ | Scheduled notifications |
| `google_accounts` | 020_google_integration.sql | ✅ | OAuth tokens |
| `google_calendars` | 020_google_integration.sql | ✅ | Which calendars to sync |
| `google_events` | 020_google_integration.sql | ✅ | Cached Google events |
| `push_subscriptions` | 021_push_subscriptions.sql | ✅ | PWA push endpoints |

---

## API Routes (Backend)

### Commitments - `/api/commitments`

| Method | Route | Status | Handler | Notes |
|--------|-------|--------|---------|-------|
| GET | `/api/commitments` | ✅ | list | Filter by status, due date |
| POST | `/api/commitments` | ✅ | create | Manual creation |
| GET | `/api/commitments/:id` | ✅ | get | Single commitment |
| PATCH | `/api/commitments/:id` | ✅ | update | Edit commitment |
| DELETE | `/api/commitments/:id` | ✅ | delete | Remove commitment |
| POST | `/api/commitments/:id/resolve` | ✅ | resolve | Mark complete/cancel |
| POST | `/api/commitments/:id/snooze` | ✅ | snooze | Postpone |

### Reminders - `/api/reminders`

| Method | Route | Status | Handler | Notes |
|--------|-------|--------|---------|-------|
| GET | `/api/reminders` | ✅ | list | Upcoming reminders |
| POST | `/api/reminders` | ✅ | create | Standalone reminder |
| DELETE | `/api/reminders/:id` | ✅ | delete | Cancel reminder |
| POST | `/api/reminders/:id/snooze` | ✅ | snooze | Postpone reminder |
| POST | `/api/reminders/:id/acknowledge` | ✅ | acknowledge | Mark as seen |

### Calendar - `/api/calendar`

| Method | Route | Status | Handler | Notes |
|--------|-------|--------|---------|-------|
| GET | `/api/calendar/events` | ✅ | getEvents | Merged view (Squire + Google) |
| GET | `/api/calendar/week` | ✅ | getWeek | Week view data |
| GET | `/api/calendar/month` | ✅ | getMonth | Month view data |

### Google Integration - `/api/integrations/google`

| Method | Route | Status | Handler | Notes |
|--------|-------|--------|---------|-------|
| GET | `/api/integrations/google/auth` | ✅ | startAuth | OAuth redirect |
| GET | `/api/integrations/google/callback` | ✅ | handleCallback | OAuth callback |
| GET | `/api/integrations/google/status` | ✅ | getStatus | Connection status |
| DELETE | `/api/integrations/google/disconnect/:id` | ✅ | disconnect | Remove connection |
| GET | `/api/integrations/google/calendars/:accountId` | ✅ | listCalendars | Available calendars |
| PATCH | `/api/integrations/google/calendars/settings/:id` | ✅ | updateCalendar | Sync settings |
| POST | `/api/integrations/google/sync/:accountId` | ✅ | triggerSync | Manual sync |

### Push Notifications - `/api/notifications`

| Method | Route | Status | Handler | Notes |
|--------|-------|--------|---------|-------|
| POST | `/api/notifications/subscribe` | ✅ | subscribe | Register push endpoint |
| DELETE | `/api/notifications/unsubscribe` | ✅ | unsubscribe | Remove subscription |
| GET | `/api/notifications/vapid-key` | ✅ | getVapidKey | Public key for client |
| GET | `/api/notifications/status` | ✅ | getStatus | Config status + stats |
| GET | `/api/notifications/subscriptions` | ✅ | list | List all subscriptions |
| GET | `/api/notifications/subscription` | ✅ | check | Check if endpoint subscribed |

---

## Frontend Routes

| Route | Page | Status | Notes |
|-------|------|--------|-------|
| `/app/calendar` | CalendarPage | ✅ | Week/month view |
| `/app/commitments` | CommitmentsPage | ✅ | List + management |
| `/app/settings/integrations` | IntegrationsPage | ✅ | Google connection |

---

## Services (Backend)

| Service | File | Status | Key Methods |
|---------|------|--------|-------------|
| Commitments | `src/services/commitments.ts` | ✅ | create, get, list, update, resolve, snooze |
| Reminders | `src/services/reminders.ts` | ✅ | create, list, schedule, deliver, snooze |
| Push | `src/services/push.ts` | ✅ | send, subscribe, unsubscribe |
| Scheduler | `src/services/scheduler.ts` | ✅ | start, stop, processReminders |
| Resolution | `src/services/resolution.ts` | ✅ | detectResolution, findMatchingCommitments, confirmResolution |
| Edges | `src/services/edges.ts` | ✅ | createEdge, getRelatedMemories, getEdgesForMemory |
| Google Auth | `src/services/google/auth.ts` | ✅ | getAuthUrl, handleCallback, refreshToken |
| Google Calendars | `src/services/google/calendars.ts` | ✅ | list, sync |
| Google Events | `src/services/google/events.ts` | ✅ | pull, push, detectConflicts |
| Google Sync | `src/services/google/sync.ts` | ✅ | fullSync, incrementalSync |

---

## Frontend Components

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| CalendarView | `app/app/calendar/page.tsx` | ✅ | Week/month view with merged events |
| EventCard | `app/app/calendar/page.tsx` | ✅ | Color by source (inline) |
| IntegrationsPage | `app/app/settings/integrations/page.tsx` | ✅ | Google OAuth, calendar settings |
| CommitmentForm | `components/calendar/CommitmentForm.tsx` | 🔲 | Create/edit |
| RecurrenceEditor | `components/calendar/RecurrenceEditor.tsx` | ✅ | RRULE builder |
| CommitmentsList | `components/commitments/CommitmentsList.tsx` | 🔲 | Filterable list |
| CommitmentCard | `components/commitments/CommitmentCard.tsx` | 🔲 | Single display |
| ResolutionConfirmation | `components/commitments/ResolutionConfirmation.tsx` | ✅ | Confirm/dismiss resolutions |
| PushPermission | `components/notifications/PushPermission.tsx` | ✅ | Request permission |

---

## Locked Naming Conventions

| Item | Name | Rationale |
|------|------|-----------|
| Commitment table | `commitments` | Plural, matches `memories` |
| Reminder table | `reminders` | Plural, consistent |
| API base | `/api/commitments` | REST plural convention |
| Status values | `open`, `in_progress`, `completed`, `canceled`, `snoozed` | Clear lifecycle |
| Resolution types | `completed`, `canceled`, `no_longer_relevant`, `superseded` | Covers all cases |
| Source types | `chat`, `manual`, `google_sync` | Origin tracking |
| Sync statuses | `local_only`, `synced`, `pending_push`, `pending_pull`, `conflict` | Bidirectional states |

---

## Dependencies

| Package | Purpose | Status |
|---------|---------|--------|
| `rrule` | Recurrence parsing | ✅ |
| `web-push` | PWA notifications | ✅ |
| `googleapis` | Google Calendar API | ✅ |

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Recurrence storage | **Hybrid** | Template + 3-month materialized window. Reminders/resolution need real rows. |

---

## Tasks

### Phase 1: Core Commitments

| # | Task | Status |
|---|------|--------|
| 1.1 | Create commitments migration (018_commitments.sql) | ✅ |
| 1.2 | Create commitments service | ✅ |
| 1.3 | Create commitments API routes | ✅ |
| 1.4 | Add commitment detection to chat extraction | ✅ |
| 1.5 | Create commitments page and list (frontend) | ✅ |

### Phase 2: Reminders + PWA Push

| # | Task | Status |
|---|------|--------|
| 2.1 | Create reminders migration (019_reminders.sql) | ✅ |
| 2.2 | Create push_subscriptions migration (021) | ✅ |
| 2.3 | Create reminders service | ✅ |
| 2.4 | Create push notification service | ✅ |
| 2.5 | Create scheduler service | ✅ |
| 2.6 | Create reminders API routes | ✅ |
| 2.7 | Create notifications API routes | ✅ |
| 2.8 | Create service worker for PWA push | ✅ |
| 2.9 | Add "remind me in X" parsing | ✅ |
| 2.10 | Create push permission UI component | ✅ |

### Phase 3: Google Calendar Sync

| # | Task | Status |
|---|------|--------|
| 3.1 | Create google integration migration (020) | ✅ |
| 3.2 | Create Google auth service | ✅ |
| 3.3 | Create Google calendars service | ✅ |
| 3.4 | Create Google events service | ✅ |
| 3.5 | Create Google sync orchestration | ✅ |
| 3.6 | Create Google integration API routes | ✅ |
| 3.7 | Create calendar API routes (unified view) | ✅ |
| 3.8 | Create settings/integrations page | ✅ |
| 3.9 | Create calendar page with merged view | ✅ |

### Phase 4: Recurrence (RRULE)

| # | Task | Status |
|---|------|--------|
| 4.1 | Add rrule dependency and types | ✅ |
| 4.2 | Add recurrence expansion to commitments service | ✅ |
| 4.3 | Create RecurrenceEditor component | ✅ |
| 4.4 | Update calendar queries to expand recurring | ✅ |

### Phase 5: Resolution Detection

| # | Task | Status |
|---|------|--------|
| 5.1 | Create resolution classification prompt | ✅ |
| 5.2 | Add embedding similarity search | ✅ |
| 5.3 | Integrate resolution detection into chat | ✅ |
| 5.4 | Create memory edges on resolution | ✅ |
| 5.5 | Create resolution confirmation UI | ✅ |

---

## Legend

- 🔲 Not started
- 🔄 In progress
- ✅ Complete
- ❓ Needs decision
