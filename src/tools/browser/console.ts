/**
 * Browser Console Tool
 *
 * View browser console messages — useful for debugging web apps.
 */

import type { ToolHandler, ToolSpec } from '../types.js';
import { execBrowser } from './exec.js';

async function browserConsole(): Promise<string> {
  return execBrowser(['console', '--raw']);
}

export const tools: ToolSpec[] = [{
  name: 'browser_console',
  description: `View browser console messages (logs, warnings, errors).

Use this to debug web applications — check for JavaScript errors, API responses logged to console, or application state.`,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  handler: browserConsole as ToolHandler,
}];
