import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth.js';

export interface Email {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: Date;
  isUnread: boolean;
}

export interface EmailFull extends Email {
  body: string;
  to: string[];
  cc?: string[];
}

/**
 * Parse email headers to extract specific header value
 */
function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string
): string {
  if (!headers) return '';
  const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

/**
 * Parse email addresses from a header value (handles "Name <email>" format)
 */
function parseEmailAddresses(headerValue: string): string[] {
  if (!headerValue) return [];

  // Split by comma, handling quoted strings
  const addresses: string[] = [];
  let current = '';
  let inQuotes = false;
  let inAngleBracket = false;

  for (const char of headerValue) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === '<') {
      inAngleBracket = true;
      current += char;
    } else if (char === '>') {
      inAngleBracket = false;
      current += char;
    } else if (char === ',' && !inQuotes && !inAngleBracket) {
      if (current.trim()) {
        addresses.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    addresses.push(current.trim());
  }

  return addresses;
}

/**
 * Decode base64url encoded string
 */
function decodeBase64Url(data: string): string {
  // Replace URL-safe characters with standard base64 characters
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Extract plain text body from message payload
 * Handles both simple and multipart messages
 */
function extractBody(payload: {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: Array<{
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: Array<{
      mimeType?: string | null;
      body?: { data?: string | null } | null;
    }>;
  }>;
} | undefined): string {
  if (!payload) return '';

  // Simple message with body directly in payload
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart message - look for text/plain or text/html
  if (payload.parts) {
    // First, try to find text/plain
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      // Check nested parts (for multipart/alternative inside multipart/mixed)
      if (part.parts) {
        for (const nestedPart of part.parts) {
          if (nestedPart.mimeType === 'text/plain' && nestedPart.body?.data) {
            return decodeBase64Url(nestedPart.body.data);
          }
        }
      }
    }

    // Fall back to text/html if no plain text
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.parts) {
        for (const nestedPart of part.parts) {
          if (nestedPart.mimeType === 'text/html' && nestedPart.body?.data) {
            return decodeBase64Url(nestedPart.body.data);
          }
        }
      }
    }
  }

  return '';
}

/**
 * List unread emails for an account
 */
export async function listUnread(accountId: string, since?: Date): Promise<Email[]> {
  const auth = await getAuthenticatedClient(accountId);
  const gmail = google.gmail({ version: 'v1', auth });

  // Build query string
  let query = 'is:unread';
  if (since) {
    // Gmail uses epoch seconds for after: query
    const epochSeconds = Math.floor(since.getTime() / 1000);
    query += ` after:${epochSeconds}`;
  }

  // Get list of message IDs
  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 20,
  });

  const messages = listResponse.data.messages || [];
  if (messages.length === 0) {
    return [];
  }

  // Fetch each message to get details
  const emails: Email[] = [];
  for (const msg of messages) {
    if (!msg.id) continue;

    const messageResponse = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    });

    const message = messageResponse.data;
    const headers = message.payload?.headers;

    emails.push({
      id: message.id || '',
      threadId: message.threadId || '',
      from: getHeader(headers, 'From'),
      subject: getHeader(headers, 'Subject'),
      snippet: message.snippet || '',
      date: new Date(getHeader(headers, 'Date') || message.internalDate || Date.now()),
      isUnread: message.labelIds?.includes('UNREAD') || false,
    });
  }

  return emails;
}

/**
 * Get full email details including body
 */
export async function getEmail(accountId: string, emailId: string): Promise<EmailFull> {
  const auth = await getAuthenticatedClient(accountId);
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.messages.get({
    userId: 'me',
    id: emailId,
    format: 'full',
  });

  const message = response.data;
  const headers = message.payload?.headers;

  return {
    id: message.id || '',
    threadId: message.threadId || '',
    from: getHeader(headers, 'From'),
    subject: getHeader(headers, 'Subject'),
    snippet: message.snippet || '',
    date: new Date(getHeader(headers, 'Date') || message.internalDate || Date.now()),
    isUnread: message.labelIds?.includes('UNREAD') || false,
    body: extractBody(message.payload),
    to: parseEmailAddresses(getHeader(headers, 'To')),
    cc: parseEmailAddresses(getHeader(headers, 'Cc')) || undefined,
  };
}

/**
 * Move an email to trash
 */
export async function trashEmail(accountId: string, emailId: string): Promise<boolean> {
  const auth = await getAuthenticatedClient(accountId);
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    await gmail.users.messages.trash({
      userId: 'me',
      id: emailId,
    });
    return true;
  } catch (err) {
    console.error('Failed to trash email:', err);
    return false;
  }
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  mimeType: string;
  encoding?: 'base64' | 'binary';
}

/**
 * Send an email with optional attachments
 */
export async function sendEmail(
  accountId: string,
  to: string,
  subject: string,
  body: string,
  attachments?: EmailAttachment[]
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const auth = await getAuthenticatedClient(accountId);
  const gmail = google.gmail({ version: 'v1', auth });

  let rawMessage: string;

  if (!attachments || attachments.length === 0) {
    // Simple plain text message (backward compatible)
    const messageParts = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body,
    ];
    rawMessage = messageParts.join('\r\n');
  } else {
    // Multipart MIME message with attachments
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    const messageParts = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
      '',
    ];

    // Add each attachment
    for (const attachment of attachments) {
      const encoding = attachment.encoding || 'base64';
      let contentData: string;

      if (Buffer.isBuffer(attachment.content)) {
        // Convert Buffer to base64
        contentData = attachment.content.toString('base64');
      } else if (encoding === 'base64') {
        // Already base64 encoded
        contentData = attachment.content;
      } else {
        // String content, encode to base64
        contentData = Buffer.from(attachment.content).toString('base64');
      }

      messageParts.push(`--${boundary}`);
      messageParts.push(`Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`);
      messageParts.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
      messageParts.push('Content-Transfer-Encoding: base64');
      messageParts.push('');

      // Split base64 content into 76-character lines per RFC 2045
      const lines = contentData.match(/.{1,76}/g) || [];
      messageParts.push(...lines);
      messageParts.push('');
    }

    // Close boundary
    messageParts.push(`--${boundary}--`);

    rawMessage = messageParts.join('\r\n');
  }

  // Base64 URL-safe encode the message
  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });
    return {
      success: true,
      messageId: response.data.id || undefined,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to send email:', err);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Mark an email as read (remove UNREAD label)
 */
export async function markAsRead(accountId: string, emailId: string): Promise<boolean> {
  const auth = await getAuthenticatedClient(accountId);
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    await gmail.users.messages.modify({
      userId: 'me',
      id: emailId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });
    return true;
  } catch (err) {
    console.error('Failed to mark email as read:', err);
    return false;
  }
}

/**
 * Mark multiple emails as read
 */
export async function markManyAsRead(accountId: string, emailIds: string[]): Promise<number> {
  let marked = 0;
  for (const id of emailIds) {
    if (await markAsRead(accountId, id)) {
      marked++;
    }
  }
  return marked;
}

/**
 * Archive an email (remove from inbox but keep in All Mail)
 */
export async function archiveEmail(accountId: string, emailId: string): Promise<boolean> {
  const auth = await getAuthenticatedClient(accountId);
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    await gmail.users.messages.modify({
      userId: 'me',
      id: emailId,
      requestBody: {
        removeLabelIds: ['INBOX'],
      },
    });
    return true;
  } catch (err) {
    console.error('Failed to archive email:', err);
    return false;
  }
}
