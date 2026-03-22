import type { ToolHandler, ToolSpec } from '../types.js';
import { listCachedEmails, getEmailCount } from '../../services/email-cache.js';

async function emailListToolHandler(args: {
  limit?: number;
  from?: string;
  since?: string;
}): Promise<string> {
  try {
    const limit = Math.min(args.limit || 15, 30);
    const since = args.since ? new Date(args.since) : undefined;

    const emails = await listCachedEmails({
      limit,
      from: args.from,
      since,
    });

    if (emails.length === 0) {
      const total = await getEmailCount();
      if (total === 0) {
        return 'No emails cached yet. Emails are cached during periodic checks (every 30 min), or say "check email" to trigger one now.';
      }
      return `No emails match your filters. There are ${total} emails in the cache total.`;
    }

    const total = await getEmailCount();

    const formatted = emails.map((e, i) => {
      const date = new Date(e.email_date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      const summary = e.summary || e.snippet.substring(0, 120);
      return `${i + 1}. [${e.gmail_id}] ${date}\n   From: ${e.from_address}\n   Subject: ${e.subject}\n   ${summary}`;
    }).join('\n\n');

    return `Showing ${emails.length} of ${total} cached emails:\n\n${formatted}\n\nUse email_read with an ID to see full content, or email_search to find specific emails.`;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export const tools: ToolSpec[] = [
  {
    name: 'email_list',
    description: 'List emails from the local cache. Shows all previously received emails (not just unread). Supports filtering by sender and date.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of emails to return (default 15, max 30)',
        },
        from: {
          type: 'string',
          description: 'Filter by sender name or email address (partial match)',
        },
        since: {
          type: 'string',
          description: 'Only show emails after this date (ISO 8601 or natural like "2025-01-15")',
        },
      },
      required: [],
    },
    handler: emailListToolHandler as ToolHandler,
  },
];
