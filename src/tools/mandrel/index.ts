// src/tools/mandrel/index.ts

// Re-export types
export * from './types.js';

// Re-export consolidated tool specs
import type { ToolSpec } from '../types.js';
import { tools as contextTools } from './context.js';
import { tools as decisionTools } from './decision.js';
import { tools as projectTools } from './project.js';
import { tools as searchTools } from './search.js';
import { tools as taskTools } from './task.js';

export const tools: ToolSpec[] = [
  ...contextTools,
  ...decisionTools,
  ...projectTools,
  ...searchTools,
  ...taskTools,
];
