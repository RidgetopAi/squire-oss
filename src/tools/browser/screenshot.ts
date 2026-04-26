/**
 * Browser Screenshot Tool
 *
 * Captures a screenshot of the viewport or a specific element.
 * Screenshots are saved to .playwright-cli/ directory.
 */

import type { ToolHandler, ToolSpec } from '../types.js';
import type { BrowserScreenshotArgs } from './types.js';
import { execBrowser } from './exec.js';

async function browserScreenshot(args: BrowserScreenshotArgs): Promise<string> {
  const cmdArgs = ['screenshot', '--raw'];
  if (args.ref) {
    cmdArgs.push(args.ref);
  }

  return execBrowser(cmdArgs);
}

export const tools: ToolSpec[] = [{
  name: 'browser_screenshot',
  description: `Capture a screenshot of the current page or a specific element.

Screenshots are saved to the .playwright-cli/ directory. Use this to visually verify page state when the snapshot text representation isn't sufficient.

Prefer browser_snapshot for most interactions — it's faster and returns structured data. Use screenshot when you need visual confirmation.`,
  parameters: {
    type: 'object',
    properties: {
      ref: {
        type: 'string',
        description: 'Optional element ref to screenshot (omit for full viewport)',
      },
    },
    required: [],
  },
  handler: browserScreenshot as ToolHandler,
}];
