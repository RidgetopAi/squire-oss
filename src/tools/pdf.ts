import type { ToolHandler, ToolSpec } from './types.js';
import { spawn } from 'child_process';
import { listSyncEnabledAccounts, getAuthenticatedClient } from '../services/google/auth.js';
import { google } from 'googleapis';
import { getObjectData } from '../services/storage/objects.js';

/**
 * Call the Python PDF form fill script
 */
async function callPdfScript(command: string, data: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', ['/opt/squire/scripts/pdf_form_fill.py', command]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      } catch (err) {
        reject(new Error(`Failed to parse Python output: ${stdout}`));
      }
    });

    python.on('error', (err) => {
      reject(new Error(`Failed to spawn Python: ${err.message}`));
    });

    // Send input data via stdin
    python.stdin.write(JSON.stringify(data));
    python.stdin.end();
  });
}

/**
 * List all form fields in a PDF
 */
async function pdfListFieldsHandler(args: { pdf_b64: string }): Promise<string> {
  try {
    const result = await callPdfScript('list', { pdf_b64: args.pdf_b64 }) as {
      fields: Array<{
        name: string;
        type: string;
        value: string | null;
        page: number;
        options: string[] | null;
      }>;
      count: number;
    };

    if (result.count === 0) {
      return 'No form fields found in PDF.';
    }

    let output = `Found ${result.count} form field(s):\n\n`;

    for (const field of result.fields) {
      output += `Field: ${field.name}\n`;
      output += `  Type: ${field.type}\n`;
      output += `  Page: ${field.page}\n`;
      output += `  Current value: ${field.value || '(empty)'}\n`;
      if (field.options && field.options.length > 0) {
        output += `  Options: ${field.options.join(', ')}\n`;
      }
      output += '\n';
    }

    return output.trim();
  } catch (error) {
    return `Error listing PDF fields: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Fill PDF form fields and email the result
 */
async function pdfFillAndEmailHandler(args: {
  pdf_b64: string;
  fields: Record<string, string>;
  to: string;
  subject: string;
  body?: string;
}): Promise<string> {
  try {
    // Get authenticated Gmail account
    const accounts = await listSyncEnabledAccounts();
    if (accounts.length === 0) {
      return 'No Google account connected.';
    }

    // Fill the PDF
    const fillResult = await callPdfScript('fill', {
      pdf_b64: args.pdf_b64,
      fields: args.fields,
    }) as {
      filled_pdf_b64: string;
      size: number;
    };

    // Send email with attachment
    const auth = await getAuthenticatedClient(accounts[0]!.id);
    const gmail = google.gmail({ version: 'v1', auth });

    // Build multipart MIME message with attachment
    const boundary = '----=_Part_' + Date.now();
    const emailBody = args.body || 'Please find the filled PDF form attached.';

    const messageParts = [
      `To: ${args.to}`,
      `Subject: ${args.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      emailBody,
      '',
      `--${boundary}`,
      'Content-Type: application/pdf',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="filled_form.pdf"',
      '',
      fillResult.filled_pdf_b64,
      '',
      `--${boundary}--`,
    ];

    const rawMessage = messageParts.join('\r\n');

    // Base64 URL-safe encode the entire message
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    const fieldCount = Object.keys(args.fields).length;
    return `PDF filled with ${fieldCount} field(s) (${fillResult.size} bytes) and emailed to ${args.to}.`;
  } catch (error) {
    return `Error filling PDF and sending email: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * List PDF form fields from stored object
 */
async function pdfListFieldsFromObjectHandler(args: { objectId: string }): Promise<string> {
  try {
    // Get PDF data from object storage
    const data = await getObjectData(args.objectId);
    if (!data) {
      return `Error: Object with ID '${args.objectId}' not found.`;
    }

    // Convert to base64
    const pdf_b64 = data.toString('base64');

    // Call the existing list fields handler
    return await pdfListFieldsHandler({ pdf_b64 });
  } catch (error) {
    return `Error listing PDF fields from object: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Fill PDF form fields from stored object and email the result
 */
async function pdfFillAndEmailFromObjectHandler(args: {
  objectId: string;
  fields: Record<string, string>;
  to: string;
  subject: string;
  body?: string;
}): Promise<string> {
  try {
    // Get PDF data from object storage
    const data = await getObjectData(args.objectId);
    if (!data) {
      return `Error: Object with ID '${args.objectId}' not found.`;
    }

    // Convert to base64
    const pdf_b64 = data.toString('base64');

    // Call the existing fill and email handler
    return await pdfFillAndEmailHandler({
      pdf_b64,
      fields: args.fields,
      to: args.to,
      subject: args.subject,
      body: args.body,
    });
  } catch (error) {
    return `Error filling PDF from object and sending email: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export const tools: ToolSpec[] = [
  {
    name: 'pdf_list_fields',
    description: 'List all form fields in a PDF document. Accepts a base64-encoded PDF and returns field names, types, current values, and options.',
    parameters: {
      type: 'object',
      properties: {
        pdf_b64: {
          type: 'string',
          description: 'Base64-encoded PDF file',
        },
      },
      required: ['pdf_b64'],
    },
    handler: pdfListFieldsHandler as ToolHandler,
  },
  {
    name: 'pdf_fill_and_email',
    description: 'Fill PDF form fields and email the result as an attachment. Requires a base64-encoded PDF, field values, recipient email, and subject.',
    parameters: {
      type: 'object',
      properties: {
        pdf_b64: {
          type: 'string',
          description: 'Base64-encoded PDF file',
        },
        fields: {
          type: 'object',
          description: 'Object mapping field names to their values (e.g., {"Name": "John Doe", "Date": "2024-03-18"})',
          additionalProperties: { type: 'string' },
        },
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
          description: 'Email body text (optional, defaults to generic message)',
        },
      },
      required: ['pdf_b64', 'fields', 'to', 'subject'],
    },
    handler: pdfFillAndEmailHandler as ToolHandler,
  },
  {
    name: 'pdf_list_fields_from_object',
    description: 'List all form fields in a stored PDF document. Use this when the user has already uploaded a PDF and you have its object ID.',
    parameters: {
      type: 'object',
      properties: {
        objectId: {
          type: 'string',
          description: 'The ID of the stored PDF object to analyze.',
        },
      },
      required: ['objectId'],
    },
    handler: pdfListFieldsFromObjectHandler as ToolHandler,
  },
  {
    name: 'pdf_fill_and_email_from_object',
    description: 'Fill PDF form fields from a stored document and email the result. Use this when the user has already uploaded a PDF and you have its object ID.',
    parameters: {
      type: 'object',
      properties: {
        objectId: {
          type: 'string',
          description: 'The ID of the stored PDF object to fill.',
        },
        fields: {
          type: 'object',
          description: 'Object mapping field names to their values (e.g., {"Name": "John Doe", "Date": "2024-03-18"})',
          additionalProperties: { type: 'string' },
        },
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
          description: 'Email body text (optional, defaults to generic message)',
        },
      },
      required: ['objectId', 'fields', 'to', 'subject'],
    },
    handler: pdfFillAndEmailFromObjectHandler as ToolHandler,
  },
];
