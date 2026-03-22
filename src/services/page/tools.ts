/**
 * Page Agent Tools
 *
 * Read-only tool definitions for the page agent subagent.
 * These are standalone — NOT registered in the main tool registry.
 * They're used exclusively inside the page agent's internal loop.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { glob } from 'glob';
import { config } from '../../config/index.js';
import type { ToolDefinition } from '../../tools/types.js';
import {
  resolvePath,
  isBinaryContent,
  formatWithLineNumbers,
  truncateOutput,
} from '../../tools/coding/policies.js';

const execAsync = promisify(exec);

// === TYPES ===

export interface PageTool {
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

// === READ FILE ===

async function readFile(args: Record<string, unknown>): Promise<string> {
  const inputPath = args.path as string | undefined;
  const offset = args.offset as number | undefined;
  const limit = args.limit as number | undefined;

  if (!inputPath) {
    return 'Error: path is required';
  }

  const resolvedPath = resolvePath(inputPath);

  try {
    const stats = await fs.stat(resolvedPath);

    if (stats.isDirectory()) {
      // List directory contents instead of erroring
      const entries = await fs.readdir(resolvedPath);
      return `Directory: ${resolvedPath}\n\n${entries.join('\n')}`;
    }

    const buffer = await fs.readFile(resolvedPath);

    if (isBinaryContent(buffer)) {
      const ext = path.extname(resolvedPath).toLowerCase();
      const sizeKB = (stats.size / 1024).toFixed(2);
      return `[Binary file] ${ext} — ${sizeKB} KB — ${resolvedPath}`;
    }

    let content = buffer.toString('utf-8');
    const totalLines = content.split('\n').length;

    if (offset !== undefined || limit !== undefined) {
      const lines = content.split('\n');
      const startLine = Math.max(1, offset ?? 1);
      const endLine = limit
        ? Math.min(lines.length, startLine + limit - 1)
        : lines.length;

      const selectedLines = lines.slice(startLine - 1, endLine);
      content = formatWithLineNumbers(selectedLines.join('\n'), startLine);

      const rangeInfo = `[Lines ${startLine}-${endLine} of ${totalLines}]`;
      content = `${rangeInfo}\n\n${content}`;
    } else {
      content = formatWithLineNumbers(content, 1);
    }

    return truncateOutput(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return `Error: File not found: ${resolvedPath}`;
    }
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      return `Error: Permission denied: ${resolvedPath}`;
    }
    const message = error instanceof Error ? error.message : String(error);
    return `Error reading file: ${message}`;
  }
}

const readFileDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_file',
    description: `Read the contents of a file with line numbers. Can also list directory contents.

Use offset and limit for large files to read specific sections.
Binary files return metadata instead of content.`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file (absolute or relative to working directory)',
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (1-indexed)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read',
        },
      },
      required: ['path'],
    },
  },
};

// === GREP SEARCH ===

async function grepSearch(args: Record<string, unknown>): Promise<string> {
  const pattern = args.pattern as string | undefined;
  const searchPath = args.path as string | undefined;
  const globPattern = args.glob as string | undefined;
  const context = (args.context as number) ?? 0;
  const caseSensitive = args.case_sensitive as boolean | undefined;
  const outputMode = (args.output_mode as string) ?? 'content';

  if (!pattern) {
    return 'Error: pattern is required';
  }

  const resolvedPath = searchPath
    ? resolvePath(searchPath)
    : config.coding.workingDirectory;

  // Try ripgrep first, fallback to grep
  const hasRg = await checkRipgrep();

  if (hasRg) {
    return executeRipgrep(pattern, resolvedPath, globPattern, context, caseSensitive, outputMode);
  }
  return executeBasicGrep(pattern, resolvedPath, globPattern, context, caseSensitive, outputMode);
}

async function checkRipgrep(): Promise<boolean> {
  try {
    await execAsync('which rg');
    return true;
  } catch {
    return false;
  }
}

async function executeRipgrep(
  pattern: string,
  searchPath: string,
  globPattern?: string,
  context: number = 0,
  caseSensitive?: boolean,
  outputMode: string = 'content'
): Promise<string> {
  const rgArgs: string[] = [];

  if (caseSensitive === true) {
    rgArgs.push('--case-sensitive');
  } else if (caseSensitive === false) {
    rgArgs.push('--ignore-case');
  } else {
    rgArgs.push('--smart-case');
  }

  if (outputMode === 'files') {
    rgArgs.push('--files-with-matches');
  } else if (outputMode === 'count') {
    rgArgs.push('--count');
  } else {
    rgArgs.push('--line-number');
    if (context > 0) {
      rgArgs.push(`--context=${context}`);
    }
  }

  if (globPattern) {
    rgArgs.push(`--glob=${globPattern}`);
  }

  rgArgs.push('--no-ignore-vcs');
  rgArgs.push('--glob=!node_modules');
  rgArgs.push('--glob=!.git');
  rgArgs.push('--glob=!*.min.js');
  rgArgs.push('--glob=!*.min.css');
  rgArgs.push('--glob=!package-lock.json');
  rgArgs.push('--glob=!yarn.lock');
  rgArgs.push('--max-count=200');

  const escapedPattern = pattern.replace(/'/g, "'\\''");
  const cmd = `rg ${rgArgs.join(' ')} '${escapedPattern}' '${searchPath}'`;

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: config.coding.defaultTimeoutMs,
      maxBuffer: config.coding.maxOutputBytes,
    });

    if (stderr && !stdout) {
      return `Error: ${stderr}`;
    }

    const output = stdout.trim();
    if (!output) {
      return `No matches found for pattern: ${pattern}\nSearch path: ${searchPath}`;
    }

    // Format output with relative paths
    const lines = output.split('\n');
    const formatted: string[] = [];
    let currentFile = '';

    for (const line of lines) {
      const match = line.match(/^(.+?)[:-](\d+)[:-](.*)$/);
      if (match && match[1] && match[2]) {
        const filePath = match[1];
        const lineNum = match[2];
        const content = match[3] ?? '';
        const relativePath = path.relative(searchPath, filePath);

        if (relativePath !== currentFile) {
          if (currentFile) formatted.push('');
          formatted.push(`=== ${relativePath} ===`);
          currentFile = relativePath;
        }

        formatted.push(`${lineNum.padStart(4)}:${content}`);
      } else if (line === '--') {
        formatted.push('  ...');
      } else {
        formatted.push(line);
      }
    }

    return truncateOutput(formatted.join('\n'));
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 1) {
      return `No matches found for pattern: ${pattern}\nSearch path: ${searchPath}`;
    }
    const message = error instanceof Error ? error.message : String(error);
    return `Error executing search: ${message}`;
  }
}

async function executeBasicGrep(
  pattern: string,
  searchPath: string,
  globPattern?: string,
  context: number = 0,
  caseSensitive?: boolean,
  outputMode: string = 'content'
): Promise<string> {
  const grepArgs: string[] = ['-r', '-n'];

  if (caseSensitive === false) {
    grepArgs.push('-i');
  }

  if (outputMode === 'files') {
    grepArgs.push('-l');
  } else if (outputMode === 'count') {
    grepArgs.push('-c');
  } else if (context > 0) {
    grepArgs.push(`-C${context}`);
  }

  if (globPattern) {
    grepArgs.push(`--include=${globPattern}`);
  }

  grepArgs.push('--exclude-dir=node_modules');
  grepArgs.push('--exclude-dir=.git');

  const escapedPattern = pattern.replace(/'/g, "'\\''");
  const cmd = `grep ${grepArgs.join(' ')} '${escapedPattern}' '${searchPath}' 2>/dev/null | head -500`;

  try {
    const { stdout } = await execAsync(cmd, {
      timeout: config.coding.defaultTimeoutMs,
      maxBuffer: config.coding.maxOutputBytes,
    });

    const output = stdout.trim();
    if (!output) {
      return `No matches found for pattern: ${pattern}\nSearch path: ${searchPath}`;
    }

    return truncateOutput(output);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 1) {
      return `No matches found for pattern: ${pattern}\nSearch path: ${searchPath}`;
    }
    const message = error instanceof Error ? error.message : String(error);
    return `Error executing search: ${message}`;
  }
}

const grepSearchDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'grep_search',
    description: `Search file contents for a pattern (regex supported).

Output modes:
- "content" (default): Show matching lines with line numbers
- "files": Show only file paths that contain matches
- "count": Show count of matches per file

Uses ripgrep if available, otherwise falls back to grep.
Automatically ignores node_modules, .git, and minified files.`,
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Search pattern (supports regex)',
        },
        path: {
          type: 'string',
          description: 'Directory or file to search in (defaults to working directory)',
        },
        glob: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g., "*.ts")',
        },
        context: {
          type: 'number',
          description: 'Number of context lines to show around matches',
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Case sensitive search (default: smart-case)',
        },
        output_mode: {
          type: 'string',
          enum: ['content', 'files', 'count'],
          description: 'Output format: content (lines), files (paths only), or count',
        },
      },
      required: ['pattern'],
    },
  },
};

// === GLOB FILES ===

async function globFiles(args: Record<string, unknown>): Promise<string> {
  const pattern = args.pattern as string | undefined;
  const basePath = args.path as string | undefined;
  const limit = (args.limit as number) ?? 100;

  if (!pattern) {
    return 'Error: pattern is required';
  }

  const resolvedBase = basePath
    ? resolvePath(basePath)
    : config.coding.workingDirectory;

  try {
    try {
      await fs.access(resolvedBase);
    } catch {
      return `Error: Base path does not exist: ${resolvedBase}`;
    }

    const fullPattern = path.join(resolvedBase, pattern);

    const matches = await glob(fullPattern, {
      nodir: false,
      dot: false,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    if (matches.length === 0) {
      return `No files found matching pattern: ${pattern}\nBase path: ${resolvedBase}`;
    }

    const results: Array<{
      relativePath: string;
      size: number;
      isDir: boolean;
    }> = [];

    let truncated = false;
    for (const match of matches) {
      if (results.length >= limit) {
        truncated = true;
        break;
      }

      try {
        const stats = await fs.stat(match);
        results.push({
          relativePath: path.relative(resolvedBase, match),
          size: stats.size,
          isDir: stats.isDirectory(),
        });
      } catch {
        continue;
      }
    }

    const lines: string[] = [];
    lines.push(`Found ${matches.length} file(s) matching: ${pattern}`);
    lines.push(`Base: ${resolvedBase}`);
    if (truncated) {
      lines.push(`[Showing first ${limit} results]`);
    }
    lines.push('');

    for (const result of results) {
      const sizeStr = result.isDir
        ? '<DIR>'
        : formatSize(result.size).padStart(10);
      lines.push(`${sizeStr}  ${result.relativePath}`);
    }

    return lines.join('\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error executing glob: ${message}`;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

const globFilesDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'glob_files',
    description: `Find files matching a glob pattern.

Common patterns:
- "*.ts" — TypeScript files in current directory
- "**/*.ts" — TypeScript files recursively
- "src/**/*.{js,ts}" — JS and TS files in src
- "**/test*.ts" — Test files anywhere

Returns file paths with sizes. Ignores node_modules and .git.`,
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern to match files (e.g., "**/*.ts")',
        },
        path: {
          type: 'string',
          description: 'Base directory to search from (defaults to working directory)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 100)',
        },
      },
      required: ['pattern'],
    },
  },
};

// === BASH READ (restricted) ===

/** Commands allowed in read-only mode (prefix match) */
const ALLOWED_COMMANDS = [
  'ls', 'find', 'cat', 'head', 'tail', 'wc', 'file', 'stat',
  'du', 'tree', 'which', 'echo', 'pwd', 'env', 'printenv',
  'uname', 'hostname', 'date', 'whoami', 'id', 'df',
];

/**
 * Check if a command is allowed in read-only mode.
 * Validates the first command and all piped commands.
 */
function isReadOnlyCommand(command: string): { allowed: boolean; reason?: string } {
  // Strip leading whitespace
  const trimmed = command.trim();

  // Block output redirects to files (allow > /dev/null)
  const redirectMatch = trimmed.match(/>\s*(?!\/dev\/null)(\S+)/);
  if (redirectMatch) {
    return { allowed: false, reason: `Output redirect to file is not allowed: > ${redirectMatch[1]}` };
  }

  // Block append redirects
  if (/>>/.test(trimmed)) {
    return { allowed: false, reason: 'Append redirect (>>) is not allowed' };
  }

  // Split on pipes and check each segment
  const segments = trimmed.split(/\|/).map(s => s.trim());

  for (const segment of segments) {
    if (!segment) continue;

    // Get the base command (first word, ignoring env vars like VAR=val)
    const words = segment.split(/\s+/);
    let baseCmd = '';
    for (const word of words) {
      // Skip env variable assignments (KEY=VALUE)
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) continue;
      baseCmd = word;
      break;
    }

    if (!baseCmd) continue;

    // Strip any path prefix (e.g., /usr/bin/ls → ls)
    const cmdName = path.basename(baseCmd);

    const allowed = ALLOWED_COMMANDS.some(ac => cmdName === ac);
    if (!allowed) {
      return {
        allowed: false,
        reason: `Command '${cmdName}' is not in the read-only allowlist. Allowed: ${ALLOWED_COMMANDS.join(', ')}`,
      };
    }
  }

  return { allowed: true };
}

async function bashRead(args: Record<string, unknown>): Promise<string> {
  const command = args.command as string | undefined;
  const cwd = args.cwd as string | undefined;
  const timeout = (args.timeout as number) ?? config.coding.defaultTimeoutMs;

  if (!command) {
    return 'Error: command is required';
  }

  // Validate read-only
  const check = isReadOnlyCommand(command);
  if (!check.allowed) {
    return `Error: Read-only mode — ${check.reason}`;
  }

  const workingDir = cwd
    ? resolvePath(cwd)
    : config.coding.workingDirectory;

  const effectiveTimeout = Math.min(timeout, 60000); // 1 minute max for page agent

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout: effectiveTimeout,
      maxBuffer: config.coding.maxOutputBytes,
      shell: '/bin/bash',
      env: {
        ...process.env,
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
        PAGER: 'cat',
        GIT_PAGER: 'cat',
      },
    });

    const parts: string[] = [];
    if (stdout.trim()) parts.push(stdout.trim());
    if (stderr.trim()) {
      if (parts.length > 0) parts.push('', '--- stderr ---');
      parts.push(stderr.trim());
    }

    const output = parts.join('\n');

    if (!output) {
      return `Command completed successfully (no output).\nWorking directory: ${workingDir}`;
    }

    return truncateOutput(output);
  } catch (error: unknown) {
    const execError = error as {
      code?: number | string;
      killed?: boolean;
      signal?: string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    if (execError.killed && execError.signal === 'SIGTERM') {
      return `Error: Command timed out after ${effectiveTimeout}ms`;
    }

    if (execError.code !== undefined) {
      const parts: string[] = [];
      if (execError.stdout?.trim()) parts.push(execError.stdout.trim());
      if (execError.stderr?.trim()) {
        if (parts.length > 0) parts.push('', '--- stderr ---');
        parts.push(execError.stderr.trim());
      }
      return truncateOutput(`Exit code: ${execError.code}\n\n${parts.join('\n')}`);
    }

    const message = execError.message || (error instanceof Error ? error.message : String(error));
    return `Error executing command: ${message}`;
  }
}

const bashReadDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'bash_read',
    description: `Execute a read-only bash command. Only informational commands are allowed.

Allowed commands: ${ALLOWED_COMMANDS.join(', ')}

Pipes (|) are allowed between permitted commands.
Output redirects to files are NOT allowed (> /dev/null is OK).

Use this for directory listings, file metadata, system info, etc.`,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The read-only bash command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for the command',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000, max: 60000)',
        },
      },
      required: ['command'],
    },
  },
};

// === EXPORT ===

export function getPageTools(): PageTool[] {
  return [
    { definition: readFileDefinition, handler: readFile },
    { definition: grepSearchDefinition, handler: grepSearch },
    { definition: globFilesDefinition, handler: globFiles },
    { definition: bashReadDefinition, handler: bashRead },
  ];
}
