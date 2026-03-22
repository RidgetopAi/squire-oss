/**
 * File Read Tool
 *
 * Read file contents with optional line range support.
 * Detects binary files and returns metadata instead of content.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolHandler, ToolSpec } from '../types.js';
import type { FileReadArgs } from './types.js';
import {
  resolvePath,
  isBinaryContent,
  formatWithLineNumbers,
  truncateOutput,
} from './policies.js';

// === HANDLER ===

async function fileRead(args: FileReadArgs): Promise<string> {
  const { path: inputPath, offset, limit } = args;

  if (!inputPath) {
    return 'Error: path is required';
  }

  const resolvedPath = resolvePath(inputPath);

  try {
    // Check if file exists
    const stats = await fs.stat(resolvedPath);

    if (stats.isDirectory()) {
      return `Error: ${resolvedPath} is a directory, not a file. Use glob_files to list directory contents.`;
    }

    // Read file as buffer first to check for binary
    const buffer = await fs.readFile(resolvedPath);

    // Check for binary content
    if (isBinaryContent(buffer)) {
      return formatBinaryMetadata(resolvedPath, stats);
    }

    // Convert to string
    let content = buffer.toString('utf-8');
    const totalLines = content.split('\n').length;

    // Handle line range
    if (offset !== undefined || limit !== undefined) {
      const lines = content.split('\n');
      const startLine = Math.max(1, offset ?? 1);
      const endLine = limit
        ? Math.min(lines.length, startLine + limit - 1)
        : lines.length;

      const selectedLines = lines.slice(startLine - 1, endLine);
      content = formatWithLineNumbers(selectedLines.join('\n'), startLine);

      // Add range info
      const rangeInfo = `[Lines ${startLine}-${endLine} of ${totalLines}]`;
      content = `${rangeInfo}\n\n${content}`;
    } else {
      // Full file with line numbers
      content = formatWithLineNumbers(content, 1);
    }

    // Truncate if too large
    content = truncateOutput(content);

    return content;
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

/**
 * Format metadata for binary files instead of dumping content.
 */
function formatBinaryMetadata(
  filePath: string,
  stats: import('fs').Stats
): string {
  const ext = path.extname(filePath).toLowerCase();
  const sizeKB = (stats.size / 1024).toFixed(2);

  const fileTypes: Record<string, string> = {
    '.png': 'PNG image',
    '.jpg': 'JPEG image',
    '.jpeg': 'JPEG image',
    '.gif': 'GIF image',
    '.webp': 'WebP image',
    '.svg': 'SVG image (may be text)',
    '.pdf': 'PDF document',
    '.zip': 'ZIP archive',
    '.tar': 'TAR archive',
    '.gz': 'Gzip compressed',
    '.exe': 'Windows executable',
    '.so': 'Shared library',
    '.dylib': 'macOS library',
    '.wasm': 'WebAssembly binary',
    '.mp3': 'MP3 audio',
    '.mp4': 'MP4 video',
    '.mov': 'QuickTime video',
    '.woff': 'Web font',
    '.woff2': 'Web font 2',
    '.ttf': 'TrueType font',
  };

  const fileType = fileTypes[ext] ?? 'Binary file';

  return `[Binary file detected]
Type: ${fileType}
Path: ${filePath}
Size: ${sizeKB} KB
Modified: ${stats.mtime.toISOString()}

Binary files cannot be displayed as text. Use appropriate tools to view or manipulate this file type.`;
}

// === TOOL DEFINITION ===

export const tools: ToolSpec[] = [{
  name: 'file_read',
  description: `Read the contents of a file. Returns the file content with line numbers.

Use this tool to:
- View source code files
- Read configuration files
- Check file contents before editing

For large files, use offset and limit to read specific sections.
Binary files will return metadata instead of content.`,
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Path to the file (absolute or relative to working directory)',
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
  handler: fileRead as ToolHandler,
}];
