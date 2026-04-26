/**
 * File Write Tool
 *
 * Create or overwrite files with new content.
 * Automatically creates parent directories if needed.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolHandler, ToolSpec } from '../types.js';
import type { FileWriteArgs } from './types.js';
import { resolveSafePath, PATH_TRAVERSAL_REFUSAL } from './policies.js';

// === HANDLER ===

async function fileWrite(args: FileWriteArgs): Promise<string> {
  const { path: inputPath, content } = args;

  if (!inputPath) {
    return 'Error: path is required';
  }

  if (content === undefined || content === null) {
    return 'Error: content is required';
  }

  const resolvedPath = resolveSafePath(inputPath);
  if (resolvedPath === null) {
    return PATH_TRAVERSAL_REFUSAL;
  }

  try {
    // Check if file exists (to report create vs overwrite)
    let isNew = false;
    try {
      await fs.access(resolvedPath);
    } catch {
      isNew = true;
    }

    // Create parent directories if needed
    const parentDir = path.dirname(resolvedPath);
    await fs.mkdir(parentDir, { recursive: true });

    // Write the file
    await fs.writeFile(resolvedPath, content, 'utf-8');

    // Get file stats for confirmation
    const stats = await fs.stat(resolvedPath);
    const sizeBytes = stats.size;
    const lineCount = content.split('\n').length;

    const action = isNew ? 'Created' : 'Updated';
    return `${action}: ${resolvedPath}
Size: ${sizeBytes} bytes
Lines: ${lineCount}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      return `Error: Permission denied: ${resolvedPath}`;
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOSPC') {
      return `Error: No space left on device`;
    }
    const message = error instanceof Error ? error.message : String(error);
    return `Error writing file: ${message}`;
  }
}

// === TOOL DEFINITION ===

export const tools: ToolSpec[] = [{
  name: 'file_write',
  description: `Create a new file or overwrite an existing file with content.

Use this tool to:
- Create new source files
- Write configuration files
- Save generated content

Parent directories are created automatically if they don't exist.
CAUTION: This will overwrite existing files without warning.`,
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file (absolute or relative to working directory)',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
    },
    required: ['path', 'content'],
  },
  handler: fileWrite as ToolHandler,
}];
