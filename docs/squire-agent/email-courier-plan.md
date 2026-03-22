# Courier - Email Worker Plan

**Created**: 2026-02-02
**Status**: Planning Complete
**Pattern**: Medieval theme - Squire (main agent) + Courier (messenger agent)

---

## Overview

Periodic email monitoring worker that checks Gmail every 30 minutes during active hours, summarizes new emails using Grok, and pushes notifications to both Telegram and the webapp.

## Decisions

| Decision | Choice |
|----------|--------|
| **OAuth2** | Extend existing setup - add Gmail scopes (re-auth once) |
| **Token Storage** | Already in database (`google_accounts` table) |
| **Worker Model** | **Courier** - generic worker for future expansion |
| **Notifications** | Plain text → both Telegram + Webapp (Socket.IO broadcast) |
| **Error Handling** | Retry 3x with 15-second intervals |
| **Quiet Hours** | 10pm - 7am EST (no automatic checks) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          COURIER                                │
│                   (Generic Worker Scheduler)                    │
├─────────────────────────────────────────────────────────────────┤
│  - 30-minute tick interval                                      │
│  - Quiet hours check (10pm-7am EST)                             │
│  - Extensible task registry                                     │
│  - State: isRunning, lastTick, stats                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                   ┌────────▼────────┐
                   │   Task Runner   │
                   │  (pluggable)    │
                   └────────┬────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │  Email   │  │ Future   │  │ Future   │
        │  Check   │  │ Task 2   │  │ Task 3   │
        └────┬─────┘  └──────────┘  └──────────┘
             │
             ▼
     ┌───────────────┐
     │  Gmail API    │
     │  (googleapis) │
     └───────┬───────┘
             │
             ▼
     ┌───────────────┐
     │    Grok       │
     │ (summarize)   │
     └───────┬───────┘
             │
      ┌──────┴──────┐
      ▼             ▼
┌──────────┐  ┌──────────┐
│ Telegram │  │  Webapp  │
│   Bot    │  │ Socket.IO│
└──────────┘  └──────────┘
```

---

## File Structure

```
src/
├── services/
│   ├── courier/
│   │   ├── index.ts           # Export start/stop/getStats
│   │   ├── scheduler.ts       # Generic 30-min worker with quiet hours
│   │   ├── tasks/
│   │   │   ├── index.ts       # Task registry
│   │   │   └── emailCheck.ts  # Email check task
│   │   └── notifier.ts        # Unified notification (Telegram + Socket.IO)
│   │
│   └── google/
│       ├── auth.ts            # (existing - add Gmail scopes)
│       └── gmail.ts           # Gmail API client (new)
│
├── tools/email/
│   ├── index.ts               # Tool exports
│   ├── types.ts               # Type definitions
│   ├── list.ts                # email_list - List unread/recent
│   ├── read.ts                # email_read - Get full email
│   ├── delete.ts              # email_delete - Trash email
│   ├── send.ts                # email_send - Compose & send
│   ├── archive.ts             # email_archive - Archive email
│   └── check.ts               # email_check - Manual trigger
│
├── config/index.ts            # Add courier section
│
└── api/socket/
    ├── types.ts               # Add email:summary event type
    └── broadcast.ts           # Add broadcastEmailSummary()

schema/
└── 036_email_state.sql        # Track last check timestamp (optional)
```

---

## Phases

### Phase 1: OAuth2 Extension
Add Gmail scopes to existing Google auth.

**Files Modified:**
- `src/services/google/auth.ts`

**Scopes to Add:**
```typescript
'https://www.googleapis.com/auth/gmail.readonly',
'https://www.googleapis.com/auth/gmail.modify',
'https://www.googleapis.com/auth/gmail.send'
```

**User Action Required:** Re-authorize via `/api/integrations/google/connect`

---

### Phase 2: Gmail Service
Gmail API client for all email operations.

**New File:** `src/services/google/gmail.ts`

**Functions:**
```typescript
listUnread(accountId: string, since?: Date): Promise<Email[]>
getEmail(accountId: string, emailId: string): Promise<EmailFull>
trashEmail(accountId: string, emailId: string): Promise<boolean>
sendEmail(accountId: string, to: string, subject: string, body: string): Promise<boolean>
archiveEmail(accountId: string, emailId: string): Promise<boolean>
```

**Types:**
```typescript
interface Email {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: Date;
  isUnread: boolean;
}

interface EmailFull extends Email {
  body: string;
  to: string[];
  cc?: string[];
  attachments?: { name: string; mimeType: string; size: number }[];
}
```

---

### Phase 3: Courier Scheduler
Generic worker with quiet hours and task registry.

**New Files:**
- `src/services/courier/index.ts`
- `src/services/courier/scheduler.ts`
- `src/services/courier/tasks/index.ts`
- `src/services/courier/tasks/emailCheck.ts`

**Scheduler Interface:**
```typescript
interface CourierConfig {
  intervalMs: number;          // Default: 1800000 (30 min)
  quietHoursStart: number;     // Default: 22 (10pm)
  quietHoursEnd: number;       // Default: 7 (7am)
  timezone: string;            // From config.timezone
  retryAttempts: number;       // Default: 3
  retryDelayMs: number;        // Default: 15000
}

function start(config?: Partial<CourierConfig>): void
function stop(): void
function isRunning(): boolean
function getStats(): CourierStats
function runNow(): Promise<void>  // Manual trigger
```

**Task Registry:**
```typescript
interface CourierTask {
  name: string;
  enabled: boolean;
  execute: () => Promise<TaskResult>;
}

function registerTask(name: string, task: CourierTask): void
function unregisterTask(name: string): void
function listTasks(): CourierTask[]
```

**Quiet Hours Logic:**
```typescript
function isQuietHours(): boolean {
  const now = new Date();
  const hour = parseInt(now.toLocaleString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: config.timezone
  }));
  return hour >= config.courier.quietHoursStart || hour < config.courier.quietHoursEnd;
}
```

**Retry Logic:**
```typescript
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  attempts: number = 3,
  delayMs: number = 15000
): Promise<T>
```

---

### Phase 4: Notifier
Unified notification service for Telegram + Socket.IO.

**New File:** `src/services/courier/notifier.ts`

**Modified Files:**
- `src/api/socket/types.ts` - Add `email:summary` event
- `src/api/socket/broadcast.ts` - Add `broadcastEmailSummary()`

**Notifier Interface:**
```typescript
interface NotifyOptions {
  channels?: ('telegram' | 'webapp')[];  // Default: both
  priority?: 'normal' | 'high';
}

async function notify(message: string, options?: NotifyOptions): Promise<void>
async function notifyEmailSummary(emails: EmailSummary[]): Promise<void>
```

**Email Summary Format:**
```
📧 Email Summary (3 new)

• John Smith - Project update meeting tomorrow
• AWS - Your invoice for January is ready
• GitHub - [repo] New pull request from user

Reply "check email" to see full details.
```

---

### Phase 5: Email Tools
6 tools for Squire agent to manage emails.

**New Files:**
- `src/tools/email/index.ts`
- `src/tools/email/types.ts`
- `src/tools/email/list.ts`
- `src/tools/email/read.ts`
- `src/tools/email/delete.ts`
- `src/tools/email/send.ts`
- `src/tools/email/archive.ts`
- `src/tools/email/check.ts`

**Tool Definitions:**

| Tool | Purpose | Parameters |
|------|---------|------------|
| `email_list` | List recent/unread emails | `limit?`, `unreadOnly?` |
| `email_read` | Get full email content | `emailId` |
| `email_delete` | Move to trash | `emailId` |
| `email_send` | Compose and send | `to`, `subject`, `body` |
| `email_archive` | Archive email | `emailId` |
| `email_check` | Manual trigger summary | (none) |

---

### Phase 6: Integration
Wire everything into the server.

**Modified Files:**
- `src/config/index.ts` - Add courier section
- `src/api/server.ts` - Start/stop courier
- `src/tools/index.ts` - Register email tools

**Config Addition:**
```typescript
courier: {
  enabled: optional('COURIER_ENABLED', 'true') === 'true',
  intervalMs: parseInt(optional('COURIER_INTERVAL_MS', '1800000'), 10),
  quietHoursStart: parseInt(optional('COURIER_QUIET_START', '22'), 10),
  quietHoursEnd: parseInt(optional('COURIER_QUIET_END', '7'), 10),
  retryAttempts: parseInt(optional('COURIER_RETRY_ATTEMPTS', '3'), 10),
  retryDelayMs: parseInt(optional('COURIER_RETRY_DELAY_MS', '15000'), 10),
}
```

**Server Integration:**
```typescript
// In server.ts startup
import { startCourier, stopCourier } from '../services/courier/index.js';

// After other services start
if (config.courier.enabled) {
  startCourier();
}

// In graceful shutdown
stopCourier();
```

---

## Email Summarization Flow

1. **Courier tick fires** (every 30 min)
2. **Check quiet hours** → skip if 10pm-7am EST
3. **Fetch unread emails** via Gmail API
4. **If emails exist:**
   - Format email metadata (from, subject, snippet)
   - Send to Grok for 1-2 line summaries
   - Build notification message
5. **Push notification** to Telegram + Socket.IO
6. **Update last_checked** timestamp
7. **If no emails:** Send "No new emails" (or skip silently - TBD)

---

## Grok Summarization Prompt

```
Summarize each email in 1-2 lines. Be concise and highlight the key point or action needed.

Format: "• [Sender] - [Summary]"

Emails:
{email_list}
```

---

## Dependencies

- `googleapis` - Already installed
- No new npm packages needed

---

## One-Time Setup

1. User visits `/api/integrations/google/connect`
2. Re-authorizes with Gmail scopes
3. Tokens auto-update in database
4. Courier starts on next server restart

---

## Metrics

| Metric | Value |
|--------|-------|
| New files | ~15 |
| Modified files | ~5 |
| New tools | 6 |
| Database changes | 0 (use memory for now) |
| New dependencies | 0 |

---

## Future Extensions (Courier Tasks)

- [ ] Calendar reminder push
- [ ] Daily standup summary
- [ ] Unread Slack messages
- [ ] GitHub notifications
- [ ] Weather briefing
