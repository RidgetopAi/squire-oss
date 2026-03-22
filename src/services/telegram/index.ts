/**
 * Telegram Integration Module
 *
 * Exports the public interface for Telegram bot functionality.
 */

export { startTelegramPoller, stopTelegramPoller, isTelegramPollerRunning } from './poller.js';
export { isConfigured as isTelegramConfigured } from './client.js';
