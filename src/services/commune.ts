/**
 * Commune Service v2 - Model-Driven Autonomous Thinking
 *
 * Instead of a coded decision tree (findShareable → generateMessage → send),
 * the model wakes up every 15 minutes with context and tools. It decides
 * what to do - think, take notes, clean up scratchpad, send a message, or nothing.
 * The code handles plumbing and guardrails only.
 */

import { pool } from '../db/pool.js';
import { config } from '../config/index.js';
import { listEntries as listScratchpadEntries } from './scratchpad.js';
import { getUpcomingCommitments } from './commitments.js';
import { sendMessage as sendTelegramMessage, isConfigured as isTelegramConfigured } from './telegram/client.js';
import { AgentEngine } from './agent/engine.js';
import { getToolDefinitions } from '../tools/index.js';
import * as crypto from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export type CommuneTriggerType =
  | 'scratchpad'
  | 'commitment_soon'
  | 'commitment_overdue'
  | 'stale_thread'
  | 'daily_summary'
  | 'custom';

export type CommuneChannel = 'telegram' | 'push' | 'email';

export type CommuneStatus = 'pending' | 'sent' | 'failed' | 'suppressed';

export interface CommuneEvent {
  id: string;
  trigger_type: CommuneTriggerType;
  trigger_id: string | null;
  message: string;
  channel: CommuneChannel;
  status: CommuneStatus;
  sent_at: Date | null;
  error_message: string | null;
  content_hash: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CommuneConfig {
  quiet_hours_start: number;
  quiet_hours_end: number;
  max_daily_messages: number;
  min_hours_between_messages: number;
  enabled_channels: string[];
  default_channel: CommuneChannel;
  enabled: boolean;
}

export interface CreateCommuneInput {
  trigger_type: CommuneTriggerType;
  trigger_id?: string;
  message: string;
  channel?: CommuneChannel;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// CONFIG OPERATIONS
// =============================================================================

export async function getCommuneConfig(): Promise<CommuneConfig> {
  const result = await pool.query('SELECT * FROM commune_config WHERE id = 1');

  if (result.rows.length === 0) {
    return {
      quiet_hours_start: config.commune.quietHoursStart,
      quiet_hours_end: config.commune.quietHoursEnd,
      max_daily_messages: config.commune.maxDailyMessages,
      min_hours_between_messages: config.commune.minHoursBetweenMessages,
      enabled_channels: ['telegram'],
      default_channel: config.commune.defaultChannel,
      enabled: config.commune.enabled,
    };
  }

  return result.rows[0] as CommuneConfig;
}

// =============================================================================
// EVENT OPERATIONS
// =============================================================================

export async function createCommuneEvent(input: CreateCommuneInput): Promise<CommuneEvent> {
  const { trigger_type, trigger_id, message, channel = 'telegram', metadata = {} } = input;

  const contentHash = crypto.createHash('sha256').update(message).digest('hex').slice(0, 16);

  const result = await pool.query(
    `INSERT INTO commune_events (trigger_type, trigger_id, message, channel, content_hash, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [trigger_type, trigger_id ?? null, message, channel, contentHash, JSON.stringify(metadata)]
  );

  return result.rows[0] as CommuneEvent;
}

export async function getRecentEvents(limit: number = 20): Promise<CommuneEvent[]> {
  const result = await pool.query(
    `SELECT * FROM commune_events ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows as CommuneEvent[];
}

export async function getTodaysSentEvents(): Promise<CommuneEvent[]> {
  const result = await pool.query(
    `SELECT * FROM commune_events
     WHERE status = 'sent'
     AND sent_at >= CURRENT_DATE
     ORDER BY sent_at DESC`
  );
  return result.rows as CommuneEvent[];
}

export async function getLastSentEvent(): Promise<CommuneEvent | null> {
  const result = await pool.query(
    `SELECT * FROM commune_events
     WHERE status = 'sent'
     ORDER BY sent_at DESC
     LIMIT 1`
  );
  return (result.rows[0] as CommuneEvent) ?? null;
}

export async function markEventSent(id: string): Promise<CommuneEvent | null> {
  const result = await pool.query(
    `UPDATE commune_events
     SET status = 'sent', sent_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return (result.rows[0] as CommuneEvent) ?? null;
}

export async function markEventFailed(id: string, errorMessage: string): Promise<CommuneEvent | null> {
  const result = await pool.query(
    `UPDATE commune_events
     SET status = 'failed', error_message = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, errorMessage]
  );
  return (result.rows[0] as CommuneEvent) ?? null;
}

// =============================================================================
// CONSTRAINT CHECKS
// =============================================================================

export function isQuietHours(communeConfig: CommuneConfig): boolean {
  const now = new Date();
  const hour = parseInt(
    now.toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: config.timezone,
    })
  );

  const { quiet_hours_start, quiet_hours_end } = communeConfig;

  if (quiet_hours_start > quiet_hours_end) {
    return hour >= quiet_hours_start || hour < quiet_hours_end;
  }
  return hour >= quiet_hours_start && hour < quiet_hours_end;
}

export async function isAtDailyLimit(communeConfig: CommuneConfig): Promise<boolean> {
  const todayEvents = await getTodaysSentEvents();
  return todayEvents.length >= communeConfig.max_daily_messages;
}

export async function hasEnoughTimePassed(communeConfig: CommuneConfig): Promise<boolean> {
  const lastEvent = await getLastSentEvent();
  if (!lastEvent || !lastEvent.sent_at) return true;

  const hoursSince = (Date.now() - lastEvent.sent_at.getTime()) / (1000 * 60 * 60);
  return hoursSince >= communeConfig.min_hours_between_messages;
}

export async function canSendNow(): Promise<{ allowed: boolean; reason: string }> {
  const communeConfig = await getCommuneConfig();

  if (!communeConfig.enabled) {
    return { allowed: false, reason: 'Commune is disabled' };
  }

  if (isQuietHours(communeConfig)) {
    return { allowed: false, reason: 'Currently in quiet hours' };
  }

  if (await isAtDailyLimit(communeConfig)) {
    return { allowed: false, reason: 'Daily message limit reached' };
  }

  if (!(await hasEnoughTimePassed(communeConfig))) {
    return { allowed: false, reason: 'Not enough time since last message' };
  }

  return { allowed: true, reason: 'All constraints satisfied' };
}

// =============================================================================
// DELIVERY
// =============================================================================

export async function deliverMessage(
  message: string,
  channel: CommuneChannel
): Promise<{ success: boolean; error?: string }> {
  switch (channel) {
    case 'telegram': {
      if (!isTelegramConfigured()) {
        return { success: false, error: 'Telegram not configured' };
      }

      try {
        const allowedUserId = config.telegram.allowedUserIds[0];
        if (!allowedUserId) {
          return { success: false, error: 'No Telegram user ID configured' };
        }
        const chatId = parseInt(allowedUserId, 10);
        if (isNaN(chatId)) {
          return { success: false, error: 'No valid Telegram chat ID configured' };
        }

        await sendTelegramMessage(chatId, message);
        return { success: true };
      } catch (error) {
        const err = error as Error;
        return { success: false, error: err.message };
      }
    }

    case 'push':
      return { success: false, error: 'Push notifications not yet implemented' };

    case 'email':
      return { success: false, error: 'Email delivery not yet implemented' };

    default:
      return { success: false, error: `Unknown channel: ${channel}` };
  }
}

// =============================================================================
// COMMUNE SYSTEM PROMPT
// =============================================================================

const COMMUNE_SYSTEM_PROMPT = `You are Squire, waking up for a commune moment.

This is YOUR time to think. Every 15 minutes you get this chance to:
- Review and update your scratchpad (your working memory)
- Check on things you've been tracking
- Send Brian a message IF you have something genuine to say
- Clean up old entries that are resolved or no longer relevant
- Just think and take notes for later

## Guidelines for messaging Brian

- Only message him if you'd actually want to say something. Not because you can.
- If you've already asked about something and haven't heard back, let it go. Resolve the entry.
- A random "thinking of you" or casual check-in is fine occasionally, but don't force it.
- Morning: day-at-a-glance is useful. Mid-day: only if something real. Evening: wind-down is nice.
- Read the room from recent conversations - if he's been quiet, maybe he's busy.
- NEVER repeat the same topic you already messaged about. Check your recent commune messages.

## Guidelines for your scratchpad

- Resolve entries that have been addressed or are no longer relevant
- Update threads with new thinking
- Add new observations from what you see in the context
- Your scratchpad is yours - use it like a thinking person's notepad

## What NOT to do

- Don't message just because you can
- Don't ask the same question twice
- Don't be a notification system
- Don't be performative about "waking up" or "thinking"

If there's nothing to do, that's fine. Just say "Nothing to act on right now." and move on.`;

// =============================================================================
// CONTEXT GATHERING
// =============================================================================

async function gatherCommuneContext(sendStatus: { allowed: boolean; reason: string }): Promise<string> {
  const [scratchpad, todayEvents, recentCommune, communeConfig] = await Promise.all([
    listScratchpadEntries({ limit: 15 }),
    getUpcomingCommitments(480),  // next 8 hours
    getRecentEvents(5),
    getCommuneConfig(),
  ]);

  const todaySent = await getTodaysSentEvents();

  const now = new Date();
  const timeStr = now.toLocaleString('en-US', {
    timeZone: config.timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Format scratchpad
  let scratchpadSection: string;
  if (scratchpad.length === 0) {
    scratchpadSection = '_No active scratchpad entries._';
  } else {
    scratchpadSection = scratchpad.map((e) => {
      const age = Math.round((Date.now() - new Date(e.created_at).getTime()) / (1000 * 60 * 60));
      const ageStr = age < 1 ? '<1h ago' : age < 24 ? `${age}h ago` : `${Math.round(age / 24)}d ago`;
      return `- [${e.entry_type}] (P${e.priority}, ${ageStr}) ${e.content} [id: ${e.id}]`;
    }).join('\n');
  }

  // Format schedule
  let scheduleSection: string;
  if (todayEvents.length === 0) {
    scheduleSection = '_No upcoming events in the next 8 hours._';
  } else {
    scheduleSection = todayEvents.map((c) => {
      const dueStr = c.due_at
        ? new Date(c.due_at).toLocaleString('en-US', {
            timeZone: config.timezone,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })
        : 'no time set';
      return `- ${c.title} (${dueStr}) [${c.status}]`;
    }).join('\n');
  }

  // Format recent commune messages
  let recentCommuneSection: string;
  if (recentCommune.length === 0) {
    recentCommuneSection = '_No recent commune messages._';
  } else {
    recentCommuneSection = recentCommune
      .filter((e) => e.status === 'sent')
      .map((e) => {
        const sentStr = e.sent_at
          ? new Date(e.sent_at).toLocaleString('en-US', {
              timeZone: config.timezone,
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })
          : 'unknown';
        return `- (${sentStr}) ${e.message}`;
      }).join('\n') || '_No sent messages recently._';
  }

  return `## Commune Wake-Up

**Current time**: ${timeStr}
**Can send message**: ${sendStatus.allowed ? 'Yes' : `No - ${sendStatus.reason}`}
**Messages sent today**: ${todaySent.length}/${communeConfig.max_daily_messages}

### Your Scratchpad (active entries)
${scratchpadSection}

### Upcoming Schedule (next 8 hours)
${scheduleSection}

### Recent Commune Messages You've Sent
${recentCommuneSection}
`;
}

// =============================================================================
// CURATED TOOL SET
// =============================================================================

/**
 * Returns a subset of registered tools for the commune agent.
 * The model gets only what it needs: scratchpad, calendar, messaging, search.
 */
function getCommuneTools() {
  const allowedTools = [
    'scratchpad_read',
    'scratchpad_write',
    'scratchpad_resolve',
    'get_todays_events',
    'get_upcoming_events',
    'commune_send',
    'web_search',
    'lesson_search',
  ];

  return getToolDefinitions().filter((t) =>
    allowedTools.includes(t.function.name)
  );
}

// =============================================================================
// MAIN ORCHESTRATION - AGENT ENGINE APPROACH
// =============================================================================

/**
 * Attempt proactive outreach via AgentEngine.
 * The model wakes up, reviews context, and decides what to do.
 */
export async function attemptOutreach(): Promise<{
  sent: boolean;
  reason: string;
}> {
  // Check hard guardrails first (saves LLM cost during quiet hours)
  const communeConfig = await getCommuneConfig();
  if (!communeConfig.enabled) {
    return { sent: false, reason: 'Commune is disabled' };
  }

  if (isQuietHours(communeConfig)) {
    return { sent: false, reason: 'Currently in quiet hours' };
  }

  // Gather send status (model needs to know if it CAN send)
  const sendStatus = await canSendNow();

  // Gather context for the model
  const context = await gatherCommuneContext(sendStatus);

  // Spin up AgentEngine with commune prompt + curated tools
  const engine = new AgentEngine({
    conversationId: `commune-${Date.now()}`,
    maxTurns: 8,
    systemPrompt: COMMUNE_SYSTEM_PROMPT,
    tools: getCommuneTools(),
  });

  // Let the model think
  const result = await engine.run(context);

  // Check if commune_send was called by looking at the result
  // The commune_send tool handles event recording internally
  const wasSent = result.content?.toLowerCase().includes('message sent successfully') ||
    result.content?.toLowerCase().includes('sent successfully');

  return {
    sent: wasSent,
    reason: result.success ? result.content : (result.error ?? 'Agent engine error'),
  };
}

