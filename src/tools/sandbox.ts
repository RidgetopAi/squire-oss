/**
 * Sandbox Tool
 *
 * Ephemeral local workspaces for one-off builds, scripts, and artifacts.
 * Supports both sync (block until done) and async (return immediately,
 * notify via Telegram when complete) modes.
 *
 * Sandbox directories live at /tmp/squire-sandbox-[uuid]/ and are
 * explicitly cleaned up via sandbox_cleanup.
 *
 * SECURITY NOTE: this tool spawns child processes with prompt-derived
 * arguments. It is gated behind SQUIRE_ENABLE_DANGEROUS_TOOLS in the
 * tool registry — do not register it in untrusted deployments.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { writeFileSync, unlinkSync } from 'fs';
import type { ToolHandler, ToolSpec } from './types.js';
import { createJob, completeJob, failJob } from '../services/jobs.js';

const execAsync = promisify(exec);

const SANDBOX_PREFIX = '/tmp/squire-sandbox-';
const MAX_TIMEOUT = 900000; // 15 minutes
const DEFAULT_TIMEOUT = 600000; // 10 minutes
const MAX_INLINE_SIZE = 16384; // 16KB — files smaller than this get returned inline

// --- Sandbox lifecycle (local execution only) ---

async function createSandbox(): Promise<string> {
  const id = crypto.randomUUID();
  const sandboxPath = `${SANDBOX_PREFIX}${id}`;
  await execAsync(`mkdir -p ${sandboxPath}`);
  return sandboxPath;
}

export async function listSandboxFiles(sandboxPath: string): Promise<Array<{ path: string; size: number; sizeStr: string }>> {
  const cmd = `find ${sandboxPath} -type f -not -name '.claude*' -printf '%P\\t%s\\n' 2>/dev/null | sort`;
  const { stdout } = await execAsync(cmd);

  if (!stdout.trim()) return [];

  return stdout.trim().split('\n').map(line => {
    const [filePath, sizeStr] = line.split('\t');
    const size = parseInt(sizeStr || '0', 10);
    return {
      path: filePath || '',
      size,
      sizeStr: formatSize(size),
    };
  });
}

async function readRemoteFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf-8');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// --- Claude Code dispatch (adapted from claude-code.ts) ---

interface ClaudeCodeResult {
  result: string;
  sessionId: string;
  success: boolean;
  durationMs?: number;
  error?: string;
}

function parseOutput(output: string): ClaudeCodeResult {
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
    return { result: output, sessionId: '', success: true };
  } catch {
    return { result: output, sessionId: '', success: true };
  }
}

async function runClaudeCodeInSandbox(
  sandboxPath: string,
  prompt: string,
  model: string,
  timeout: number
): Promise<ClaudeCodeResult> {
  const sessionId = crypto.randomUUID();
  const tmpPromptFile = `/tmp/squire-prompt-${sessionId}`;

  const fullPrompt = `You are working in an ephemeral sandbox directory: ${sandboxPath}
This is a temporary workspace — install dependencies, write scripts, generate any files you need.
All output files should be written to this directory (or subdirectories within it).

---

${prompt}`;

  const claudeCommand = [
    'claude',
    '-p',
    '--dangerously-skip-permissions',
    '--output-format json',
    `--session-id ${sessionId}`,
    `--model ${model}`,
  ].join(' ');

  writeFileSync(tmpPromptFile, fullPrompt, { mode: 0o644 });
  const command = `cd ${sandboxPath} && ${claudeCommand} < ${tmpPromptFile}`;

  try {
    const { stdout } = await execAsync(command, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
    return parseOutput(stdout.trim());
  } finally {
    try { unlinkSync(tmpPromptFile); } catch { /* ignore */ }
  }
}

// --- Inline file reading ---

async function readInlineFiles(
  sandboxPath: string,
  files: Array<{ path: string; size: number; sizeStr: string }>
): Promise<Array<{ path: string; content: string }>> {
  const inlineFiles: Array<{ path: string; content: string }> = [];
  const textExts = ['.txt', '.md', '.csv', '.json', '.html', '.xml', '.yaml', '.yml', '.log', '.ts', '.js', '.py', '.sh', '.sql', '.css', '.svg'];

  for (const file of files) {
    if (file.size <= MAX_INLINE_SIZE && file.size > 0) {
      const ext = path.extname(file.path).toLowerCase();
      if (textExts.includes(ext) || ext === '') {
        try {
          const content = await readRemoteFile(path.join(sandboxPath, file.path));
          inlineFiles.push({ path: file.path, content });
        } catch {
          // Skip files we can't read
        }
      }
    }
  }

  return inlineFiles;
}

function formatResult(
  sandboxPath: string,
  model: string,
  ccResult: ClaudeCodeResult,
  files: Array<{ path: string; size: number; sizeStr: string }>,
  inlineFiles: Array<{ path: string; content: string }>,
  jobId?: string
): string {
  const lines: string[] = [];
  lines.push(`**Sandbox Complete** (${model})`);
  lines.push(`Path: \`${sandboxPath}\``);
  if (jobId) lines.push(`Job: \`${jobId}\``);
  if (ccResult.durationMs) {
    lines.push(`Duration: ${(ccResult.durationMs / 1000).toFixed(1)}s`);
  }
  lines.push('');

  if (ccResult.success) {
    lines.push('### Result');
    lines.push(ccResult.result);
  } else {
    lines.push('### Error');
    lines.push(ccResult.error || ccResult.result);
  }

  if (files.length > 0) {
    lines.push('');
    lines.push(`### Output Files (${files.length})`);
    for (const file of files) {
      lines.push(`- \`${file.path}\` (${file.sizeStr})`);
    }
  }

  if (inlineFiles.length > 0) {
    lines.push('');
    lines.push('### File Contents');
    for (const file of inlineFiles) {
      const ext = path.extname(file.path).replace('.', '') || 'text';
      lines.push('');
      lines.push(`**${file.path}**`);
      lines.push(`\`\`\`${ext}`);
      lines.push(file.content);
      lines.push('```');
    }
  }

  return lines.join('\n');
}

// --- Tool handlers ---

interface SandboxArgs {
  task: string;
  model?: string;
  timeout?: number;
  async?: boolean;
}

async function sandboxRun(args: SandboxArgs): Promise<string> {
  const { task, model, timeout } = args;
  const isAsync = args.async === true;

  if (!task || task.trim().length === 0) {
    return 'Error: task is required — describe what you need built.';
  }

  const effectiveModel = model || 'sonnet';
  const effectiveTimeout = Math.min(timeout || DEFAULT_TIMEOUT, MAX_TIMEOUT);

  // 1. Create sandbox
  let sandboxPath: string;
  try {
    sandboxPath = await createSandbox();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return `Error creating sandbox: ${msg}`;
  }

  console.log(`[sandbox] Created: ${sandboxPath}`);
  console.log(`[sandbox] Mode: ${isAsync ? 'async' : 'sync'}, Model: ${effectiveModel}`);

  // --- ASYNC MODE: fire and forget, notify on completion ---
  if (isAsync) {
    const job = createJob({
      task: task.trim(),
      sandboxPath,
      model: effectiveModel,
    });

    // Fire in background — don't await
    runClaudeCodeInSandbox(sandboxPath, task.trim(), effectiveModel, effectiveTimeout)
      .then(async (ccResult) => {
        const files = await listSandboxFiles(sandboxPath).catch(() => []);
        await completeJob(job.id, ccResult.success ? ccResult.result : (ccResult.error || 'Unknown error'), files);
      })
      .catch(async (error) => {
        const msg = error instanceof Error ? error.message : String(error);
        await failJob(job.id, msg);
      });

    return [
      `**Sandbox Dispatched** (async)`,
      `Job: \`${job.id}\``,
      `Path: \`${sandboxPath}\``,
      `Model: ${effectiveModel}`,
      '',
      'Claude Code is working in the background.',
      'You will be notified via Telegram when the job completes.',
      'Use `job_status` tool to check progress.',
    ].join('\n');
  }

  // --- SYNC MODE: block and return results ---
  let ccResult: ClaudeCodeResult;
  try {
    ccResult = await runClaudeCodeInSandbox(sandboxPath, task.trim(), effectiveModel, effectiveTimeout);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return `Sandbox error (Claude Code failed): ${msg}\n\nSandbox path: ${sandboxPath}`;
  }

  const files = await listSandboxFiles(sandboxPath).catch(() => [] as Array<{ path: string; size: number; sizeStr: string }>);
  const inlineFiles = await readInlineFiles(sandboxPath, files);

  return formatResult(sandboxPath, effectiveModel, ccResult, files, inlineFiles);
}

interface SandboxCleanupArgs {
  path: string;
}

async function sandboxCleanup(args: SandboxCleanupArgs): Promise<string> {
  const { path: sandboxPath } = args;

  if (!sandboxPath || !sandboxPath.startsWith(SANDBOX_PREFIX)) {
    return `Error: Invalid sandbox path. Must start with ${SANDBOX_PREFIX}`;
  }

  try {
    await execAsync(`rm -rf "${sandboxPath}"`);
    return `Sandbox cleaned up: ${sandboxPath}`;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return `Error cleaning up sandbox: ${msg}`;
  }
}

// --- Tool definitions ---

export const tools: ToolSpec[] = [
  {
    name: 'sandbox',
    description: `Create an ephemeral sandbox workspace and dispatch Claude Code to build something.

The sandbox is a temporary local directory where Claude Code can:
- Install packages and dependencies
- Write scripts, tools, or applications
- Generate output files (PDFs, CSVs, reports, images, etc.)
- Run builds, tests, or any one-off task

Two modes:
- **sync** (default): Blocks until Claude Code finishes, returns results + file manifest inline
- **async** (async: true): Returns immediately with a job ID, notifies via Telegram when done

After completion you get:
- Claude Code's response/summary
- A manifest of all output files with sizes
- Small text files read back inline for immediate use

The sandbox path is returned so you can read specific files or email artifacts afterward.
Call sandbox_cleanup when done to wipe the workspace.

Parameters:
- task: What to build (be specific about desired output files/format)
- model: Claude Code model (default: sonnet)
- timeout: Max time in ms (default: 600000 = 10 min, max: 15 min)
- async: Set true to run in background and get notified when done`,
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'What to build in the sandbox. Be specific about desired output files and format.',
        },
        model: {
          type: 'string',
          enum: ['opus', 'sonnet', 'haiku'],
          description: 'Claude Code model (default: sonnet). Use opus for complex tasks.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 600000 = 10 min, max: 900000 = 15 min)',
        },
        async: {
          type: 'boolean',
          description: 'Run in background and notify via Telegram when done (default: false)',
        },
      },
      required: ['task'],
    },
    handler: sandboxRun as ToolHandler,
  },
  {
    name: 'sandbox_cleanup',
    description: `Clean up (delete) an ephemeral sandbox workspace.

Call this after you've retrieved all needed files from a sandbox.
Only accepts paths starting with /tmp/squire-sandbox- for safety.`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The sandbox path to clean up (from sandbox tool output)',
        },
      },
      required: ['path'],
    },
    handler: sandboxCleanup as ToolHandler,
  },
];
