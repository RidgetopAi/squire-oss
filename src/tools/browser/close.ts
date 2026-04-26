/**
 * Browser Close Tool
 *
 * Ends the current browser session.
 */

import type { ToolHandler, ToolSpec } from '../types.js';
import { execBrowser } from './exec.js';

async function browserClose(): Promise<string> {
  const result = await execBrowser(['close']);
  return `Browser session closed. ${result}`;
}

export const tools: ToolSpec[] = [{
  name: 'browser_close',
  description: `Close the current browser session.

Use this when you're done with browser tasks to free resources. The session will also timeout automatically after inactivity.`,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  handler: browserClose as ToolHandler,
}];
