import { config } from '../../config/index.js';
import { runAllTasks } from './tasks/index.js';

interface CourierStats {
  ticks: number;
  errors: number;
  skippedQuietHours: number;
  lastTickAt: Date | null;
}

// Module state
let intervalId: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let stats: CourierStats = { ticks: 0, errors: 0, skippedQuietHours: 0, lastTickAt: null };

// Check if current time is in quiet hours (10pm-7am EST by default)
function isQuietHours(): boolean {
  const now = new Date();
  const hour = parseInt(now.toLocaleString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: config.timezone
  }));
  const quietStart = config.courier.quietHoursStart;
  const quietEnd = config.courier.quietHoursEnd;
  return hour >= quietStart || hour < quietEnd;
}

// Retry wrapper - uses config for attempts and delay
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  attempts: number = config.courier.retryAttempts,
  delayMs: number = config.courier.retryDelayMs
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      console.error(`[Courier] Attempt ${i + 1}/${attempts} failed:`, error);
      if (i === attempts - 1) throw error;
      console.log(`[Courier] Retrying in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('Unreachable');
}

// Main tick function
async function tick(): Promise<void> {
  if (isProcessing) {
    console.log('[Courier] Tick skipped - already processing');
    return;
  }

  if (isQuietHours()) {
    console.log('[Courier] Tick skipped - quiet hours');
    stats.skippedQuietHours++;
    return;
  }

  isProcessing = true;
  console.log('[Courier] Tick starting...');

  try {
    await executeWithRetry(() => runAllTasks());
    stats.ticks++;
    stats.lastTickAt = new Date();
    console.log('[Courier] Tick complete');
  } catch (error) {
    stats.errors++;
    console.error('[Courier] Tick failed after retries:', error);
  } finally {
    isProcessing = false;
  }
}

export function start(): void {
  if (intervalId) {
    console.log('[Courier] Already running');
    return;
  }

  const intervalMs = config.courier.intervalMs;
  console.log(`[Courier] Starting with ${intervalMs}ms interval`);

  intervalId = setInterval(tick, intervalMs);

  // Run immediately on start (unless quiet hours)
  tick();
}

export function stop(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Courier] Stopped');
  }
}

export function isRunning(): boolean {
  return intervalId !== null;
}

export function getStats(): CourierStats {
  return { ...stats };
}

// Manual trigger (bypasses quiet hours check)
export async function runNow(): Promise<void> {
  console.log('[Courier] Manual run triggered');
  if (isProcessing) {
    console.log('[Courier] Already processing, skipping manual run');
    return;
  }

  isProcessing = true;
  try {
    await executeWithRetry(() => runAllTasks());
    stats.ticks++;
    stats.lastTickAt = new Date();
  } catch (error) {
    stats.errors++;
    throw error;
  } finally {
    isProcessing = false;
  }
}

export { executeWithRetry };
