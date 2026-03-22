import type { ToolHandler, ToolSpec } from '../types.js';
import { listSyncEnabledAccounts } from '../../services/google/auth.js';
import { getEmail } from '../../services/google/gmail.js';
import { getCachedEmail, cacheEmailBody } from '../../services/email-cache.js';

async function emailReadToolHandler(args: { emailId: string }): Promise<string> {
  try {
    // Check local cache first
    const cached = await getCachedEmail(args.emailId);

    if (cached?.body) {
      // Full body already cached — return it without hitting Gmail
      const to = Array.isArray(cached.to_addresses) ? cached.to_addresses.join(', ') : '';
      const cc = Array.isArray(cached.cc_addresses) && cached.cc_addresses.length > 0
        ? `Cc: ${cached.cc_addresses.join(', ')}\n` : '';
      const date = new Date(cached.email_date).toLocaleString();

      return `From: ${cached.from_address}\nTo: ${to}\n${cc}Date: ${date}\nSubject: ${cached.subject}\n\n${cached.body}`;
    }

    // Body not cached — fetch from Gmail API (works on read emails too)
    const accounts = await listSyncEnabledAccounts();
    if (accounts.length === 0) {
      return 'No Google account connected.';
    }

    const email = await getEmail(accounts[0]!.id, args.emailId);

    // Cache the body for next time
    try {
      await cacheEmailBody(args.emailId, email);
    } catch (cacheError) {
      console.warn('[EmailRead] Failed to cache body:', cacheError);
    }

    const cc = email.cc?.length ? `Cc: ${email.cc.join(', ')}\n` : '';
    return `From: ${email.from}\nTo: ${email.to.join(', ')}\n${cc}Date: ${email.date.toLocaleString()}\nSubject: ${email.subject}\n\n${email.body}`;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export const tools: ToolSpec[] = [
  {
    name: 'email_read',
    description: 'Read the full content of a specific email by its Gmail ID. Checks local cache first, fetches from Gmail if body not yet cached. Works on both read and unread emails.',
    parameters: {
      type: 'object',
      properties: {
        emailId: {
          type: 'string',
          description: 'The Gmail message ID (from email_list or email_search results)',
        },
      },
      required: ['emailId'],
    },
    handler: emailReadToolHandler as ToolHandler,
  },
];
