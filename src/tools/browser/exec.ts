/**
 * Browser Tool Execution Helper
 *
 * Shared utility for running playwright-cli commands.
 * All browser tools shell out to playwright-cli which manages
 * its own daemon session with proper timeout handling.
 *
 * SECURITY: every callsite passes args derived from LLM-generated
 * tool calls. We use execFile (not exec) and shell: false so that
 * arguments are passed directly to the playwright-cli process —
 * no shell parsing, no $(...) expansion, no backticks, no IFS
 * splitting, no globbing. A previously-vulnerable version did
 * `exec(\`playwright-cli ${args.join(' ')}\`)` which let a URL
 * like `https://x.com/$(id)` execute arbitrary shell commands.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Default timeout for browser commands (30 seconds) */
const BROWSER_TIMEOUT_MS = 30_000;

/** Max output buffer (1MB) */
const MAX_OUTPUT_BYTES = 1_048_576;

/**
 * Execute a playwright-cli command and return the output.
 * Never throws — returns error strings on failure.
 */
export async function execBrowser(
  args: string[],
  timeout = BROWSER_TIMEOUT_MS
): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync('playwright-cli', args, {
      timeout,
      maxBuffer: MAX_OUTPUT_BYTES,
      shell: false,
      env: {
        ...process.env,
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
      },
    });

    const output = stdout.trim();
    const errors = stderr.trim();

    if (!output && !errors) {
      return 'Command completed (no output).';
    }

    if (errors && !output) {
      return `Error: ${errors}`;
    }

    // Include stderr as warning if both present
    if (errors) {
      return `${output}\n\n--- warnings ---\n${errors}`;
    }

    return output;
  } catch (error: unknown) {
    const execError = error as {
      killed?: boolean;
      signal?: string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    if (execError.killed && execError.signal === 'SIGTERM') {
      return `Error: Browser command timed out after ${timeout}ms. The page may be loading slowly or unresponsive.`;
    }

    // Non-zero exit but might have useful output
    if (execError.stdout?.trim()) {
      return execError.stdout.trim();
    }

    if (execError.stderr?.trim()) {
      return `Error: ${execError.stderr.trim()}`;
    }

    const message = execError.message || (error instanceof Error ? error.message : String(error));
    return `Error: ${message}`;
  }
}
