import { callMandrelTool } from '../../services/mandrel/index.js';
import type { ToolHandler, ToolSpec } from '../types.js';
import type { ProjectSwitchArgs } from './types.js';

// === mandrel_project_switch ===

const mandrelProjectSwitchToolHandler: ToolHandler<ProjectSwitchArgs> = async (args) => {
  const result = await callMandrelTool('project_switch', args as unknown as Record<string, unknown>);
  if (!result.success) return `Error switching project: ${result.error}`;
  return typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
};

// === mandrel_project_current ===

const mandrelProjectCurrentToolHandler: ToolHandler<Record<string, never>> = async () => {
  const result = await callMandrelTool('project_current', {});
  if (!result.success) return `Error getting current project: ${result.error}`;
  return typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
};

// === mandrel_project_list ===

const mandrelProjectListToolHandler: ToolHandler<Record<string, never>> = async () => {
  const result = await callMandrelTool('project_list', {});
  if (!result.success) return `Error listing projects: ${result.error}`;
  return typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
};

export const tools: ToolSpec[] = [
  {
    name: 'mandrel_project_switch',
    description:
      'Switch to a different Mandrel project. All subsequent context, task, and decision operations will use this project.',
    parameters: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID to switch to'
        },
      },
      required: ['project'],
    },
    handler: mandrelProjectSwitchToolHandler as ToolHandler,
  },
  {
    name: 'mandrel_project_current',
    description:
      'Get information about the currently active Mandrel project.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: mandrelProjectCurrentToolHandler as ToolHandler,
  },
  {
    name: 'mandrel_project_list',
    description:
      'List all available Mandrel projects with their statistics.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: mandrelProjectListToolHandler as ToolHandler,
  },
];
