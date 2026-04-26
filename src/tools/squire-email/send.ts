import type { ToolHandler, ToolSpec } from '../types.js';
import { agentmail } from '../../services/agentmail.js';

async function squireEmailSendToolHandler(args: {
  to: string;
  subject: string;
  text: string;
}): Promise<string> {
  try {
    if (!args.to || !args.subject || !args.text) {
      return 'Error: to, subject, and text are all required';
    }

    const msg = await agentmail.sendMessage(args.to, args.subject, args.text);

    return `Email sent to ${args.to}.\nMessage ID: ${msg.message_id}`;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export const tools: ToolSpec[] = [
  {
    name: 'squire_email_send',
    description: 'Send an email from Squire\'s configured AgentMail address. Requires recipient, subject, and message text.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        text: {
          type: 'string',
          description: 'Email body content (plain text)',
        },
      },
      required: ['to', 'subject', 'text'],
    },
    handler: squireEmailSendToolHandler as ToolHandler,
  },
];
