import {
  getPendingReminders,
  getRetryableReminders,
  getSnoozedRemindersToWake,
  markReminderSent,
  markReminderFailed,
  resetReminderForRetry,
  unsnoozeReminder,
  type Reminder,
} from './planning/reminders.js';
import {
  sendReminderNotification,
  isPushConfigured,
} from './push.js';
import { getCommitment, expireCandidates } from './planning/commitments.js';

// ========================================
// Types
// ========================================

export interface SchedulerConfig {
  // How often to check for pending reminders (in ms)
  intervalMs: number;
  // Max reminders to process per tick
  batchSize: number;
  // Enable/disable logging
  verbose: boolean;
}

export interface SchedulerStats {
  isRunning: boolean;
  lastRun: Date | null;
  totalProcessed: number;
  totalSent: number;
  totalFailed: number;
  totalRetried: number;
  totalUnsnoozed: number;
}

type TickResult = {
  pending: { processed: number; sent: number; failed: number };
  retries: { processed: number; sent: number; failed: number };
  snoozed: { woken: number };
};

// ========================================
// Scheduler State
// ========================================

const DEFAULT_CONFIG: SchedulerConfig = {
  intervalMs: 60000, // 1 minute
  batchSize: 100,
  verbose: process.env.NODE_ENV !== 'production',
};

let config: SchedulerConfig = { ...DEFAULT_CONFIG };
let intervalId: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

const stats: SchedulerStats = {
  isRunning: false,
  lastRun: null,
  totalProcessed: 0,
  totalSent: 0,
  totalFailed: 0,
  totalRetried: 0,
  totalUnsnoozed: 0,
};

// ========================================
// Core Scheduler Functions
// ========================================

/**
 * Start the scheduler
 */
export function start(customConfig?: Partial<SchedulerConfig>): void {
  if (intervalId) {
    console.log('[Scheduler] Already running');
    return;
  }

  config = { ...DEFAULT_CONFIG, ...customConfig };

  if (!isPushConfigured()) {
    console.warn('[Scheduler] Push notifications not configured. Reminders will be processed but not delivered.');
  }

  log(`Starting scheduler (interval: ${config.intervalMs}ms, batch: ${config.batchSize})`);

  // Run immediately, then on interval
  tick().catch(err => console.error('[Scheduler] Initial tick error:', err));

  intervalId = setInterval(() => {
    tick().catch(err => console.error('[Scheduler] Tick error:', err));
  }, config.intervalMs);

  stats.isRunning = true;
}

/**
 * Stop the scheduler
 */
export function stop(): void {
  if (!intervalId) {
    console.log('[Scheduler] Not running');
    return;
  }

  clearInterval(intervalId);
  intervalId = null;
  stats.isRunning = false;
  log('Scheduler stopped');
}

/**
 * Check if scheduler is running
 */
export function isRunning(): boolean {
  return stats.isRunning;
}

/**
 * Get scheduler stats
 */
export function getStats(): SchedulerStats {
  return { ...stats };
}

// ========================================
// Internal Processing
// ========================================

/**
 * Single tick of the scheduler
 */
async function tick(): Promise<TickResult> {
  // Prevent concurrent processing
  if (isProcessing) {
    log('Skipping tick - still processing previous');
    return {
      pending: { processed: 0, sent: 0, failed: 0 },
      retries: { processed: 0, sent: 0, failed: 0 },
      snoozed: { woken: 0 },
    };
  }

  isProcessing = true;
  stats.lastRun = new Date();

  try {
    // Process pending reminders
    const pendingResult = await processPendingReminders();

    // Process failed reminders ready for retry
    const retryResult = await processRetryableReminders();

    // Wake snoozed reminders
    const snoozedResult = await processSnoozedReminders();

    // Phase 4: Expire unconfirmed commitment candidates (24h TTL)
    let expiredCount = 0;
    try {
      expiredCount = await expireCandidates();
    } catch (err) {
      console.error('[Scheduler] Failed to expire candidates:', err);
    }

    // Update stats
    stats.totalProcessed += pendingResult.processed + retryResult.processed;
    stats.totalSent += pendingResult.sent + retryResult.sent;
    stats.totalFailed += pendingResult.failed + retryResult.failed;
    stats.totalRetried += retryResult.processed;
    stats.totalUnsnoozed += snoozedResult.woken;

    if (config.verbose && (pendingResult.processed > 0 || retryResult.processed > 0 || snoozedResult.woken > 0 || expiredCount > 0)) {
      log(`Tick complete: pending=${pendingResult.sent}/${pendingResult.processed}, retries=${retryResult.sent}/${retryResult.processed}, unsnoozed=${snoozedResult.woken}, expired=${expiredCount}`);
    }

    return {
      pending: pendingResult,
      retries: retryResult,
      snoozed: snoozedResult,
    };
  } finally {
    isProcessing = false;
  }
}

/**
 * Process pending reminders that are due
 */
async function processPendingReminders(): Promise<{ processed: number; sent: number; failed: number }> {
  const reminders = await getPendingReminders({ limit: config.batchSize });

  if (reminders.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const reminder of reminders) {
    const success = await deliverReminder(reminder);
    if (success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { processed: reminders.length, sent, failed };
}

/**
 * Process failed reminders ready for retry
 */
async function processRetryableReminders(): Promise<{ processed: number; sent: number; failed: number }> {
  const reminders = await getRetryableReminders({ limit: config.batchSize });

  if (reminders.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const reminder of reminders) {
    // Reset to pending first
    const reset = await resetReminderForRetry(reminder.id);
    if (!reset) continue;

    const success = await deliverReminder(reset);
    if (success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { processed: reminders.length, sent, failed };
}

/**
 * Wake up snoozed reminders
 */
async function processSnoozedReminders(): Promise<{ woken: number }> {
  const reminders = await getSnoozedRemindersToWake({ limit: config.batchSize });

  if (reminders.length === 0) {
    return { woken: 0 };
  }

  let woken = 0;
  for (const reminder of reminders) {
    const result = await unsnoozeReminder(reminder.id);
    if (result) {
      woken++;
    }
  }

  return { woken };
}

/**
 * Deliver a single reminder
 */
async function deliverReminder(reminder: Reminder): Promise<boolean> {
  try {
    // Build notification content
    let title = reminder.title || 'Reminder';
    let body = reminder.body || '';
    let commitmentId: string | undefined;

    // If linked to a commitment, get its details
    if (reminder.commitment_id) {
      const commitment = await getCommitment(reminder.commitment_id);
      if (commitment) {
        title = commitment.title;
        body = commitment.description || '';
        commitmentId = commitment.id;

        // Add due date context
        if (commitment.due_at) {
          const dueDate = new Date(commitment.due_at);
          const now = new Date();
          const diffMs = dueDate.getTime() - now.getTime();
          const diffMins = Math.round(diffMs / 60000);

          if (diffMins > 0 && diffMins <= 60) {
            body = `Due in ${diffMins} minutes. ${body}`.trim();
          } else if (diffMins > 60 && diffMins <= 1440) {
            const hours = Math.round(diffMins / 60);
            body = `Due in ${hours} hour${hours > 1 ? 's' : ''}. ${body}`.trim();
          } else if (diffMins < 0) {
            body = `Overdue! ${body}`.trim();
          }
        }
      }
    }

    // Send push notification
    const results = await sendReminderNotification(
      reminder.id,
      title,
      body,
      {
        commitmentId,
        url: commitmentId ? `/app/commitments/${commitmentId}` : '/app/commitments',
      }
    );

    // Check if any notification was sent successfully
    const anySent = results.some(r => r.success);

    if (anySent) {
      await markReminderSent(reminder.id);
      log(`Delivered reminder ${reminder.id}: "${title}"`);
      return true;
    } else {
      // No active subscriptions or all failed
      const errorMsg = results.length === 0
        ? 'No active push subscriptions'
        : results.map(r => r.error).join('; ');

      await markReminderFailed(reminder.id, errorMsg);
      log(`Failed to deliver reminder ${reminder.id}: ${errorMsg}`);
      return false;
    }
  } catch (error) {
    const err = error as Error;
    await markReminderFailed(reminder.id, err.message);
    console.error(`[Scheduler] Error delivering reminder ${reminder.id}:`, err);
    return false;
  }
}

/**
 * Log helper
 */
function log(message: string): void {
  if (config.verbose) {
    console.log(`[Scheduler] ${message}`);
  }
}

// ========================================
// Lifecycle hooks for server integration
// ========================================

/**
 * Initialize scheduler on server startup
 * Call this from your main server file
 */
export function initScheduler(customConfig?: Partial<SchedulerConfig>): void {
  // Only start if not already running
  if (!isRunning()) {
    start(customConfig);
  }
}

/**
 * Graceful shutdown
 * Call this before server shutdown
 */
export function shutdownScheduler(): void {
  stop();
}
