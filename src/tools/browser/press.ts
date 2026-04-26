/**
 * Browser Press Tool
 *
 * Presses a keyboard key (Enter, Tab, Escape, etc.)
 */

import type { ToolHandler, ToolSpec } from '../types.js';
import type { BrowserPressArgs } from './types.js';
import { execBrowser } from './exec.js';

async function browserPress(args: BrowserPressArgs): Promise<string> {
  if (!args.key) {
    return 'Error: key is required (e.g., "Enter", "Tab", "Escape")';
  }

  return execBrowser(['press', args.key]);
}

export const tools: ToolSpec[] = [{
  name: 'browser_press',
  description: `Press a keyboard key in the browser.

Common keys: Enter, Tab, Escape, ArrowDown, ArrowUp, Backspace, Delete, Space.
Modifiers: Control+a, Meta+c, Shift+Tab.

Use this for form submission (Enter), navigation (Tab), closing dialogs (Escape), or keyboard shortcuts.`,
  parameters: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'Key to press (e.g., "Enter", "Tab", "Escape", "Control+a")',
      },
    },
    required: ['key'],
  },
  handler: browserPress as ToolHandler,
}];
