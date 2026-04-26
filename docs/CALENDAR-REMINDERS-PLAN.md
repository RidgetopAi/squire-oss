# Squire Calendar & Reminders Implementation Plan

**Created**: 2025-12-28  
**Status**: Planning  
**Scope**: Commitments, Reminders, Google Calendar (bidirectional), Recurrence

---

## Overview

Transform Squire from passive memory companion to active assistant that:
- Tracks commitments with deadlines
- Sends reminders via PWA push notifications
- Syncs bidirectionally with Google Calendar
- Detects when commitments are resolved
- Supports recurring commitments

---

## Architecture Decision

**Chosen: Option 1 - Structured Commitments**

Separate `commitments` and `reminders` tables linked to memories, with bidirectional Google Calendar sync.

---

## Database Schema

### 018_commitments.sql

```sql
-- Commitments: Actionable items with deadlines and lifecycle
CREATE TABLE IF NOT EXISTS commitments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Link to originating memory (goal/decision extracted from chat)
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,

  -- Core fields
  title TEXT NOT NULL,
  description TEXT,
  
  -- Source tracking
  source_type VARCHAR(20) NOT NULL DEFAULT 'chat',  -- 'chat' | 'manual' | 'google_sync'
  
  -- Timing
  due_at TIMESTAMPTZ,
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  all_day BOOLEAN DEFAULT FALSE,
  
  -- Duration (for calendar events)
  duration_minutes INTEGER,  -- NULL = point-in-time, otherwise has length
  
  -- Recurrence (RFC 5545 RRULE format)
  -- Examples: "FREQ=WEEKLY;BYDAY=MO,WE,FR" or "FREQ=DAILY;UNTIL=20250301"
  rrule TEXT,
  recurrence_end_at TIMESTAMPTZ,  -- When recurrence stops
  parent_commitment_id UUID REFERENCES commitments(id) ON DELETE CASCADE,  -- For instances
  original_due_at TIMESTAMPTZ,  -- Original time before any modifications
  
  -- State machine
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  resolution_type VARCHAR(20),
  resolution_memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,
  
  -- Google Calendar sync
  google_account_id UUID,  -- FK added after google_accounts table
  google_calendar_id TEXT,
  google_event_id TEXT,
  google_sync_status VARCHAR(20) DEFAULT 'local_only',  -- 'local_only' | 'synced' | 'pending_push' | 'pending_pull' | 'conflict'
  google_etag TEXT,  -- For conflict detection
  last_synced_at TIMESTAMPTZ,
  
  -- Metadata
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  
  -- Embedding for resolution matching
  embedding vector(384),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_commitment_status CHECK (status IN (
    'open', 'in_progress', 'completed', 'canceled', 'snoozed'
  )),
  CONSTRAINT valid_resolution_type CHECK (
    resolution_type IS NULL OR resolution_type IN (
      'completed', 'canceled', 'no_longer_relevant', 'superseded'
    )
  ),
  CONSTRAINT valid_source_type CHECK (source_type IN ('chat', 'manual', 'google_sync')),
  CONSTRAINT valid_google_sync_status CHECK (google_sync_status IN (
    'local_only', 'synced', 'pending_push', 'pending_pull', 'conflict'
  ))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_commitments_status ON commitments (status);
CREATE INDEX IF NOT EXISTS idx_commitments_due ON commitments (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_open_due ON commitments (status, due_at) WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_commitments_memory ON commitments (memory_id) WHERE memory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_google ON commitments (google_account_id, google_event_id) WHERE google_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_parent ON commitments (parent_commitment_id) WHERE parent_commitment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_embedding ON commitments USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

COMMENT ON TABLE commitments IS 'Actionable items with deadlines, recurrence, and Google Calendar sync';
COMMENT ON COLUMN commitments.rrule IS 'RFC 5545 RRULE for recurrence (e.g., FREQ=WEEKLY;BYDAY=MO)';
COMMENT ON COLUMN commitments.parent_commitment_id IS 'For recurring: links instance to parent template';
```

### 019_reminders.sql

```sql
-- Reminders: Scheduled notifications for commitments or standalone
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- What this reminder is for
  commitment_id UUID REFERENCES commitments(id) ON DELETE CASCADE,
  
  -- Standalone reminders (from "remind me in 2 hours to X")
  title TEXT,  -- Required if no commitment_id
  body TEXT,
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  
  -- Relative timing (for commitment-linked reminders)
  -- Stored as offset from commitment.due_at
  offset_type VARCHAR(20),  -- 'before' | 'after' | 'exact'
  offset_minutes INTEGER,   -- e.g., 60 = 1 hour before, 1440 = 1 day before
  
  -- Delivery
  channel VARCHAR(20) NOT NULL DEFAULT 'push',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  -- Execution tracking
  sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,  -- User dismissed/acted on it
  failure_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  
  -- Snooze support
  snoozed_until TIMESTAMPTZ,
  original_scheduled_for TIMESTAMPTZ,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_reminder_channel CHECK (channel IN ('push', 'in_app', 'sms', 'email')),
  CONSTRAINT valid_reminder_status CHECK (status IN (
    'pending', 'sent', 'acknowledged', 'snoozed', 'canceled', 'failed'
  )),
  CONSTRAINT valid_offset_type CHECK (offset_type IS NULL OR offset_type IN ('before', 'after', 'exact')),
  CONSTRAINT reminder_has_target CHECK (commitment_id IS NOT NULL OR title IS NOT NULL)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders (scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reminders_commitment ON reminders (commitment_id) WHERE commitment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders (status);
CREATE INDEX IF NOT EXISTS idx_reminders_retry ON reminders (next_retry_at) WHERE status = 'failed' AND next_retry_at IS NOT NULL;

COMMENT ON TABLE reminders IS 'Scheduled notifications - linked to commitments or standalone';
COMMENT ON COLUMN reminders.offset_minutes IS 'Minutes before/after commitment due_at (e.g., 10080 = 1 week)';
```

### 020_google_integration.sql

```sql
-- Google OAuth accounts
CREATE TABLE IF NOT EXISTS google_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Google identity
  google_user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  
  -- OAuth tokens (encrypted in production)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  
  -- Sync state
  calendars_sync_token TEXT,  -- For incremental calendar list sync
  last_full_sync_at TIMESTAMPTZ,
  sync_enabled BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which calendars to sync
CREATE TABLE IF NOT EXISTS google_calendars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  google_account_id UUID NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,  -- Google calendar ID (e.g., "primary" or email)
  
  summary TEXT,  -- Calendar name
  color_id TEXT,
  timezone VARCHAR(50),
  
  -- Sync settings
  sync_enabled BOOLEAN DEFAULT TRUE,
  sync_direction VARCHAR(20) DEFAULT 'bidirectional',  -- 'read_only' | 'write_only' | 'bidirectional'
  events_sync_token TEXT,  -- For incremental event sync
  last_synced_at TIMESTAMPTZ,
  
  -- Which Squire items to push to this calendar
  is_default_for_push BOOLEAN DEFAULT FALSE,  -- Squire commitments go here
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (google_account_id, calendar_id),
  CONSTRAINT valid_sync_direction CHECK (sync_direction IN ('read_only', 'write_only', 'bidirectional'))
);

-- Cached Google events (for display and conflict detection)
CREATE TABLE IF NOT EXISTS google_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  google_calendar_id UUID NOT NULL REFERENCES google_calendars(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,  -- Google event ID
  
  -- Event data
  summary TEXT,
  description TEXT,
  location TEXT,
  
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT FALSE,
  timezone VARCHAR(50),
  
  -- Recurrence
  rrule TEXT,
  recurring_event_id TEXT,  -- Parent event ID for instances
  original_start_time TIMESTAMPTZ,  -- For modified instances
  
  -- Status
  status VARCHAR(20),  -- 'confirmed' | 'tentative' | 'cancelled'
  etag TEXT,
  
  -- Link to Squire commitment (if created from Squire)
  commitment_id UUID REFERENCES commitments(id) ON DELETE SET NULL,
  
  -- Raw payload for edge cases
  raw JSONB NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (google_calendar_id, event_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_google_events_time ON google_events (start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_google_events_calendar ON google_events (google_calendar_id);
CREATE INDEX IF NOT EXISTS idx_google_events_commitment ON google_events (commitment_id) WHERE commitment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_google_events_recurring ON google_events (recurring_event_id) WHERE recurring_event_id IS NOT NULL;

-- Add FK from commitments to google_accounts
ALTER TABLE commitments 
  ADD CONSTRAINT fk_commitments_google_account 
  FOREIGN KEY (google_account_id) REFERENCES google_accounts(id) ON DELETE SET NULL;
```

### 021_push_subscriptions.sql

```sql
-- PWA Push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Subscription details (from browser PushSubscription)
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,  -- Public key
  auth TEXT NOT NULL,    -- Auth secret
  
  -- Device info
  user_agent TEXT,
  device_name TEXT,  -- User-friendly name if provided
  
  -- Status
  active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_active ON push_subscriptions (active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint ON push_subscriptions (endpoint);

COMMENT ON TABLE push_subscriptions IS 'Browser push notification subscriptions for PWA';
```

---

## Services Architecture

### New Services

```
src/services/
├── commitments.ts      # CRUD, resolution detection, recurrence expansion
├── reminders.ts        # CRUD, scheduling, delivery
├── google/
│   ├── auth.ts         # OAuth flow, token refresh
│   ├── calendars.ts    # Calendar list sync
│   ├── events.ts       # Event sync (bidirectional)
│   └── sync.ts         # Orchestration, conflict resolution
├── push.ts             # Web push delivery
└── scheduler.ts        # Cron-like job runner for reminders
```

### API Routes

```
src/api/routes/
├── commitments.ts      # /api/commitments/*
├── reminders.ts        # /api/reminders/*
├── calendar.ts         # /api/calendar/* (unified view)
├── google.ts           # /api/integrations/google/*
└── notifications.ts    # /api/notifications/* (push subscription)
```

---

## Key Algorithms

### 1. Commitment Resolution Detection

```typescript
// In chatExtraction.ts or new resolutionDetection.ts
async function detectResolution(newMemory: Memory): Promise<ResolutionMatch[]> {
  // Step 1: LLM classification
  const classification = await classifyResolution(newMemory.content);
  if (!classification.is_resolution) return [];
  
  // Step 2: Find candidate commitments via embedding similarity
  const candidates = await pool.query(`
    SELECT id, title, memory_id, due_at,
           1 - (embedding <=> $1::vector) as similarity
    FROM commitments
    WHERE status IN ('open', 'in_progress')
      AND embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT 5
  `, [newMemory.embedding]);
  
  // Step 3: LLM confirmation with context
  const matches = await confirmResolutionMatches(
    newMemory.content,
    candidates.rows,
    classification.resolution_type
  );
  
  // Step 4: Apply resolutions
  for (const match of matches) {
    await resolveCommitment(match.commitment_id, {
      resolution_type: match.resolution_type,
      resolution_memory_id: newMemory.id
    });
    
    // Create memory edge
    const commitment = await getCommitment(match.commitment_id);
    if (commitment.memory_id) {
      await createMemoryEdge({
        source_memory_id: commitment.memory_id,
        target_memory_id: newMemory.id,
        edge_type: match.resolution_type === 'completed' ? 'FOLLOWS' : 'CONTRADICTS',
        metadata: { resolution_type: match.resolution_type }
      });
    }
  }
  
  return matches;
}
```

### 2. Recurrence Expansion

```typescript
// Using rrule library (npm: rrule)
import { RRule, RRuleSet } from 'rrule';

async function expandRecurrence(
  commitment: Commitment,
  windowStart: Date,
  windowEnd: Date
): Promise<Commitment[]> {
  if (!commitment.rrule) return [commitment];
  
  const rule = RRule.fromString(commitment.rrule);
  const occurrences = rule.between(windowStart, windowEnd, true);
  
  return occurrences.map(date => ({
    ...commitment,
    id: undefined,  // Will be generated or virtual
    parent_commitment_id: commitment.id,
    due_at: date,
    original_due_at: date,
    rrule: null,  // Instances don't have rrule
  }));
}

// Calendar API merges:
// 1. Non-recurring commitments
// 2. Expanded instances from recurring commitments
// 3. Google events (already handles recurrence)
```

### 3. Reminder Scheduling

```typescript
// Default reminder offsets (in minutes)
const DEFAULT_OFFSETS = [
  10080,  // 1 week
  1440,   // 1 day
  60,     // 1 hour
];

async function createCommitmentReminders(commitment: Commitment): Promise<void> {
  if (!commitment.due_at) return;
  
  for (const offset of DEFAULT_OFFSETS) {
    const scheduledFor = new Date(commitment.due_at.getTime() - offset * 60000);
    
    // Don't create reminders in the past
    if (scheduledFor <= new Date()) continue;
    
    await createReminder({
      commitment_id: commitment.id,
      scheduled_for: scheduledFor,
      offset_type: 'before',
      offset_minutes: offset,
      channel: 'push',
    });
  }
}

// For "remind me in 2 hours"
async function createStandaloneReminder(
  title: string,
  delayMinutes: number
): Promise<Reminder> {
  return createReminder({
    title,
    scheduled_for: new Date(Date.now() + delayMinutes * 60000),
    offset_type: 'exact',
    channel: 'push',
  });
}
```

### 4. Bidirectional Google Sync

```typescript
// Sync strategy: Last-write-wins with conflict detection

async function syncWithGoogle(calendarId: UUID): Promise<SyncResult> {
  const calendar = await getGoogleCalendar(calendarId);
  const account = await getGoogleAccount(calendar.google_account_id);
  
  // Refresh token if needed
  await ensureValidToken(account);
  
  // Pull changes from Google
  const pullResult = await pullGoogleEvents(calendar);
  
  // Push pending Squire changes
  const pushResult = await pushSquireCommitments(calendar);
  
  // Handle conflicts (both modified since last sync)
  const conflicts = detectConflicts(pullResult, pushResult);
  for (const conflict of conflicts) {
    // Strategy: Google wins for Google-created, Squire wins for Squire-created
    await resolveConflict(conflict);
  }
  
  // Update sync token
  await updateCalendarSyncToken(calendar.id, pullResult.nextSyncToken);
  
  return { pulled: pullResult.count, pushed: pushResult.count, conflicts: conflicts.length };
}
```

---

## Chat Command Recognition

Extend `chatExtraction.ts` or create `commandDetection.ts`:

```typescript
const COMMITMENT_PATTERNS = [
  // Remind patterns
  /remind me (?:in )?(\d+) (hour|minute|day|week)s? (?:to |that )?(.+)/i,
  /remind me (?:at |on )?(.+?) (?:to |that )?(.+)/i,
  /remind me (?:to |about )?(.+)/i,
  
  // Schedule patterns
  /schedule (.+) (?:for |on |at )(.+)/i,
  /(?:i need to|i have to|i should|i must) (.+) (?:by |before |on )(.+)/i,
  
  // Commitment patterns
  /(?:i need to|i have to|i should|i must|i'm going to|i will) (.+)/i,
];

interface ParsedCommand {
  type: 'reminder' | 'commitment';
  title: string;
  due_at?: Date;
  delay_minutes?: number;
  recurrence?: string;
}

async function parseCommitmentCommand(message: string): Promise<ParsedCommand | null> {
  // Try regex patterns first for speed
  for (const pattern of COMMITMENT_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      return parseMatch(match, pattern);
    }
  }
  
  // Fall back to LLM for complex cases
  return await llmParseCommitment(message);
}
```

---

## Frontend Components

### New Pages

```
web/src/app/app/
├── calendar/
│   └── page.tsx          # Calendar view with Google + Squire events
├── commitments/
│   └── page.tsx          # Commitments list/management
└── settings/
    └── integrations/
        └── page.tsx      # Google Calendar connection
```

### New Components

```
web/src/components/
├── calendar/
│   ├── CalendarView.tsx      # Week/month view
│   ├── EventCard.tsx         # Event display (color-coded by source)
│   ├── CommitmentForm.tsx    # Create/edit commitment
│   └── RecurrenceEditor.tsx  # RRULE builder UI
├── commitments/
│   ├── CommitmentsList.tsx   # Filterable list
│   ├── CommitmentCard.tsx    # Single commitment display
│   └── ResolutionFlow.tsx    # Mark complete/cancel UI
├── reminders/
│   ├── RemindersPanel.tsx    # Dashboard panel
│   ├── ReminderToast.tsx     # In-app notification
│   └── SnoozeMenu.tsx        # Snooze options
└── notifications/
    └── PushPermission.tsx    # Request push permission
```

### Service Worker

```typescript
// web/public/sw.js
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  
  const options = {
    body: data.body || 'You have a reminder',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: data.reminder_id,
    data: {
      url: data.url || '/app/commitments',
      commitment_id: data.commitment_id,
    },
    actions: [
      { action: 'view', title: 'View' },
      { action: 'snooze', title: 'Snooze 1h' },
      { action: 'done', title: 'Mark Done' },
    ],
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Squire Reminder', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'snooze') {
    // Call snooze API
    fetch(`/api/reminders/${event.notification.tag}/snooze`, { method: 'POST' });
  } else if (event.action === 'done') {
    // Mark commitment complete
    fetch(`/api/commitments/${event.notification.data.commitment_id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution_type: 'completed' }),
    });
  } else {
    // Open app
    clients.openWindow(event.notification.data.url);
  }
});
```

---

## Implementation Phases

### Phase 1: Core Commitments (1-2 days)
- [ ] Schema: commitments table (018)
- [ ] Service: commitments.ts (CRUD, embedding)
- [ ] API: /api/commitments
- [ ] Chat: Detect commitment language, create commitments
- [ ] UI: Basic commitments list + creation form

### Phase 2: Reminders & Push (1-2 days)
- [ ] Schema: reminders, push_subscriptions (019, 021)
- [ ] Service: reminders.ts, push.ts
- [ ] Scheduler: Cron job for reminder delivery
- [ ] API: /api/reminders, /api/notifications/subscribe
- [ ] Service Worker + push permission flow
- [ ] Chat: "remind me in X" parsing

### Phase 3: Google Calendar (2-3 days)
- [ ] Schema: google_accounts, google_calendars, google_events (020)
- [ ] Service: google/auth.ts, calendars.ts, events.ts, sync.ts
- [ ] API: /api/integrations/google/*
- [ ] OAuth flow + calendar selection UI
- [ ] Bidirectional sync worker
- [ ] UI: Calendar view with merged events

### Phase 4: Recurrence (1 day)
- [ ] Add rrule library
- [ ] Recurrence expansion in calendar queries
- [ ] RecurrenceEditor UI component
- [ ] Instance modification handling

### Phase 5: Resolution Detection (1 day)
- [ ] Resolution classification prompt
- [ ] Embedding similarity search on open commitments
- [ ] Auto-resolution with memory edges
- [ ] UI: Resolution confirmation when uncertain

---

## Dependencies to Add

```json
{
  "dependencies": {
    "rrule": "^2.8.1",
    "web-push": "^3.6.7",
    "googleapis": "^144.0.0"
  }
}
```

Frontend:
```json
{
  "dependencies": {
    "@fullcalendar/core": "^6.1.15",
    "@fullcalendar/react": "^6.1.15",
    "@fullcalendar/daygrid": "^6.1.15",
    "@fullcalendar/timegrid": "^6.1.15"
  }
}
```

---

## Environment Variables

```env
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://squire.ridgetopai.net/api/integrations/google/callback

# Web Push (generate with: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:brian@ridgetopai.net
```

---

## Open Questions for Implementation

1. **Calendar library choice**: FullCalendar (feature-rich) vs custom (full control, more work)?

2. **Recurrence storage**: Materialize all instances in DB, or expand on-the-fly for queries?

3. **Conflict resolution UI**: Auto-resolve + log, or show modal for user decision?

4. **Timezone handling**: Store user preferred timezone in settings, or infer from browser?
