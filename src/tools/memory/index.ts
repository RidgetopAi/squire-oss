/**
 * Memory Tools - lessons and preferences
 *
 * Re-exports all memory tool specs for registration.
 */

import type { ToolSpec } from '../types.js';
import { tools as lessonTools } from './lesson.js';
import { tools as preferenceTools } from './preference.js';

export const tools: ToolSpec[] = [
  ...lessonTools,
  ...preferenceTools,
];
