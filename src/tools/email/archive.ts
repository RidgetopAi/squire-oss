import type { ToolHandler, ToolSpec } from '../types.js';
import { listSyncEnabledAccounts } from '../../services/google/auth.js';
import { archiveEmail } from '../../services/google/gmail.js';

async function emailArchiveToolHandler(args: { emailId: string }): Promise<string> {
  try {
    const accounts = await listSyncEnabledAccounts();
    if (accounts.length === 0) {
      return 'No Google account connected.';
    }

    const success = await archiveEmail(accounts[0]!.id, args.emailId);

    if (success) {
      return 'Email archived.';
    } else {
      return 'Failed to archive email.';
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export const tools: ToolSpec[] = [
  {
    name: 'email_archive',
    description: 'Archive an email (remove from inbox but keep in All Mail). Use email_list first to get email IDs.',
    parameters: {
      type: 'object',
      properties: {
        emailId: {
          type: 'string',
          description: 'The email ID to archive (from email_list results)',
        },
      },
      required: ['emailId'],
    },
    handler: emailArchiveToolHandler as ToolHandler,
  },
];
