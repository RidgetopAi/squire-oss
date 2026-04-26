/**
 * Daily Brief Courier Task
 *
 * Sends the daily brief email at 7:00 AM EDT.
 * The task runs on each Courier tick (every 30 minutes) but only
 * triggers the actual brief generation when:
 * 1. It's 7:00 AM (within the current hour)
 * 2. It hasn't already sent today
 *
 * This ensures the user gets exactly one daily brief per day.
 */

import { config } from '../../../config/index.js';
import { generateAndSendDailyBrief } from '../../daily-brief/index.js';
import type { CourierTask, TaskResult } from './index.js';

// The hour to send the daily brief (7 AM)
const DAILY_BRIEF_HOUR = 7;

// Track the last date we sent to avoid duplicates
let lastSentDate: string | null = null;

/**
 * Get today's date string in the configured timezone (YYYY-MM-DD)
 */
function getTodayDateString(): string {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: config.timezone });
}

/**
 * Get the current hour in the configured timezone (0-23)
 */
function getCurrentHour(): number {
  const now = new Date();
  return parseInt(
    now.toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: config.timezone,
    })
  );
}

/**
 * Check if it's time to send the daily brief
 *
 * Returns true if:
 * - We're in the target hour (7 AM)
 * - We haven't already sent today
 */
function shouldSendBrief(): { shouldSend: boolean; reason: string } {
  const todayDate = getTodayDateString();
  const currentHour = getCurrentHour();

  // Check if already sent today
  if (lastSentDate === todayDate) {
    return {
      shouldSend: false,
      reason: `Already sent today (${todayDate})`,
    };
  }

  // Check if it's the right hour
  if (currentHour !== DAILY_BRIEF_HOUR) {
    return {
      shouldSend: false,
      reason: `Not time yet (current: ${currentHour}h, target: ${DAILY_BRIEF_HOUR}h)`,
    };
  }

  return {
    shouldSend: true,
    reason: `Ready to send (${todayDate} at ${currentHour}h)`,
  };
}

export const dailyBriefTask: CourierTask = {
  name: 'daily-brief',
  enabled: true,

  async execute(): Promise<TaskResult> {
    try {
      const { shouldSend, reason } = shouldSendBrief();

      if (!shouldSend) {
        console.log(`[DailyBrief] Skipped: ${reason}`);
        return {
          success: true,
          message: reason,
        };
      }

      console.log(`[DailyBrief] ${reason} - generating and sending...`);

      const result = await generateAndSendDailyBrief();

      if (result.success) {
        // Mark as sent for today
        lastSentDate = getTodayDateString();

        console.log(`[DailyBrief] Sent successfully to ${result.recipient}`);
        return {
          success: true,
          message: result.message,
          data: { recipient: result.recipient, sentDate: lastSentDate },
        };
      } else {
        console.error(`[DailyBrief] Failed: ${result.message}`);
        return {
          success: false,
          message: result.message,
        };
      }
    } catch (error) {
      console.error('[DailyBrief] Error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Force send the daily brief (bypasses time/duplicate checks)
 * Useful for testing or manual triggers
 */
export async function forceSendDailyBrief(): Promise<TaskResult> {
  console.log('[DailyBrief] Force send triggered');

  const result = await generateAndSendDailyBrief();

  if (result.success) {
    return {
      success: true,
      message: `Force sent: ${result.message}`,
      data: { recipient: result.recipient },
    };
  } else {
    return {
      success: false,
      message: `Force send failed: ${result.message}`,
    };
  }
}

/**
 * Reset the "sent today" flag (for testing)
 */
export function resetDailyBriefState(): void {
  lastSentDate = null;
  console.log('[DailyBrief] State reset');
}
