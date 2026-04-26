import type { ToolHandler, ToolSpec } from '../types.js';
import { listSyncEnabledAccounts } from '../../services/google/auth.js';
import { sendEmail, type EmailAttachment } from '../../services/google/gmail.js';

interface EmailSendArgs {
  to: string;
  subject: string;
  body: string;
  attachments?: Array<{
    filename: string;
    content: string;
    mimeType: string;
  }>;
}

async function emailSendToolHandler(args: EmailSendArgs): Promise<string> {
  try {
    const accounts = await listSyncEnabledAccounts();
    if (accounts.length === 0) {
      return 'No Google account connected.';
    }

    // Convert base64 string attachments to Buffer format
    const processedAttachments: EmailAttachment[] | undefined = args.attachments?.map(att => ({
      filename: att.filename,
      content: Buffer.from(att.content, 'base64'),
      mimeType: att.mimeType,
      encoding: 'base64' as const,
    }));

    const result = await sendEmail(
      accounts[0]!.id,
      args.to,
      args.subject,
      args.body,
      processedAttachments
    );

    if (result.success) {
      const attachmentInfo = args.attachments
        ? ` with ${args.attachments.length} attachment${args.attachments.length > 1 ? 's' : ''}`
        : '';
      return `Email sent to ${args.to}${attachmentInfo}. Message ID: ${result.messageId}`;
    } else {
      return `Failed to send email: ${result.error || 'Unknown error'}`;
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export const tools: ToolSpec[] = [
  {
    name: 'email_send',
    description:
      'Compose and send an email with optional attachments. Requires recipient, subject, and body.',
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
        body: {
          type: 'string',
          description: 'Email body content (plain text)',
        },
        attachments: {
          type: 'array',
          description: 'Optional file attachments',
          items: {
            type: 'object',
            properties: {
              filename: {
                type: 'string',
                description: 'Filename including extension (e.g., "report.pdf")',
              },
              content: {
                type: 'string',
                description: 'File content as base64-encoded string',
              },
              mimeType: {
                type: 'string',
                description:
                  'MIME type (e.g., "application/pdf", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")',
              },
            },
            required: ['filename', 'content', 'mimeType'],
          },
        },
      },
      required: ['to', 'subject', 'body'],
    },
    handler: emailSendToolHandler as ToolHandler,
  },
];
