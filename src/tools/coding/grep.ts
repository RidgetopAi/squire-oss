/**
 * Grep Tool
 *
 * Search file contents using ripgrep (rg) or fallback to basic grep.
 * Supports regex patterns, context lines, and multiple output modes.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { config } from '../../config/index.js';
import type { ToolHandler, ToolSpec } from '../types.js';
import type { GrepArgs } from './types.js';
import { resolveSafePath, PATH_TRAVERSAL_REFUSAL, truncateOutput } from './policies.js';

const execAsync = promisify(exec);

// === HANDLER ===

async function grepSearch(args: GrepArgs): Promise<string> {
  const {
    pattern,
    path: searchPath,
    glob: globPattern,
    context = 0,
    case_sensitive,
    output_mode = 'content',
  } = args;

  if (!pattern) {
    return 'Error: pattern is required';
  }

  let resolvedPath: string;
  if (searchPath) {
    const safe = resolveSafePath(searchPath);
    if (safe === null) {
      return PATH_TRAVERSAL_REFUSAL;
    }
    resolvedPath = safe;
  } else {
    resolvedPath = config.coding.workingDirectory;
  }

  // Check if ripgrep is available
  const hasRg = await checkRipgrep();

  if (hasRg) {
    return await executeRipgrep(
      pattern,
      resolvedPath,
      globPattern,
      context,
      case_sensitive,
      output_mode
    );
  } else {
    return await executeBasicGrep(
      pattern,
      resolvedPath,
      globPattern,
      context,
      case_sensitive,
      output_mode
    );
  }
}

/**
 * Check if ripgrep (rg) is available.
 */
async function checkRipgrep(): Promise<boolean> {
  try {
    await execAsync('which rg');
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute search using ripgrep.
 */
async function executeRipgrep(
  pattern: string,
  searchPath: string,
  globPattern?: string,
  context: number = 0,
  case_sensitive?: boolean,
  output_mode: string = 'content'
): Promise<string> {
  const args: string[] = [];

  // Case sensitivity
  if (case_sensitive === true) {
    args.push('--case-sensitive');
  } else if (case_sensitive === false) {
    args.push('--ignore-case');
  } else {
    args.push('--smart-case');
  }

  // Output mode
  if (output_mode === 'files') {
    args.push('--files-with-matches');
  } else if (output_mode === 'count') {
    args.push('--count');
  } else {
    // content mode - show matches with line numbers
    args.push('--line-number');
    if (context > 0) {
      args.push(`--context=${context}`);
    }
  }

  // Glob filter
  if (globPattern) {
    args.push(`--glob=${globPattern}`);
  }

  // Standard ignores
  args.push('--no-ignore-vcs'); // We'll handle ignores ourselves
  args.push('--glob=!node_modules');
  args.push('--glob=!.git');
  args.push('--glob=!*.min.js');
  args.push('--glob=!*.min.css');
  args.push('--glob=!package-lock.json');
  args.push('--glob=!yarn.lock');

  // Max results to avoid huge outputs
  args.push('--max-count=200');

  // Pattern and path
  const escapedPattern = pattern.replace(/'/g, "'\\''");
  const cmd = `rg ${args.join(' ')} '${escapedPattern}' '${searchPath}'`;

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

    return truncateOutput(formatRipgrepOutput(output, searchPath));
  } catch (error: unknown) {
    // Exit code 1 means no matches (not an error)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 1
    ) {
      return `No matches found for pattern: ${pattern}\nSearch path: ${searchPath}`;
    }
    const message = error instanceof Error ? error.message : String(error);
    return `Error executing search: ${message}`;
  }
}

/**
 * Format ripgrep output for readability.
 */
function formatRipgrepOutput(output: string, basePath: string): string {
  const lines = output.split('\n');
  const formatted: string[] = [];
  let currentFile = '';

  for (const line of lines) {
    // ripgrep format: filename:linenum:content or filename-linenum-content (context)
    const match = line.match(/^(.+?)[:-](\d+)[:-](.*)$/);
    if (match && match[1] && match[2]) {
      const filePath = match[1];
      const lineNum = match[2];
      const content = match[3] ?? '';
      const relativePath = path.relative(basePath, filePath);

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

  return formatted.join('\n');
}

/**
 * Fallback grep using node (when ripgrep not available).
 */
async function executeBasicGrep(
  pattern: string,
  searchPath: string,
  globPattern?: string,
  context: number = 0,
  case_sensitive?: boolean,
  output_mode: string = 'content'
): Promise<string> {
  // Use grep command as fallback
  const args: string[] = ['-r', '-n'];

  if (case_sensitive === false) {
    args.push('-i');
  }

  if (output_mode === 'files') {
    args.push('-l');
  } else if (output_mode === 'count') {
    args.push('-c');
  } else if (context > 0) {
    args.push(`-C${context}`);
  }

  // Include pattern for glob
  if (globPattern) {
    args.push(`--include=${globPattern}`);
  }

  // Exclude common directories
  args.push('--exclude-dir=node_modules');
  args.push('--exclude-dir=.git');

  const escapedPattern = pattern.replace(/'/g, "'\\''");
  const cmd = `grep ${args.join(' ')} '${escapedPattern}' '${searchPath}' 2>/dev/null | head -500`;

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
    // Exit code 1 means no matches
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 1
    ) {
      return `No matches found for pattern: ${pattern}\nSearch path: ${searchPath}`;
    }
    const message = error instanceof Error ? error.message : String(error);
    return `Error executing search: ${message}`;
  }
}

// === TOOL DEFINITION ===

export const tools: ToolSpec[] = [{
  name: 'grep_search',
  description: `Search file contents for a pattern (regex supported).

Output modes:
- "content" (default): Show matching lines with context
- "files": Show only file paths that contain matches
- "count": Show count of matches per file

Uses ripgrep (rg) if available for fast searching, otherwise falls back to grep.
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
  handler: grepSearch as ToolHandler,
}];
