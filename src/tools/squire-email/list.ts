import type { ToolHandler, ToolSpec } from '../types.js';
import { agentmail } from '../../services/agentmail.js';

async function squireEmailListToolHandler(args: { limit?: number }): Promise<string> {
  try {
    const limit = Math.min(args.limit || 10, 50);

    const response = await agentmail.listMessages(limit, 1);

    if (response.messages.length === 0) {
      return 'No emails in Squire\'s inbox yet.';
    }

    const formatted = response.messages.map((msg, i) => {
      const date = new Date(msg.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      const from = typeof msg.from === 'string'
        ? msg.from
        : (msg.from as any[]).map((f: any) => f.name || f.email).join(', ');
      const preview = msg.preview?.substring(0, 100) || msg.text?.substring(0, 100) || msg.html?.substring(0, 100) || '(no content)';

      return `${i + 1}. [${msg.message_id}] ${date}\n   From: ${from}\n   Subject: ${msg.subject}\n   ${preview}`;
    }).join('\n\n');

    const total = response.total ?? response.count ?? response.messages.length;
    return `Showing ${response.messages.length} of ${total} emails in Squire's inbox:\n\n${formatted}\n\nUse squire_email_read with a message_id to see full content.`;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export const tools: ToolSpec[] = [
  {
    name: 'squire_email_list',
    description: 'List emails in Squire\'s configured AgentMail inbox. Shows received messages with sender, subject, and preview.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of emails to return (default 10, max 50)',
        },
      },
      required: [],
    },
    handler: squireEmailListToolHandler as ToolHandler,
  },
];
