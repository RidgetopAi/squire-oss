/**
 * Scout Tool
 *
 * On-demand fast reasoning subagent powered by Grok.
 * Multi-turn agentic loop with read-only file tools.
 * Squire can invoke Scout mid-conversation for:
 * - Reading and analyzing files
 * - Data wrangling, formatting, transformations
 * - Quick analysis, summarization, calculations
 * - Any task that doesn't need to write files
 *
 * Uses the same tool loop as Page but with a broader mandate.
 */

import type { ToolHandler, ToolSpec } from './types.js';
import { callLLM } from '../services/llm/call.js';
import type { LLMMessage, ToolDefinition } from '../services/llm/types.js';
import { getPageTools, type PageTool } from '../services/page/tools.js';

interface ScoutArgs {
  task: string;
  context?: string;
  cwd?: string;
  max_turns?: number;
}

function buildSystemPrompt(context?: string, cwd?: string): string {
  const cwdLine = cwd ? `\nYour working directory is: ${cwd}` : '';
  const contextBlock = context ? `\n\n---\n\n${context}` : '';

  return `You are Scout, a fast reasoning assistant. You have read-only access to files and can search codebases.

Your strengths:
- Reading and analyzing files, code, configs, logs
- Data wrangling, reformatting, transforming structured data
- Summarization, extraction, quick analysis
- Calculations, comparisons, generating formatted output
- Searching across files with grep and glob

Use your tools when you need to read files or search. When you have the answer, respond clearly and concisely. Do NOT attempt to modify any files.
${cwdLine}${contextBlock}`;
}

async function scoutCall(args: ScoutArgs): Promise<string> {
  const { task, context, cwd, max_turns } = args;

  if (!task || task.trim().length === 0) {
    return 'Error: task is required — tell Scout what you need.';
  }

  const maxTurns = max_turns ?? 15;
  const scoutTools: PageTool[] = getPageTools();
  const toolDefs: ToolDefinition[] = scoutTools.map(t => t.definition);

  const messages: LLMMessage[] = [
    { role: 'system', content: buildSystemPrompt(context, cwd) },
    { role: 'user', content: task.trim() },
  ];

  let turns = 0;
  let lastContent = '';

  try {
    while (turns < maxTurns) {
      turns++;

      const response = await callLLM(messages, toolDefs, {
        provider: 'xai',
        model: 'grok-4-1-fast-reasoning',
        maxTokens: 16384,
        temperature: 0.3,
      });

      lastContent = response.content || '';

      // No tool calls — Scout is done, return findings
      if (!response.toolCalls || response.toolCalls.length === 0) {
        const lines: string[] = [];
        lines.push(`**Scout** (${turns} turn${turns !== 1 ? 's' : ''})`);
        lines.push('');
        lines.push(response.content);
        return lines.join('\n');
      }

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls,
      });

      // Execute each tool call
      for (const tc of response.toolCalls) {
        const tool = scoutTools.find(
          t => t.definition.function.name === tc.function.name
        );

        let result: string;

        if (!tool) {
          result = `Error: Unknown tool '${tc.function.name}'`;
        } else {
          try {
            const toolArgs = JSON.parse(tc.function.arguments);
            result = await tool.handler(toolArgs);
          } catch (e) {
            result = `Error: ${e instanceof Error ? e.message : String(e)}`;
          }
        }

        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        });
      }
    }

    // Max turns exhausted
    const lines: string[] = [];
    lines.push(`**Scout** (${turns} turns, max reached)`);
    lines.push('');
    lines.push(lastContent || 'Max turns reached without a final response.');
    return lines.join('\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Scout error: ${message}`;
  }
}

export const tools: ToolSpec[] = [{
  name: 'scout',
  description: `Invoke Scout, a fast reasoning subagent (Grok) with read-only file access.

Scout is cheap and fast — use it to offload work that doesn't need the primary model:
- Read and analyze files, code, configs, logs, data
- Search across a codebase with grep and glob
- Data wrangling, reformatting, transforming structured data
- Summarization or extraction from files or provided context
- Quick calculations, comparisons, generating formatted output
- Drafting content based on file contents

Scout has read_file, grep_search, glob_files, and bash_read (read-only).
Scout does NOT write files — use Claude Code for that.

Parameters:
- task: What you need Scout to do (be specific)
- context: Optional background data or instructions
- cwd: Working directory to scope file access
- max_turns: Maximum tool-use iterations (default: 15)`,
  parameters: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'What you need Scout to do. Be specific about the desired output.',
      },
      context: {
        type: 'string',
        description: 'Optional background data, instructions, or text for Scout to work with.',
      },
      cwd: {
        type: 'string',
        description: 'Working directory to scope file access (defaults to configured working directory).',
      },
      max_turns: {
        type: 'number',
        description: 'Maximum number of tool-use iterations (default: 15)',
      },
    },
    required: ['task'],
  },
  handler: scoutCall as ToolHandler,
}];
