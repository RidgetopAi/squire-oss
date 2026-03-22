/**
 * Page Agent Service
 *
 * A read-only research subagent that the main agent can dispatch.
 * Uses the pi-mono style loop: call model → execute tool_calls → loop.
 * When the model stops making tool_calls, return findings.
 *
 * Model: xAI grok-4-1-fast-reasoning (fast tier)
 */

import { callLLM } from '../llm/call.js';
import type { LLMMessage, ToolDefinition } from '../llm/types.js';
import { getPageTools, type PageTool } from './tools.js';

// === TYPES ===

export interface PageRequest {
  /** The task/question for the page agent */
  task: string;
  /** Optional working directory to scope the search */
  cwd?: string;
  /** Max turns before stopping (default: 20) */
  maxTurns?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface PageResult {
  /** The page agent's findings/response */
  content: string;
  /** Number of turns taken */
  turns: number;
  /** Whether it completed successfully */
  success: boolean;
  /** Error if any */
  error?: string;
}

// === SYSTEM PROMPT ===

function buildSystemPrompt(cwd?: string): string {
  const cwdLine = cwd ? `\nYour working directory is: ${cwd}` : '';

  return `You are Page, a research assistant. Your job is to find information using your read-only tools and report back clearly and concisely.

You have access to: read_file, grep_search, glob_files, bash_read (read-only commands only).
${cwdLine}
Find the requested information efficiently. Use tools as needed. When you have the answer, respond with your findings in a clear, organized format. Do NOT make changes to any files.`;
}

// === PAGE AGENT LOOP ===

export async function page(request: PageRequest): Promise<PageResult> {
  const { task, cwd, maxTurns = 20, signal } = request;

  // Get page tools
  const pageTools: PageTool[] = getPageTools();
  const toolDefs: ToolDefinition[] = pageTools.map(t => t.definition);

  // Build initial messages
  const messages: LLMMessage[] = [
    { role: 'system', content: buildSystemPrompt(cwd) },
    { role: 'user', content: task },
  ];

  let turns = 0;
  let lastContent = '';

  try {
    while (turns < maxTurns) {
      // Check for cancellation
      if (signal?.aborted) {
        return {
          content: lastContent || 'Cancelled',
          turns,
          success: false,
          error: 'Aborted',
        };
      }

      turns++;

      // Call xAI API
      const response = await callLLM(messages, toolDefs, {
        provider: 'xai',
        model: 'grok-4-1-fast-reasoning',
        maxTokens: 16384,
        temperature: 0.3,
        signal,
      });

      lastContent = response.content || '';

      // No tool calls? Done — return the final response.
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return {
          content: response.content,
          turns,
          success: true,
        };
      }

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls,
      });

      // Execute each tool call
      for (const tc of response.toolCalls) {
        const tool = pageTools.find(
          t => t.definition.function.name === tc.function.name
        );

        let result: string;

        if (!tool) {
          result = `Error: Unknown tool '${tc.function.name}'`;
        } else {
          try {
            const args = JSON.parse(tc.function.arguments);
            result = await tool.handler(args);
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
    return {
      content: lastContent || 'Max turns reached without a final response.',
      turns,
      success: true,
    };
  } catch (error) {
    return {
      content: lastContent || '',
      turns,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
