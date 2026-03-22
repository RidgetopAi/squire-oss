import type { ToolSpec } from '../types.js';
import { tools as archiveTools } from './archive.js';
import { tools as checkTools } from './check.js';
import { tools as deleteTools } from './delete.js';
import { tools as listTools } from './list.js';
import { tools as readTools } from './read.js';
import { tools as searchTools } from './search.js';
import { tools as sendTools } from './send.js';

export const tools: ToolSpec[] = [
  ...archiveTools,
  ...checkTools,
  ...deleteTools,
  ...listTools,
  ...readTools,
  ...searchTools,
  ...sendTools,
];
