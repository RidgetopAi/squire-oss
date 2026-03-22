import type { ToolHandler, ToolSpec } from '../types.js';
import { searchEmails } from '../../services/email-cache.js';

async function emailSearchToolHandler(args: { query: string; limit?: number }): Promise<string> {
  try {
    const limit = Math.min(args.limit || 10, 20);
    const results = await searchEmails(args.query, limit);

    if (results.length === 0) {
      return `No emails found matching "${args.query}". Try different search terms — searches subject, sender, snippet, and body.`;
    }

    const formatted = results.map((e, i) => {
      const date = new Date(e.email_date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      const summary = e.summary || e.snippet.substring(0, 120);
      return `${i + 1}. [${e.gmail_id}] ${date}\n   From: ${e.from_address}\n   Subject: ${e.subject}\n   ${summary}`;
    }).join('\n\n');

    return `Found ${results.length} emails matching "${args.query}":\n\n${formatted}\n\nUse email_read with an ID to see full content.`;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export const tools: ToolSpec[] = [
  {
    name: 'email_search',
    description: 'Search cached emails by keywords. Searches across subject, sender, snippet, and body text using full-text search. Returns matching emails ranked by relevance.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query — keywords to find in email subject, sender, snippet, or body',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default 10, max 20)',
        },
      },
      required: ['query'],
    },
    handler: emailSearchToolHandler as ToolHandler,
  },
];
