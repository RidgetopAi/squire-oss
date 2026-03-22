import type { ToolHandler, ToolSpec } from './types.js';
import { page } from '../services/page/index.js';

interface PageArgs {
  task: string;
  cwd?: string;
  max_turns?: number;
}

async function pageAgent(args: PageArgs): Promise<string> {
  const { task, cwd, max_turns } = args;

  if (!task || task.trim().length === 0) {
    return 'Error: task is required - describe what information you need the page to find.';
  }

  try {
    const result = await page({
      task: task.trim(),
      cwd,
      maxTurns: max_turns ?? 20,
    });

    if (!result.success) {
      return `Page agent error: ${result.error ?? 'Unknown error'}`;
    }

    // Format the result with metadata
    const lines: string[] = [];
    lines.push(`**Page Report** (${result.turns} turn${result.turns !== 1 ? 's' : ''})`);
    lines.push('');
    lines.push(result.content);
    return lines.join('\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error dispatching page agent: ${message}`;
  }
}

export const tools: ToolSpec[] = [{
  name: 'page',
  description: `Dispatch a read-only research subagent ("page") to find information.

The page agent has access to read-only tools (read_file, grep_search, glob_files, bash_read) and will autonomously search through files and directories to find the requested information.

Use this tool when you need to:
- Search through a codebase for specific patterns, implementations, or configurations
- Read and analyze multiple files to answer a question
- Explore a directory structure to understand a project
- Find specific information across many files

The page agent uses a fast model and will make multiple tool calls to gather information before returning a comprehensive report.

Parameters:
- task: What you want the page to find (be specific)
- cwd: Working directory to scope the search (optional)
- max_turns: Maximum research iterations (default: 20)`,
  parameters: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'Describe what information the page should find. Be specific about what you need.',
      },
      cwd: {
        type: 'string',
        description: 'Working directory to scope the search (defaults to configured working directory)',
      },
      max_turns: {
        type: 'number',
        description: 'Maximum number of research iterations (default: 20)',
      },
    },
    required: ['task'],
  },
  handler: pageAgent as ToolHandler,
}];
