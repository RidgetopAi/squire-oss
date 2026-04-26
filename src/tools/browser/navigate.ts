/**
 * Browser Navigate Tool
 *
 * Opens a URL in the browser. Starts a session if none exists.
 */

import type { ToolHandler, ToolSpec } from '../types.js';
import type { BrowserNavigateArgs } from './types.js';
import { execBrowser } from './exec.js';
import { assertPublicUrl } from '../../utils/url-safety.js';

async function browserNavigate(args: BrowserNavigateArgs): Promise<string> {
  if (!args.url) {
    return 'Error: url is required';
  }

  // Basic URL validation + SSRF guard (rejects loopback, RFC1918,
  // link-local, cloud-metadata, file://, etc.).
  try {
    new URL(args.url);
  } catch {
    return `Error: Invalid URL "${args.url}". Must be a full URL (e.g., https://example.com)`;
  }

  try {
    await assertPublicUrl(args.url);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  const result = await execBrowser(['open', args.url]);
  return `Navigated to ${args.url}\n\n${result}\n\nUse browser_snapshot to see the page content and element refs.`;
}

export const tools: ToolSpec[] = [{
  name: 'browser_navigate',
  description: `Navigate the browser to a URL. Starts a browser session if one isn't active.

After navigating, use browser_snapshot to see the page structure and get element refs for interaction.

Use this to:
- Open websites to read content or interact with them
- Navigate to web apps, dashboards, or admin panels
- Start a browser session for multi-step web tasks`,
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Full URL to navigate to (e.g., "https://example.com")',
      },
    },
    required: ['url'],
  },
  handler: browserNavigate as ToolHandler,
}];
