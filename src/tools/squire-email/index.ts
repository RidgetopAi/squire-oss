import type { ToolSpec } from '../types.js';
import { tools as listTools } from './list.js';
import { tools as readTools } from './read.js';
import { tools as sendTools } from './send.js';
import { tools as replyTools } from './reply.js';

export const tools: ToolSpec[] = [
  ...listTools,
  ...readTools,
  ...sendTools,
  ...replyTools,
];
