/**
 * Daily Brief Emailer
 *
 * Sends HTML emails via Gmail OAuth using Squire's existing Google integration.
 */

import { google } from 'googleapis';
import { getAuthenticatedClient, listSyncEnabledAccounts } from '../google/auth.js';

/**
 * Send an HTML email via Gmail
 *
 * @param accountId - Google account ID to send from
 * @param to - Recipient email address
 * @param subject - Email subject line
 * @param htmlBody - HTML content of the email
 * @returns true if sent successfully
 */
export async function sendHtmlEmail(
  accountId: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<boolean> {
  const auth = await getAuthenticatedClient(accountId);
  const gmail = google.gmail({ version: 'v1', auth });

  // Create RFC 2822 formatted message with HTML content
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    // Plain text fallback (strip HTML tags for basic plain text version)
    htmlBody
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 2000) + '...\n\nView this email in HTML mode for the full experience.',
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ];

  const rawMessage = messageParts.join('\r\n');

  // Base64 URL-safe encode the message
  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });
    console.log('[DailyBrief] Email sent successfully');
    return true;
  } catch (err) {
    console.error('[DailyBrief] Failed to send email:', err);
    return false;
  }
}

/**
 * Get the primary Google account for sending daily briefs
 *
 * Returns the first sync-enabled Google account, which should be Brian's account.
 */
export async function getPrimaryAccount(): Promise<{ id: string; email: string } | null> {
  try {
    const accounts = await listSyncEnabledAccounts();

    if (accounts.length === 0) {
      console.warn('[DailyBrief] No sync-enabled Google accounts found');
      return null;
    }

    const account = accounts[0]!;
    return {
      id: account.id,
      email: account.email,
    };
  } catch (error) {
    console.error('[DailyBrief] Error getting primary account:', error);
    return null;
  }
}

/**
 * Send the daily brief email to the primary account
 *
 * @param subject - Email subject
 * @param htmlBody - Full HTML email body
 * @returns true if sent successfully
 */
export async function sendDailyBrief(
  subject: string,
  htmlBody: string
): Promise<boolean> {
  const account = await getPrimaryAccount();

  if (!account) {
    console.error('[DailyBrief] Cannot send email - no Google account configured');
    return false;
  }

  console.log(`[DailyBrief] Sending to ${account.email}`);

  return sendHtmlEmail(account.id, account.email, subject, htmlBody);
}
