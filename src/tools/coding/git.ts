/**
 * Git Tool
 *
 * Convenience wrapper for common git operations.
 * All operations go through bash with safety handling.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from '../../config/index.js';
import type { ToolHandler, ToolSpec } from '../types.js';
import type { GitArgs, GitOperation } from './types.js';
import { resolveSafePath, PATH_TRAVERSAL_REFUSAL, truncateOutput } from './policies.js';

const execAsync = promisify(exec);

// === HANDLER ===

async function gitOperations(args: GitArgs): Promise<string> {
  const { operation, args: opArgs = [], cwd } = args;

  if (!operation) {
    return 'Error: operation is required';
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

  // Build the git command based on operation
  let command: string;
  try {
    command = buildGitCommand(operation, opArgs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout: config.coding.defaultTimeoutMs,
      maxBuffer: config.coding.maxOutputBytes,
      env: {
        ...process.env,
        // Disable pager for all git commands
        GIT_PAGER: 'cat',
        PAGER: 'cat',
        // Disable editor prompts
        GIT_EDITOR: 'true',
        EDITOR: 'true',
      },
    });

    const output = stdout.trim() || stderr.trim();

    if (!output) {
      return `Git ${operation} completed successfully (no output).
Working directory: ${workingDir}`;
    }

    return truncateOutput(`Git ${operation} in ${workingDir}:

${output}`);
  } catch (error: unknown) {
    const execError = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    // Git often returns non-zero for informational messages
    const output =
      execError.stderr?.trim() || execError.stdout?.trim() || execError.message;

    return `Git ${operation} failed (exit code ${execError.code}):

${output}

Working directory: ${workingDir}`;
  }
}

/**
 * Build a git command from operation and arguments.
 */
function buildGitCommand(operation: GitOperation, args: string[]): string {
  // Sanitize args to prevent injection
  const sanitizedArgs = args.map((arg) => {
    // Escape single quotes and wrap in single quotes
    return `'${arg.replace(/'/g, "'\\''")}'`;
  });

  switch (operation) {
    case 'status':
      return 'git status --porcelain=v2 --branch';

    case 'diff':
      if (sanitizedArgs.length === 0) {
        // Show both staged and unstaged
        return 'git diff HEAD';
      }
      return `git diff ${sanitizedArgs.join(' ')}`;

    case 'log':
      // Default to last 20 commits in oneline format
      const logArgs =
        sanitizedArgs.length === 0
          ? ['--oneline', '-n', '20']
          : sanitizedArgs;
      return `git log ${logArgs.join(' ')}`;

    case 'add':
      if (sanitizedArgs.length === 0) {
        return 'Error: git add requires file paths';
      }
      return `git add ${sanitizedArgs.join(' ')}`;

    case 'commit':
      // Expect -m 'message' in args
      if (sanitizedArgs.length === 0) {
        throw new Error('git commit requires a message. Use args: ["-m", "your message"]');
      }
      return `git commit ${sanitizedArgs.join(' ')}`;

    case 'branch':
      if (sanitizedArgs.length === 0) {
        return 'git branch -vv';
      }
      return `git branch ${sanitizedArgs.join(' ')}`;

    case 'checkout':
      if (sanitizedArgs.length === 0) {
        throw new Error('git checkout requires a branch or file path');
      }
      return `git checkout ${sanitizedArgs.join(' ')}`;

    case 'pull':
      return `git pull ${sanitizedArgs.join(' ')}`;

    case 'push':
      return `git push ${sanitizedArgs.join(' ')}`;

    default:
      throw new Error(`Unknown git operation: ${operation}`);
  }
}

// === TOOL DEFINITION ===

export const tools: ToolSpec[] = [{
  name: 'git_operations',
  description: `Execute git operations in a repository.

Available operations:
- status: Show working tree status (porcelain format)
- diff: Show changes (staged and unstaged by default)
- log: Show commit history (last 20 oneline by default)
- add: Stage files for commit
- commit: Create a commit (requires args: ["-m", "message"])
- branch: List or create branches
- checkout: Switch branches or restore files
- pull: Fetch and merge from remote
- push: Push commits to remote

The args parameter allows passing additional flags and arguments.

Examples:
- status: no args needed
- diff: args: ["--staged"] for staged only
- log: args: ["-n", "5", "--stat"] for last 5 with stats
- add: args: ["file1.ts", "file2.ts"]
- commit: args: ["-m", "Fix bug in login"]
- branch: args: ["-d", "feature-branch"] to delete
- checkout: args: ["main"] or args: ["-b", "new-branch"]`,
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['status', 'diff', 'log', 'add', 'commit', 'branch', 'checkout', 'pull', 'push'],
        description: 'Git operation to perform',
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional arguments for the operation',
      },
      cwd: {
        type: 'string',
        description: 'Repository directory (defaults to working directory)',
      },
    },
    required: ['operation'],
  },
  handler: gitOperations as ToolHandler,
}];
