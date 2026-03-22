/**
 * Telegram Bot API Client
 *
 * A typed wrapper around the Telegram Bot API.
 * Handles HTTP communication with Telegram's servers.
 */

import { config } from '../../config/index.js';

// === Types ===

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  // We can add more fields as needed (photos, documents, etc.)
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  // We can add edited_message, callback_query, etc. as needed
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

// === Client ===

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

/**
 * Make a request to the Telegram Bot API
 */
async function apiRequest<T>(
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  const token = config.telegram.botToken;
  if (!token) {
    throw new Error('Telegram bot token not configured');
  }

  const url = `${TELEGRAM_API_BASE}${token}/${method}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: params ? JSON.stringify(params) : undefined,
  });

  const data = await response.json() as TelegramResponse<T>;

  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description ?? 'Unknown error'} (code: ${data.error_code})`);
  }

  return data.result as T;
}

/**
 * Get bot information (useful for verifying token is valid)
 */
export async function getMe(): Promise<TelegramUser> {
  return apiRequest<TelegramUser>('getMe');
}

/**
 * Get updates using long-polling
 *
 * @param offset - Identifier of the first update to be returned (use last update_id + 1)
 * @param timeout - Timeout in seconds for long polling (0 = short polling)
 */
export async function getUpdates(
  offset?: number,
  timeout: number = 30
): Promise<TelegramUpdate[]> {
  return apiRequest<TelegramUpdate[]>('getUpdates', {
    offset,
    timeout,
    allowed_updates: ['message'], // Only get message updates for now
  });
}

/**
 * Send a text message
 *
 * @param chatId - Target chat ID
 * @param text - Message text (supports Markdown)
 * @param parseMode - Optional parse mode ('Markdown' or 'HTML')
 */
export async function sendMessage(
  chatId: number,
  text: string,
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'
): Promise<TelegramMessage> {
  // Telegram has a 4096 character limit for messages
  // If the message is longer, we need to split it
  const MAX_LENGTH = 4096;

  if (text.length <= MAX_LENGTH) {
    return apiRequest<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    });
  }

  // Split long messages
  // Try to split at newlines or spaces to avoid breaking words
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Find a good break point
    let breakPoint = MAX_LENGTH;
    const lastNewline = remaining.lastIndexOf('\n', MAX_LENGTH);
    const lastSpace = remaining.lastIndexOf(' ', MAX_LENGTH);

    if (lastNewline > MAX_LENGTH * 0.7) {
      breakPoint = lastNewline + 1;
    } else if (lastSpace > MAX_LENGTH * 0.7) {
      breakPoint = lastSpace + 1;
    }

    chunks.push(remaining.substring(0, breakPoint));
    remaining = remaining.substring(breakPoint);
  }

  // Send each chunk
  let lastMessage: TelegramMessage | null = null;
  for (const chunk of chunks) {
    lastMessage = await apiRequest<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text: chunk,
      parse_mode: parseMode,
    });
  }

  return lastMessage!;
}

/**
 * Send a "typing" indicator
 */
export async function sendTypingAction(chatId: number): Promise<boolean> {
  return apiRequest<boolean>('sendChatAction', {
    chat_id: chatId,
    action: 'typing',
  });
}

/**
 * Check if Telegram is configured and ready
 */
export function isConfigured(): boolean {
  return (
    config.telegram.botToken !== '' &&
    config.telegram.allowedUserIds.length > 0
  );
}

/**
 * Check if a user ID is allowed to interact with the bot
 */
export function isUserAllowed(userId: number): boolean {
  return config.telegram.allowedUserIds.includes(String(userId));
}
