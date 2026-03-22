/**
 * Commune Scheduler
 *
 * Periodically wakes up the commune agent to think and decide
 * whether to take action. Respects quiet hours and rate limits.
 */

import { config } from '../../config/index.js';
import { attemptOutreach } from '../commune.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CommuneSchedulerStats {
  ticks: number;
  attempts: number;
  sent: number;
  skipped: number;
  errors: number;
  lastTickAt: Date | null;
  lastSentAt: Date | null;
}

// =============================================================================
// STATE
// =============================================================================

let intervalId: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
const stats: CommuneSchedulerStats = {
  ticks: 0,
  attempts: 0,
  sent: 0,
  skipped: 0,
  errors: 0,
  lastTickAt: null,
  lastSentAt: null,
};

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

async function tick(): Promise<void> {
  if (isProcessing) {
    console.log('[Commune] Tick skipped - already processing');
    return;
  }

  isProcessing = true;
  stats.ticks++;
  stats.lastTickAt = new Date();

  try {
    const result = await attemptOutreach();
    stats.attempts++;

    if (result.sent) {
      stats.sent++;
      stats.lastSentAt = new Date();
      console.log(`[Commune] Outreach sent: ${result.reason.slice(0, 100)}`);
    } else {
      stats.skipped++;
      if (!['Currently in quiet hours', 'Nothing to act on right now.'].includes(result.reason)) {
        console.log(`[Commune] Outreach skipped: ${result.reason.slice(0, 100)}`);
      }
    }
  } catch (error) {
    stats.errors++;
    console.error('[Commune] Error during tick:', error);
  } finally {
    isProcessing = false;
  }
}

// =============================================================================
// LIFECYCLE
// =============================================================================

export function start(): void {
  if (intervalId) {
    console.log('[Commune] Scheduler already running');
    return;
  }

  if (!config.commune.enabled) {
    console.log('[Commune] Scheduler disabled by configuration');
    return;
  }

  const intervalMs = config.commune.intervalMs;
  console.log(`[Commune] Starting scheduler (interval: ${intervalMs / 1000 / 60}min)`);

  // Run immediately on start
  tick().catch((err) => console.error('[Commune] Initial tick error:', err));

  // Schedule periodic ticks
  intervalId = setInterval(() => {
    tick().catch((err) => console.error('[Commune] Tick error:', err));
  }, intervalMs);
}

export function stop(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Commune] Scheduler stopped');
  }
}

export function isRunning(): boolean {
  return intervalId !== null;
}

export function getStats(): CommuneSchedulerStats {
  return { ...stats };
}

export async function runNow(): Promise<{
  sent: boolean;
  reason: string;
}> {
  console.log('[Commune] Manual tick triggered');
  if (isProcessing) {
    return { sent: false, reason: 'Already processing' };
  }

  isProcessing = true;
  try {
    const result = await attemptOutreach();
    if (result.sent) {
      stats.sent++;
      stats.lastSentAt = new Date();
    }
    return result;
  } finally {
    isProcessing = false;
  }
}

// =============================================================================
// SERVER INTEGRATION HOOKS
// =============================================================================

export function initCommuneScheduler(): void {
  if (!isRunning()) {
    start();
  }
}

export function shutdownCommuneScheduler(): void {
  stop();
}
