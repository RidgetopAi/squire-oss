/**
 * Browser Click Tool
 *
 * Clicks an element by its ref from a snapshot.
 */

import type { ToolHandler, ToolSpec } from '../types.js';
import type { BrowserClickArgs } from './types.js';
import { execBrowser } from './exec.js';

async function browserClick(args: BrowserClickArgs): Promise<string> {
  if (!args.ref) {
    return 'Error: ref is required. Use browser_snapshot first to get element refs.';
  }

  const result = await execBrowser(['click', args.ref]);
  return `${result}\n\nUse browser_snapshot to see the updated page state.`;
}

export const tools: ToolSpec[] = [{
  name: 'browser_click',
  description: `Click an element on the page by its ref.

Element refs come from browser_snapshot (e.g., "e38", "e49"). Always snapshot first to get current refs — they change when the page updates.

Use this to click buttons, links, checkboxes, or any interactive element.`,
  parameters: {
    type: 'object',
    properties: {
      ref: {
        type: 'string',
        description: 'Element ref from snapshot (e.g., "e38")',
      },
    },
    required: ['ref'],
  },
  handler: browserClick as ToolHandler,
}];
