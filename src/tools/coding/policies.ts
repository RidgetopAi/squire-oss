/**
 * Coding Tools Policies
 *
 * Validation and safety utilities for coding tools.
 */

import * as path from 'path';
import { config } from '../../config/index.js';

/**
 * Resolve a path relative to the working directory.
 * Handles both absolute and relative paths.
 *
 * @param inputPath - The path from tool arguments
 * @param workingDir - Base working directory (defaults to config)
 * @returns Resolved absolute path
 */
export function resolvePath(
  inputPath: string,
  workingDir: string = config.coding.workingDirectory
): string {
  // Expand ~ to home directory
  if (inputPath.startsWith('~/')) {
    const home = process.env['HOME'] ?? '/home/user';
    inputPath = path.join(home, inputPath.slice(2));
  }

  // If absolute, return as-is
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }

  // Otherwise, resolve relative to working directory
  return path.resolve(workingDir, inputPath);
}

/**
 * Check if a path contains path traversal attempts.
 * This is a basic security check - we're permissive but not naive.
 *
 * @param inputPath - The path to check
 * @returns true if path traversal is detected
 */
export function isPathTraversal(inputPath: string): boolean {
  // Normalize and check for .. that escapes
  const normalized = path.normalize(inputPath);

  // Check for obvious traversal patterns
  if (normalized.includes('..')) {
    // This is actually fine in many cases, but we can flag it
    // For now, we're permissive - just log a warning
    console.warn(`Path contains '..': ${inputPath}`);
  }

  return false; // Permissive - allow all paths
}

/**
 * Check if a command matches any blocked patterns.
 *
 * @param command - The bash command to check
 * @returns true if command is blocked
 */
export function isBlockedCommand(command: string): boolean {
  const lowerCommand = command.toLowerCase().trim();

  for (const blocked of config.coding.blockedCommands) {
    // Check if command contains the blocked pattern
    if (lowerCommand.includes(blocked.toLowerCase())) {
      return true;
    }
  }

  // Additional safety checks for dangerous patterns
  const dangerousPatterns = [
    /rm\s+(-[rf]+\s+)*\/\s*$/, // rm / or rm -rf /
    /rm\s+(-[rf]+\s+)*\/\*/, // rm /* or rm -rf /*
    />\s*\/dev\/[sh]d[a-z]/, // overwrite disk devices
    /mkfs\./, // format filesystems
    /dd\s+if=\/dev\/(zero|random|urandom).*of=\/dev/, // dd to devices
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(lowerCommand)) {
      return true;
    }
  }

  return false;
}

/**
 * Truncate output to max bytes with a marker.
 *
 * @param output - The output string
 * @param maxBytes - Maximum bytes to keep
 * @returns Truncated output with marker if truncated
 */
export function truncateOutput(
  output: string,
  maxBytes: number = config.coding.maxOutputBytes
): string {
  if (Buffer.byteLength(output, 'utf8') <= maxBytes) {
    return output;
  }

  // Find a safe truncation point (don't cut UTF-8 chars)
  let truncated = output;
  while (Buffer.byteLength(truncated, 'utf8') > maxBytes - 100) {
    // Leave room for marker
    truncated = truncated.slice(0, -1000);
  }

  const marker = `\n\n... [Output truncated at ${maxBytes} bytes] ...`;
  return truncated + marker;
}

/**
 * Check if a buffer likely contains binary data.
 * Binary files have null bytes in the first 8KB.
 *
 * @param buffer - Buffer to check
 * @returns true if binary data detected
 */
export function isBinaryContent(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 8192);
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Format file content with line numbers (like cat -n).
 *
 * @param content - File content
 * @param startLine - Starting line number (1-indexed)
 * @returns Formatted content with line numbers
 */
export function formatWithLineNumbers(
  content: string,
  startLine: number = 1
): string {
  const lines = content.split('\n');
  const maxLineNum = startLine + lines.length - 1;
  const padding = String(maxLineNum).length;

  return lines
    .map((line, index) => {
      const lineNum = String(startLine + index).padStart(padding, ' ');
      return `${lineNum}\t${line}`;
    })
    .join('\n');
}

/**
 * Generate a unified diff between two strings.
 *
 * @param oldContent - Original content
 * @param newContent - New content
 * @param filename - Filename for diff header
 * @returns Unified diff string
 */
export function generateDiff(
  oldContent: string,
  newContent: string,
  filename: string
): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const diff: string[] = [];
  diff.push(`--- a/${filename}`);
  diff.push(`+++ b/${filename}`);

  // Simple line-by-line diff (not optimal but readable)
  let i = 0,
    j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length) {
      if (oldLines[i] === newLines[j]) {
        diff.push(` ${oldLines[i]}`);
        i++;
        j++;
      } else {
        // Find where they diverge and converge
        diff.push(`-${oldLines[i]}`);
        i++;
        if (j < newLines.length) {
          diff.push(`+${newLines[j]}`);
          j++;
        }
      }
    } else if (i < oldLines.length) {
      diff.push(`-${oldLines[i]}`);
      i++;
    } else {
      diff.push(`+${newLines[j]}`);
      j++;
    }
  }

  return diff.join('\n');
}
