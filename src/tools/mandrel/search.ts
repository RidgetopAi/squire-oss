/**
 * Mandrel Smart Search Tool
 *
 * Intelligent search across all Mandrel project data - contexts, tasks, and decisions.
 * - mandrel_smart_search: Search all project data when unsure which category to search
 */

import { callMandrelTool } from '../../services/mandrel/index.js';
import type { ToolHandler, ToolSpec } from '../types.js';
import type { SmartSearchArgs } from './types.js';

// === mandrel_smart_search ===

const mandrelSmartSearchToolHandler: ToolHandler<SmartSearchArgs> = async (args) => {
  const result = await callMandrelTool('smart_search', args as unknown as Record<string, unknown>);
  if (!result.success) return `Error searching: ${result.error}`;
  return typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
};

export const tools: ToolSpec[] = [
  {
    name: 'mandrel_smart_search',
    description:
      'Intelligent search across all Mandrel project data - contexts, tasks, and decisions. Use when you need to find information but are not sure which category it falls under.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query - describe what you are looking for',
        },
      },
      required: ['query'],
    },
    handler: mandrelSmartSearchToolHandler as ToolHandler,
  },
];
