import type { ToolHandler, ToolSpec } from '../types.js';
import { agentmail } from '../../services/agentmail.js';

async function squireEmailReplyToolHandler(args: {
  message_id: string;
  text: string;
}): Promise<string> {
  try {
    if (!args.message_id || !args.text) {
      return 'Error: message_id and text are both required';
    }

    const msg = await agentmail.replyToMessage(args.message_id, args.text);

    return `Reply sent successfully.\nMessage ID: ${msg.message_id}`;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export const tools: ToolSpec[] = [
  {
    name: 'squire_email_reply',
    description: 'Reply to an email in Squire\'s inbox. The reply will maintain the thread and use the original sender as recipient.',
    parameters: {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The message ID to reply to',
        },
        text: {
          type: 'string',
          description: 'Reply message content (plain text)',
        },
      },
      required: ['message_id', 'text'],
    },
    handler: squireEmailReplyToolHandler as ToolHandler,
  },
];
