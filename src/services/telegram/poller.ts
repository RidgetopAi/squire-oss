/**
 * Telegram Long-Polling Service
 *
 * Continuously polls the Telegram API for new updates
 * and routes messages to the handler.
 */

import { config } from '../../config/index.js';
import { getUpdates, getMe, isConfigured, type TelegramUpdate } from './client.js';
import { handleTelegramMessage } from './handler.js';

// Track the last update ID to avoid processing duplicates
let lastUpdateId: number | undefined;

// Track if poller is running
let isRunning = false;
let shouldStop = false;

/**
 * Process a batch of updates
 */
async function processUpdates(updates: TelegramUpdate[]): Promise<void> {
  for (const update of updates) {
    // Update the offset for next poll
    lastUpdateId = update.update_id + 1;

    // Handle message updates
    if (update.message) {
      try {
        await handleTelegramMessage(update.message);
      } catch (error) {
        console.error('[Telegram] Error processing message:', error);
        // Continue processing other updates
      }
    }
  }
}

/**
 * Single poll iteration
 */
async function poll(): Promise<void> {
  try {
    // Use long-polling (30 second timeout on Telegram's side)
    const updates = await getUpdates(lastUpdateId, 30);

    if (updates.length > 0) {
      console.log(`[Telegram] Received ${updates.length} update(s)`);
      await processUpdates(updates);
    }
  } catch (error) {
    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes('ETIMEOUT') || error.message.includes('network')) {
        console.log('[Telegram] Network timeout, retrying...');
      } else if (error.message.includes('409')) {
        // Conflict - another instance is polling
        console.error('[Telegram] Conflict: Another bot instance is running. Stopping poller.');
        shouldStop = true;
        return;
      } else {
        console.error('[Telegram] Poll error:', error.message);
      }
    } else {
      console.error('[Telegram] Unknown poll error:', error);
    }

    // Wait before retrying on error
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

/**
 * Main polling loop
 */
async function pollingLoop(): Promise<void> {
  console.log('[Telegram] Polling loop started');

  while (isRunning && !shouldStop) {
    await poll();

    // Small delay between polls to prevent tight loop
    // (getUpdates already has 30s long-poll timeout)
    if (isRunning && !shouldStop) {
      await new Promise((resolve) =>
        setTimeout(resolve, config.telegram.pollingIntervalMs)
      );
    }
  }

  console.log('[Telegram] Polling loop stopped');
  isRunning = false;
}

/**
 * Start the Telegram polling service
 */
export async function startTelegramPoller(): Promise<boolean> {
  if (!isConfigured()) {
    console.log('[Telegram] Not configured, skipping poller start');
    return false;
  }

  if (isRunning) {
    console.log('[Telegram] Poller already running');
    return true;
  }

  // Verify bot token by calling getMe
  try {
    const bot = await getMe();
    console.log(`[Telegram] Bot authenticated: @${bot.username} (${bot.first_name})`);
  } catch (error) {
    console.error('[Telegram] Failed to authenticate bot:', error);
    return false;
  }

  // Log allowed users
  const allowedUsers = config.telegram.allowedUserIds;
  console.log(`[Telegram] Allowed user IDs: ${allowedUsers.join(', ')}`);

  // Start polling
  isRunning = true;
  shouldStop = false;

  // Run polling loop in background (don't await)
  pollingLoop().catch((error) => {
    console.error('[Telegram] Polling loop crashed:', error);
    isRunning = false;
  });

  return true;
}

/**
 * Stop the Telegram polling service
 */
export function stopTelegramPoller(): void {
  if (!isRunning) {
    return;
  }

  console.log('[Telegram] Stopping poller...');
  shouldStop = true;
}

/**
 * Check if poller is running
 */
export function isTelegramPollerRunning(): boolean {
  return isRunning;
}
