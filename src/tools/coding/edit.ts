/**
 * File Edit Tool
 *
 * Perform surgical string replacement in files.
 * Requires unique match by default (or explicit replace_all).
 */

import * as fs from 'fs/promises';
import type { ToolHandler, ToolSpec } from '../types.js';
import type { FileEditArgs } from './types.js';
import { resolveSafePath, PATH_TRAVERSAL_REFUSAL, generateDiff } from './policies.js';

// === HANDLER ===

async function fileEdit(args: FileEditArgs): Promise<string> {
  const { path: inputPath, old_string, new_string, replace_all = false } = args;

  if (!inputPath) {
    return 'Error: path is required';
  }

  if (!old_string) {
    return 'Error: old_string is required';
  }

  if (new_string === undefined || new_string === null) {
    return 'Error: new_string is required';
  }

  if (old_string === new_string) {
    return 'Error: old_string and new_string are identical';
  }

  const resolvedPath = resolveSafePath(inputPath);
  if (resolvedPath === null) {
    return PATH_TRAVERSAL_REFUSAL;
  }

  try {
    // Read the file
    let content: string;
    try {
      content = await fs.readFile(resolvedPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return `Error: File not found: ${resolvedPath}`;
      }
      throw error;
    }

    // Count occurrences
    const occurrences = countOccurrences(content, old_string);

    if (occurrences === 0) {
      return `Error: String not found in file.

Searched for:
"""
${old_string}
"""

File: ${resolvedPath}

Tip: Make sure the string matches exactly, including whitespace and indentation.`;
    }

    if (occurrences > 1 && !replace_all) {
      return `Error: Found ${occurrences} occurrences of the string.
Use replace_all: true to replace all occurrences, or provide a more specific string.

File: ${resolvedPath}

Tip: Include more surrounding context to make the match unique.`;
    }

    // Perform replacement
    let newContent: string;
    let replacementCount: number;

    if (replace_all) {
      newContent = content.split(old_string).join(new_string);
      replacementCount = occurrences;
    } else {
      // Replace only first occurrence
      const index = content.indexOf(old_string);
      newContent =
        content.substring(0, index) +
        new_string +
        content.substring(index + old_string.length);
      replacementCount = 1;
    }

    // Write the file
    await fs.writeFile(resolvedPath, newContent, 'utf-8');

    // Generate diff for output
    const diff = generateDiff(content, newContent, inputPath);

    return `Edited: ${resolvedPath}
Replacements: ${replacementCount}

${diff}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      return `Error: Permission denied: ${resolvedPath}`;
    }
    const message = error instanceof Error ? error.message : String(error);
    return `Error editing file: ${message}`;
  }
}

/**
 * Count non-overlapping occurrences of a substring.
 */
function countOccurrences(content: string, search: string): number {
  let count = 0;
  let position = 0;

  while (true) {
    const index = content.indexOf(search, position);
    if (index === -1) break;
    count++;
    position = index + search.length;
  }

  return count;
}

// === TOOL DEFINITION ===

export const tools: ToolSpec[] = [{
  name: 'file_edit',
  description: `Edit a file by replacing a specific string with new content.

IMPORTANT: The old_string must match EXACTLY, including:
- Whitespace and indentation
- Line endings
- Any special characters

By default, the string must be unique in the file. If there are multiple matches:
- Provide more context to make it unique, OR
- Set replace_all: true to replace all occurrences

Returns a diff showing what changed.`,
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit',
      },
      old_string: {
        type: 'string',
        description: 'The exact string to find and replace',
      },
      new_string: {
        type: 'string',
        description: 'The string to replace it with',
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace all occurrences (default: false, requires unique match)',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  handler: fileEdit as ToolHandler,
}];
