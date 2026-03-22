import { config } from '../../config/index.js';
import { broadcastEmailSummary } from '../../api/socket/broadcast.js';
import type { EmailSummary } from './summarizer.js';

export interface NotifyOptions {
  channels?: ('telegram' | 'webapp')[];
  priority?: 'normal' | 'high';
}

// Telegram max message length
const TELEGRAM_MAX_LENGTH = 4000; // Leave some buffer from 4096

/**
 * Truncate message to fit Telegram limits
 */
function truncateForTelegram(message: string): string {
  if (message.length <= TELEGRAM_MAX_LENGTH) return message;
  return message.substring(0, TELEGRAM_MAX_LENGTH - 20) + '\n\n... (truncated)';
}

async function sendTelegram(message: string, useMarkdown = true): Promise<void> {
  const token = config.telegram.botToken;
  const chatIds = config.telegram.allowedUserIds;

  if (!token || chatIds.length === 0) {
    console.log('[Notifier] Telegram not configured, skipping');
    return;
  }

  // Truncate long messages
  const truncatedMessage = truncateForTelegram(message);

  for (const chatId of chatIds) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: truncatedMessage,
          parse_mode: useMarkdown ? 'Markdown' : undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Notifier] Telegram error for ${chatId}:`, errorText);

        // If markdown parsing failed, retry without markdown
        if (useMarkdown && errorText.includes("can't parse entities")) {
          console.log('[Notifier] Retrying without markdown...');
          await sendTelegram(message.replace(/[*_`\[\]]/g, ''), false);
        }
      }
    } catch (error) {
      console.error(`[Notifier] Telegram send failed for ${chatId}:`, error);
    }
  }
}

export async function notify(message: string, options: NotifyOptions = {}): Promise<void> {
  const channels = options.channels || ['telegram', 'webapp'];

  if (channels.includes('telegram')) {
    await sendTelegram(message);
  }

  if (channels.includes('webapp')) {
    // Generic broadcast - could add a generic notification event
    console.log('[Notifier] Webapp notification:', message.substring(0, 50));
  }
}

export async function notifyEmailSummary(emails: EmailSummary[]): Promise<void> {
  if (emails.length === 0) {
    console.log('[Notifier] No emails to notify');
    return;
  }

  // Build message with better formatting
  const header = `📧 *Email Summary* (${emails.length} new)\n\n`;

  // Format each email with spacing and structure
  // Escape subject and summary to prevent markdown parsing errors
  const body = emails.map((e, i) => {
    const senderPart = e.from.split('<')[0];
    const sender = senderPart?.trim() || e.from;
    // Escape markdown-breaking characters in user content
    const safeSubject = e.subject.replace(/[*_`\[\]]/g, '');
    const safeSummary = e.summary.replace(/[*_`\[\]]/g, '');
    return `*${i + 1}. ${sender}*\n${safeSubject}\n${safeSummary}\n_ID: ${e.id}_`;
  }).join('\n\n');

  const footer = '\n\n─────────────────\n_Say "check email" for full details_';
  const message = header + body + footer;

  // Send to Telegram
  await sendTelegram(message);

  // Broadcast to webapp via Socket.IO
  broadcastEmailSummary({
    count: emails.length,
    emails: emails.map(e => ({
      id: e.id,
      from: e.from,
      subject: e.subject,
      summary: e.summary,
    })),
  });

  console.log(`[Notifier] Email summary sent: ${emails.length} emails`);
}

export async function notifyNoEmails(): Promise<void> {
  // Optional: notify when no new emails
  // For now, just log it
  console.log('[Notifier] No new emails');
}
