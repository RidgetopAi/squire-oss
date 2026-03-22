/**
 * Coding Tools Module
 *
 * Exports all coding/development tools for file operations,
 * search, and command execution.
 */

import type { ToolSpec } from '../types.js';

// Types
export type {
  CodingToolPolicy,
  FileReadArgs,
  FileWriteArgs,
  FileEditArgs,
  BashArgs,
  GrepArgs,
  GlobArgs,
  GitArgs,
  GitOperation,
  ClaudeCodeArgs,
  ClaudeCodeResult,
} from './types.js';

// Policies
export {
  resolvePath,
  isPathTraversal,
  isBlockedCommand,
  truncateOutput,
  isBinaryContent,
  formatWithLineNumbers,
  generateDiff,
} from './policies.js';

// Tool specs
import { tools as bashTools } from './bash.js';
import { tools as claudeCodeTools } from './claude-code.js';
import { tools as editTools } from './edit.js';
import { tools as gitTools } from './git.js';
import { tools as globTools } from './glob.js';
import { tools as grepTools } from './grep.js';
import { tools as readTools } from './read.js';
import { tools as writeTools } from './write.js';

export const tools: ToolSpec[] = [
  ...bashTools,
  ...claudeCodeTools,
  ...editTools,
  ...gitTools,
  ...globTools,
  ...grepTools,
  ...readTools,
  ...writeTools,
];
