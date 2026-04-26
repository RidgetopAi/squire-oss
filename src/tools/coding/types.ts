/**
 * Coding Tools Types
 *
 * Type definitions for file system and development tools.
 */

// === POLICY ===

export interface CodingToolPolicy {
  name: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

// === FILE READ ===

export interface FileReadArgs {
  /** Absolute or relative path to the file */
  path: string;
  /** Line offset to start reading from (1-indexed) */
  offset?: number;
  /** Maximum number of lines to read */
  limit?: number;
}

// === FILE WRITE ===

export interface FileWriteArgs {
  /** Absolute or relative path to the file */
  path: string;
  /** Content to write to the file */
  content: string;
}

// === FILE EDIT ===

export interface FileEditArgs {
  /** Absolute or relative path to the file */
  path: string;
  /** String to find and replace */
  old_string: string;
  /** Replacement string */
  new_string: string;
  /** Replace all occurrences (default: false, requires unique match) */
  replace_all?: boolean;
}

// === BASH ===

export interface BashArgs {
  /** Command to execute */
  command: string;
  /** Working directory (defaults to config.coding.workingDirectory) */
  cwd?: string;
  /** Timeout in milliseconds (defaults to config.coding.defaultTimeoutMs) */
  timeout?: number;
}

// === GREP ===

export interface GrepArgs {
  /** Search pattern (regex) */
  pattern: string;
  /** Directory or file to search in */
  path?: string;
  /** Glob pattern to filter files (e.g., "*.ts") */
  glob?: string;
  /** Lines of context to show around matches */
  context?: number;
  /** Case sensitive search (default: smart-case) */
  case_sensitive?: boolean;
  /** Output mode: "content", "files", or "count" */
  output_mode?: 'content' | 'files' | 'count';
}

// === GLOB ===

export interface GlobArgs {
  /** Glob pattern (e.g., "**\/*.ts", "src/**\/*.js") */
  pattern: string;
  /** Base directory to search from */
  path?: string;
  /** Maximum number of results (default: 100) */
  limit?: number;
}

// === GIT ===

export type GitOperation =
  | 'status'
  | 'diff'
  | 'log'
  | 'add'
  | 'commit'
  | 'branch'
  | 'checkout'
  | 'pull'
  | 'push';

export interface GitArgs {
  /** Git operation to perform */
  operation: GitOperation;
  /** Additional arguments for the operation */
  args?: string[];
  /** Working directory (defaults to config.coding.workingDirectory) */
  cwd?: string;
}

// === CLAUDE CODE ===

export interface ClaudeCodeArgs {
  /** The task/prompt for Claude Code to execute */
  prompt: string;
  /** Working directory for the session (default: CODING_WORKING_DIR or process cwd) */
  workingDir?: string;
  /** Session ID for continuity within conversation */
  sessionId?: string;
  /** Model to use (default: opus) */
  model?: 'opus' | 'sonnet' | 'haiku';
  /** Timeout in milliseconds (default: 900000 = 15 min) */
  timeout?: number;
}

export interface ClaudeCodeResult {
  /** The response content from Claude Code */
  result: string;
  /** Session ID for future calls */
  sessionId: string;
  /** Whether the call succeeded */
  success: boolean;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Error message if failed */
  error?: string;
}
