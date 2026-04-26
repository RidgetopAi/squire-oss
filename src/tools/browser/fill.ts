/**
 * Browser Fill Tool
 *
 * Fills a text input by its ref from a snapshot.
 */

import type { ToolHandler, ToolSpec } from '../types.js';
import type { BrowserFillArgs } from './types.js';
import { execBrowser } from './exec.js';

async function browserFill(args: BrowserFillArgs): Promise<string> {
  if (!args.ref) {
    return 'Error: ref is required. Use browser_snapshot first to get element refs.';
  }
  if (args.text === undefined || args.text === null) {
    return 'Error: text is required.';
  }

  // execBrowser uses execFile with shell:false; pass text raw — no
  // shell-quoting needed (and JSON.stringify would mangle the value).
  const result = await execBrowser(['fill', args.ref, String(args.text)]);
  return result;
}

export const tools: ToolSpec[] = [{
  name: 'browser_fill',
  description: `Fill text into an input field by its ref.

Element refs come from browser_snapshot. Use this for text inputs, textareas, search boxes, form fields, etc. Clears existing content before filling.`,
  parameters: {
    type: 'object',
    properties: {
      ref: {
        type: 'string',
        description: 'Element ref from snapshot (e.g., "e38")',
      },
      text: {
        type: 'string',
        description: 'Text to fill into the input',
      },
    },
    required: ['ref', 'text'],
  },
  handler: browserFill as ToolHandler,
}];
