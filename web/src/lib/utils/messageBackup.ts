/**
 * Message Backup Utility
 *
 * Provides localStorage backup for chat messages to prevent data loss
 * when navigating away before messages are persisted to the server.
 */

const STORAGE_KEY = 'squire_pending_messages';

export interface PendingMessage {
  id: string;
  content: string;
  conversationId: string;
  timestamp: string;
}

/**
 * Save a pending message to localStorage before sending
 */
export function savePendingMessage(message: PendingMessage): void {
  try {
    const existing = getPendingMessages();
    existing.push(message);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    console.log('[MessageBackup] Saved pending message:', message.id);
  } catch (error) {
    console.error('[MessageBackup] Failed to save pending message:', error);
  }
}

/**
 * Remove a pending message after it's been confirmed by the server
 */
export function clearPendingMessage(messageId: string): void {
  try {
    const existing = getPendingMessages();
    const filtered = existing.filter((m) => m.id !== messageId);
    if (filtered.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
    console.log('[MessageBackup] Cleared pending message:', messageId);
  } catch (error) {
    console.error('[MessageBackup] Failed to clear pending message:', error);
  }
}

/**
 * Get all pending messages from localStorage
 */
export function getPendingMessages(): PendingMessage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as PendingMessage[];
  } catch (error) {
    console.error('[MessageBackup] Failed to get pending messages:', error);
    return [];
  }
}

/**
 * Clear all pending messages (use after successful recovery)
 */
export function clearAllPendingMessages(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[MessageBackup] Cleared all pending messages');
  } catch (error) {
    console.error('[MessageBackup] Failed to clear all pending messages:', error);
  }
}

