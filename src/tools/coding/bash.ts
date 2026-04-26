/**
 * Bash Tool
 *
 * Execute shell commands with timeout and output handling.
 * Includes blocklist for dangerous commands.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from '../../config/index.js';
import type { ToolHandler, ToolSpec } from '../types.js';
import type { BashArgs } from './types.js';
import { resolveSafePath, PATH_TRAVERSAL_REFUSAL, isBlockedCommand, truncateOutput } from './policies.js';

const execAsync = promisify(exec);

// === HANDLER ===

async function bashExecute(args: BashArgs): Promise<string> {
  const {
    command,
    cwd,
    timeout = config.coding.defaultTimeoutMs,
  } = args;

  if (!command) {
    return 'Error: command is required';
  }

  // Check against blocked commands
  if (isBlockedCommand(command)) {
    return `Error: Command blocked for safety reasons.

The command "${command.substring(0, 50)}${command.length > 50 ? '...' : ''}" matches a dangerous pattern.

If you believe this is a false positive, please reconsider the command or ask for assistance.`;
  }

  let workingDir: string;
  if (cwd) {
    const safe = resolveSafePath(cwd);
    if (safe === null) {
      return PATH_TRAVERSAL_REFUSAL;
    }
    workingDir = safe;
  } else {
    workingDir = config.coding.workingDirectory;
  }

  // Enforce maximum timeout (10 minutes)
  const effectiveTimeout = Math.min(timeout, 600000);

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout: effectiveTimeout,
      maxBuffer: config.coding.maxOutputBytes,
      shell: '/bin/bash',
      env: {
        ...process.env,
        // Ensure consistent output
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
        // Disable pagers
        PAGER: 'cat',
        GIT_PAGER: 'cat',
      },
    });

    // Combine stdout and stderr
    const output = combineOutput(stdout, stderr);

    if (!output.trim()) {
      return `Command completed successfully (no output).
Working directory: ${workingDir}`;
    }

    return truncateOutput(`Working directory: ${workingDir}
Exit code: 0

${output}`);
  } catch (error: unknown) {
    const execError = error as {
      code?: number | string;
      killed?: boolean;
      signal?: string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    // Handle timeout
    if (execError.killed && execError.signal === 'SIGTERM') {
      const partialOutput = combineOutput(
        execError.stdout || '',
        execError.stderr || ''
      );
      return truncateOutput(`Error: Command timed out after ${effectiveTimeout}ms

Partial output:
${partialOutput}`);
    }

    // Handle non-zero exit codes (still might have useful output)
    if (execError.code !== undefined) {
      const output = combineOutput(
        execError.stdout || '',
        execError.stderr || ''
      );
      return truncateOutput(`Working directory: ${workingDir}
Exit code: ${execError.code}

${output}`);
    }

    // Other errors
    const message =
      execError.message || (error instanceof Error ? error.message : String(error));
    return `Error executing command: ${message}`;
  }
}

/**
 * Combine stdout and stderr into a single output.
 */
function combineOutput(stdout: string, stderr: string): string {
  const parts: string[] = [];

  if (stdout.trim()) {
    parts.push(stdout.trim());
  }

  if (stderr.trim()) {
    if (parts.length > 0) {
      parts.push('');
      parts.push('--- stderr ---');
    }
    parts.push(stderr.trim());
  }

  return parts.join('\n');
}

// === TOOL DEFINITION ===

export const tools: ToolSpec[] = [{
  name: 'bash_execute',
  description: `Execute a bash command and return the output.

Use this tool to:
- Run build commands (npm, cargo, make)
- Check system state (ps, df, free)
- Run tests
- Install packages
- Any shell command

The command runs in a bash shell with a timeout.
Dangerous commands (rm -rf /, etc.) are blocked.

Note: Commands that require interactive input will fail.
Use non-interactive alternatives when available.`,
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command (defaults to config working directory)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000, max: 600000)',
      },
    },
    required: ['command'],
  },
  handler: bashExecute as ToolHandler,
}];
