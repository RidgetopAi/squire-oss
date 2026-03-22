import type { ToolHandler, ToolSpec } from '../types.js';
import { listSyncEnabledAccounts } from '../../services/google/auth.js';
import { trashEmail } from '../../services/google/gmail.js';

async function emailDeleteToolHandler(args: { emailId: string }): Promise<string> {
  try {
    const accounts = await listSyncEnabledAccounts();
    if (accounts.length === 0) {
      return 'No Google account connected.';
    }

    const success = await trashEmail(accounts[0]!.id, args.emailId);

    if (success) {
      return 'Email moved to trash.';
    } else {
      return 'Failed to delete email.';
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export const tools: ToolSpec[] = [
  {
    name: 'email_delete',
    description: 'Move an email to trash. Use email_list first to get email IDs.',
    parameters: {
      type: 'object',
      properties: {
        emailId: {
          type: 'string',
          description: 'The email ID to delete (from email_list results)',
        },
      },
      required: ['emailId'],
    },
    handler: emailDeleteToolHandler as ToolHandler,
  },
];
