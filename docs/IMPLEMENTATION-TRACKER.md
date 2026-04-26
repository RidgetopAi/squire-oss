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

## Mandrel Tasks

### Phase 1: Core Commitments

| # | Task | Mandrel ID | Status |
|---|------|------------|--------|
| 1.1 | Create commitments migration (018_commitments.sql) | `6dc77d37-12e7-4cf7-a38d-01f60662a7a5` | ✅ |
| 1.2 | Create commitments service | `7b525561-b250-48dd-bb2e-f1f106aad49f` | ✅ |
| 1.3 | Create commitments API routes | `df506266-d471-439a-9ef8-1fa67258b1c4` | ✅ |
| 1.4 | Add commitment detection to chat extraction | `63dbeef4-fc10-4bbf-9ac0-baec97a2586f` | ✅ |
| 1.5 | Create commitments page and list (frontend) | `66f029ee-8517-4fe1-8740-e997e70121fc` | ✅ |

### Phase 2: Reminders + PWA Push

| # | Task | Mandrel ID | Status |
|---|------|------------|--------|
| 2.1 | Create reminders migration (019_reminders.sql) | `31a29a56-326a-4bfb-9561-e9987b31c420` | ✅ |
| 2.2 | Create push_subscriptions migration (021) | `19e95a01-6760-4338-9145-0df688a6da7a` | ✅ |
| 2.3 | Create reminders service | `9bad05e1-5d28-4306-ab83-bba0e2db9d04` | ✅ |
| 2.4 | Create push notification service | `93dcb88a-f2e2-423c-8de1-cb2e9ef94882` | ✅ |
| 2.5 | Create scheduler service | `d31302d1-554c-4cc3-b90f-03e414fc68c6` | ✅ |
| 2.6 | Create reminders API routes | `61403daa-970b-4f0f-ab51-a095789cbb26` | ✅ |
| 2.7 | Create notifications API routes | `b77537ac-33f3-427c-a3bf-bc4e0574113e` | ✅ |
| 2.8 | Create service worker for PWA push | `1f225f73-e207-47f4-8e5f-173863701a62` | ✅ |
| 2.9 | Add "remind me in X" parsing | `06f9a0b3-e7dc-46b0-b117-f66e6cbe5586` | ✅ |
| 2.10 | Create push permission UI component | `f1043002-29c6-4506-9e44-4f6b6049c7e1` | ✅ |

### Phase 3: Google Calendar Sync

| # | Task | Mandrel ID | Status |
|---|------|------------|--------|
| 3.1 | Create google integration migration (020) | `bfb5dea5-0e83-491f-a078-b7acb40278ce` | ✅ |
| 3.2 | Create Google auth service | `839684b1-53da-4ee6-b267-b2fc3e5bef64` | ✅ |
| 3.3 | Create Google calendars service | `e984e0fe-79e3-436a-985f-da7d0964c144` | ✅ |
| 3.4 | Create Google events service | `d89967e4-6ad3-4fbe-bbeb-43f98395931a` | ✅ |
| 3.5 | Create Google sync orchestration | `2e3263d3-2fb3-4a2b-a55b-3917898bd2ce` | ✅ |
| 3.6 | Create Google integration API routes | `9116f9c5-e6b6-4ea6-9ffa-6be9019ae958` | ✅ |
| 3.7 | Create calendar API routes (unified view) | `d2d7bf90-ffb2-42ed-b7c5-49200888f51e` | ✅ |
| 3.8 | Create settings/integrations page | `0bcbe9ee-6e1f-4437-859e-535e83effae3` | ✅ |
| 3.9 | Create calendar page with merged view | `eee91aeb-047f-4c3d-9dcc-e20bc19b89f6` | ✅ |

### Phase 4: Recurrence (RRULE)

| # | Task | Mandrel ID | Status |
|---|------|------------|--------|
| 4.1 | Add rrule dependency and types | `93e25f1f-88b3-486d-9c0e-332309c15953` | ✅ |
| 4.2 | Add recurrence expansion to commitments service | `b0a4ce5b-48d9-49e0-be75-0e0ee0446096` | ✅ |
| 4.3 | Create RecurrenceEditor component | `1bacd056-6ea8-441a-9a37-e7fc75c77f89` | ✅ |
| 4.4 | Update calendar queries to expand recurring | `1d542dcf-feac-40d2-93b5-a963306a0881` | ✅ |

### Phase 5: Resolution Detection

| # | Task | Mandrel ID | Status |
|---|------|------------|--------|
| 5.1 | Create resolution classification prompt | `7541cf20-496a-4400-b7df-dd9bbeb9c5d0` | ✅ |
| 5.2 | Add embedding similarity search | `53189833-3129-42cb-92b6-998511fc3f6c` | ✅ |
| 5.3 | Integrate resolution detection into chat | `32b1e6b3-bbc7-48b4-98f4-21ac41e4ecb5` | ✅ |
| 5.4 | Create memory edges on resolution | `650d7e28-27e5-4e2b-bb50-3955f6d99d39` | ✅ |
| 5.5 | Create resolution confirmation UI | `bb235709-3ef8-4a40-8a93-6671b4eb1e75` | ✅ |

---

## Legend

- 🔲 Not started
- 🔄 In progress
- ✅ Complete
- ❓ Needs decision
