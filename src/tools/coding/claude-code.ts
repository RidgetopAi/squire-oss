/**
 * Claude Code Tool
 *
 * Execute coding tasks via the Claude Code CLI in headless mode.
 * Maintains session continuity across calls.
 *
 * Architecture:
 * - Squire = Orchestrator + Chat + Memory
 * - Claude Code (CLI) = Coding worker with full file/git tooling
 *
 * SECURITY NOTE: this tool spawns the `claude` CLI with prompt-derived
 * arguments and `--dangerously-skip-permissions`. It is gated behind
 * SQUIRE_ENABLE_DANGEROUS_TOOLS in the tool registry — do not register
 * it in untrusted deployments.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import type { ToolHandler, ToolSpec } from '../types.js';
import type { ClaudeCodeArgs, ClaudeCodeResult } from './types.js';

const execAsync = promisify(exec);

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Default configuration. CODING_WORKING_DIR can be set in .env to change
// the default project root for claude_code invocations; otherwise, the
// process working directory is used.
const DEFAULTS = {
  workingDir: process.env.CODING_WORKING_DIR ?? process.cwd(),
  model: 'sonnet',
  timeout: 900000, // 15 minutes
};

/**
 * Validate and get session ID
 * Always generates fresh UUIDs to avoid session collision issues
 */
function getSessionId(providedId?: string): string {
  // If provided ID is a valid UUID, use it (allows explicit resume)
  if (providedId && UUID_REGEX.test(providedId)) {
    return providedId;
  }

  // Always generate fresh UUID to avoid session collisions
  // (Claude Code rejects session IDs that are in use by other processes)
  return crypto.randomUUID();
}

/**
 * Parse Claude Code JSON output
 */
function parseClaudeCodeOutput(output: string): ClaudeCodeResult {
  try {
    const json = JSON.parse(output);

    if (json.type === 'result') {
      return {
        result: json.result || '',
        sessionId: json.session_id || '',
        success: !json.is_error,
        durationMs: json.duration_ms,
        error: json.is_error ? json.result : undefined,
      };
    }

    // Unexpected format
    return {
      result: output,
      sessionId: '',
      success: true,
    };
  } catch {
    // Not JSON - return raw output (text mode fallback)
    return {
      result: output,
      sessionId: '',
      success: true,
    };
  }
}

/**
 * Execute Claude Code locally
 */
async function claudeCode(args: ClaudeCodeArgs): Promise<string> {
  const { prompt, workingDir, sessionId: providedSessionId, model, timeout } = args;

  if (!prompt) {
    return 'Error: prompt is required';
  }

  const effectiveWorkingDir = workingDir || DEFAULTS.workingDir;
  const effectiveModel = model || DEFAULTS.model;
  const effectiveTimeout = Math.min(timeout || DEFAULTS.timeout, 900000);
  const sessionId = getSessionId(providedSessionId);

  // Write prompt to temp file to avoid shell escaping issues with quotes/apostrophes.
  // Node's writeFileSync handles all characters safely — no shell involvement.
  const tmpPromptFile = `/tmp/squire-prompt-${sessionId}`;
  writeFileSync(tmpPromptFile, prompt, { mode: 0o644 });

  // Build the Claude Code command (prompt fed via stdin redirection from temp file)
  const claudeCommand = [
    'claude',
    '-p',
    '--dangerously-skip-permissions',
    '--output-format json',
    `--session-id ${sessionId}`,
    `--model ${effectiveModel}`,
  ].join(' ');

  // Local execution: run Claude Code in the configured working directory.
  // Use `script` to provide a PTY (Claude Code needs TTY for output).
  const command = `script -q -c "cd ${effectiveWorkingDir} && ${claudeCommand} < ${tmpPromptFile}" /dev/null`;
  console.log(`[claude_code] Executing locally: ${effectiveWorkingDir}`);
  console.log(`[claude_code] Session: ${sessionId}`);
  console.log(`[claude_code] Model: ${effectiveModel}`);

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: effectiveTimeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
    });

    // Debug logging
    console.log(`[claude_code] stdout length: ${stdout.length}`);
    console.log(`[claude_code] stdout preview: ${stdout.substring(0, 200)}`);
    if (stderr) {
      console.log(`[claude_code] stderr: ${stderr.substring(0, 500)}`);
    }

    // Parse the JSON output
    const result = parseClaudeCodeOutput(stdout.trim());

    if (!result.success) {
      return `Claude Code Error: ${result.error || 'Unknown error'}\n\nSession: ${sessionId}`;
    }

    // Format successful response
    const response = [
      result.result,
      '',
      '---',
      `Session: ${result.sessionId || sessionId}`,
      result.durationMs ? `Duration: ${(result.durationMs / 1000).toFixed(1)}s` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return response;
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
      return `Error: Claude Code timed out after ${effectiveTimeout / 1000}s\n\nSession: ${sessionId}\n\nPartial output:\n${execError.stdout || '(none)'}`;
    }

    // Handle SSH/execution errors
    const errorMessage = execError.message || String(error);
    const stderr = execError.stderr || '';

    return `Error executing Claude Code: ${errorMessage}\n\n${stderr ? `stderr: ${stderr}\n\n` : ''}Session: ${sessionId}`;
  } finally {
    // Clean up temp prompt file
    try {
      unlinkSync(tmpPromptFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// === TOOL DEFINITION ===

export const tools: ToolSpec[] = [{
  name: 'claude_code',
  description: `Execute coding tasks using the Claude Code CLI.

This tool dispatches complex coding work to a local Claude Code session with:
- Full file system access
- Git operations
- Code editing and creation
- Test execution
- Build commands

Use this for:
- Implementing features across multiple files
- Refactoring code
- Debugging complex issues
- Running tests and builds
- Any task requiring extensive file operations

Each call generates a fresh session. To resume a previous session, pass a valid UUID as sessionId.`,
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The coding task to execute. Be specific about what to do, which files, and expected outcome.',
      },
      workingDir: {
        type: 'string',
        description: 'Working directory for the session. Defaults to CODING_WORKING_DIR or process cwd. Can be set to any project path.',
      },
      sessionId: {
        type: 'string',
        description: 'Session ID (must be valid UUID) to resume a previous session. Omit for fresh session.',
      },
      model: {
        type: 'string',
        enum: ['opus', 'sonnet', 'haiku'],
        description: 'Model to use (default: sonnet). Use opus for complex tasks, haiku for simple ones.',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 900000 = 15 min, max: 15 min).',
      },
    },
    required: ['prompt'],
  },
  handler: claudeCode as ToolHandler,
}];
