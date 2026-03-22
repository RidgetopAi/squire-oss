import type { ToolHandler, ToolSpec } from '../types.js';
import { runNow } from '../../services/courier/index.js';

async function emailCheckToolHandler(): Promise<string> {
  try {
    await runNow();
    return 'Email check triggered. Summary will be sent shortly.';
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export const tools: ToolSpec[] = [
  {
    name: 'email_check',
    description: 'Manually trigger an email check. This runs the Courier email check task immediately.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: emailCheckToolHandler as ToolHandler,
  },
];
