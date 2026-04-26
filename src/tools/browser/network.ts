/**
 * Browser Network Tool
 *
 * View network requests — useful for debugging API calls.
 */

import type { ToolHandler, ToolSpec } from '../types.js';
import { execBrowser } from './exec.js';

async function browserNetwork(): Promise<string> {
  return execBrowser(['network', '--raw']);
}

export const tools: ToolSpec[] = [{
  name: 'browser_network',
  description: `View network requests made by the page.

Use this to inspect API calls, check response status codes, see request/response data, and debug network issues.`,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  handler: browserNetwork as ToolHandler,
}];
