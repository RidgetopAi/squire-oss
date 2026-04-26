/**
 * Glob Tool
 *
 * Find files matching glob patterns.
 * Returns file paths with metadata.
 */

import { glob } from 'glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../../config/index.js';
import type { ToolHandler, ToolSpec } from '../types.js';
import type { GlobArgs } from './types.js';
import { resolveSafePath, PATH_TRAVERSAL_REFUSAL } from './policies.js';

// === HANDLER ===

async function globFiles(args: GlobArgs): Promise<string> {
  const { pattern, path: basePath, limit = 100 } = args;

  if (!pattern) {
    return 'Error: pattern is required';
  }

  let resolvedBase: string;
  if (basePath) {
    const safe = resolveSafePath(basePath);
    if (safe === null) {
      return PATH_TRAVERSAL_REFUSAL;
    }
    resolvedBase = safe;
  } else {
    resolvedBase = config.coding.workingDirectory;
  }

  try {
    // Check if base path exists
    try {
      await fs.access(resolvedBase);
    } catch {
      return `Error: Base path does not exist: ${resolvedBase}`;
    }

    // Build full pattern
    const fullPattern = path.join(resolvedBase, pattern);

    // Execute glob
    const matches = await glob(fullPattern, {
      nodir: false,
      dot: false, // Don't match dotfiles by default
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    if (matches.length === 0) {
      return `No files found matching pattern: ${pattern}\nBase path: ${resolvedBase}`;
    }

    // Get file info for each match
    const results: Array<{
      path: string;
      relativePath: string;
      size: number;
      isDir: boolean;
      modified: string;
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
          path: match,
          relativePath: path.relative(resolvedBase, match),
          size: stats.size,
          isDir: stats.isDirectory(),
          modified: stats.mtime.toISOString(),
        });
      } catch {
        // File might have been deleted between glob and stat
        continue;
      }
    }

    // Sort by modification time (newest first)
    results.sort(
      (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
    );

    // Format output
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

/**
 * Format file size in human-readable format.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

// === TOOL DEFINITION ===

export const tools: ToolSpec[] = [{
  name: 'glob_files',
  description: `Find files matching a glob pattern.

Common patterns:
- "*.ts" - TypeScript files in current directory
- "**/*.ts" - TypeScript files recursively
- "src/**/*.{js,ts}" - JS and TS files in src
- "**/test*.ts" - Test files anywhere

Returns file paths with size and modification time.
Automatically ignores node_modules and .git directories.`,
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
  handler: globFiles as ToolHandler,
}];
