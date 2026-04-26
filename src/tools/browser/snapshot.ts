/**
 * Browser Snapshot Tool
 *
 * Returns the page structure with element refs.
 * This is the primary way to "see" what's on the page.
 * Element refs (e.g., e38, e49) are used for click/fill/etc.
 */

import type { ToolHandler, ToolSpec } from '../types.js';
import type { BrowserSnapshotArgs } from './types.js';
import { execBrowser } from './exec.js';

async function browserSnapshot(args: BrowserSnapshotArgs): Promise<string> {
  const cmdArgs = ['snapshot', '--raw'];
  if (args.ref) {
    cmdArgs.push(args.ref);
  }

  return execBrowser(cmdArgs);
}

export const tools: ToolSpec[] = [{
  name: 'browser_snapshot',
  description: `Get the current page structure with element refs.

Returns a compact representation of the page with element references (e.g., e38, e49) that you can use with browser_click, browser_fill, etc.

This is how you "see" the page. Always snapshot after navigating or after an action to see the updated state. Element refs may change between snapshots.`,
  parameters: {
    type: 'object',
    properties: {
      ref: {
        type: 'string',
        description: 'Optional element ref to snapshot a subtree (e.g., "e38"). Omit for full page.',
      },
    },
    required: [],
  },
  handler: browserSnapshot as ToolHandler,
}];
