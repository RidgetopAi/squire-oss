/**
 * Tool Registry and Executor
 *
 * Central registry for LLM tools. Tools export their definitions,
 * and are registered here after the registry is initialized.
 */

import type {
  ToolDefinition,
  ToolCall,
  ToolResult,
  ToolHandler,
  ToolSpec,
  RegisteredTool,
} from './types.js';
import { logToolCall } from '../services/tool-logger.js';

// Re-export types for convenience
export type {
  ToolDefinition,
  ToolCall,
  ToolResult,
  ToolHandler,
  ToolSpec,
  RegisteredTool,
  ToolMessage,
  AssistantMessageWithTools,
} from './types.js';

// === CONSTANTS ===

/** Max characters for a single tool result before truncation (~8K tokens) */
const MAX_TOOL_RESULT_LENGTH = 32_000;

// === REGISTRY ===

const tools: Map<string, RegisteredTool> = new Map();

/**
 * Register a tool with the registry
 *
 * @param name - Unique tool name (e.g., 'get_current_time')
 * @param description - Description for LLM to understand when to use it
 * @param parameters - JSON Schema for tool parameters
 * @param handler - Function to execute when tool is called
 */
export function registerTool<T = unknown>(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
  handler: ToolHandler<T>
): void {
  if (tools.has(name)) {
    console.warn(`Tool '${name}' is already registered. Overwriting.`);
  }

  tools.set(name, {
    definition: {
      type: 'function',
      function: {
        name,
        description,
        parameters,
      },
    },
    handler: handler as ToolHandler,
  });

  console.log(`Tool registered: ${name}`);
}

/**
 * Get all registered tool definitions (for LLM request)
 */
export function getToolDefinitions(): ToolDefinition[] {
  return Array.from(tools.values()).map((t) => t.definition);
}

/**
 * Check if any tools are registered
 */
export function hasTools(): boolean {
  return tools.size > 0;
}

/**
 * Get count of registered tools
 */
export function getToolCount(): number {
  return tools.size;
}

// === EXECUTOR ===

/**
 * Execute a single tool call
 *
 * @param call - Tool call from LLM response
 * @returns Tool result with success/failure status
 */
export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const tool = tools.get(call.function.name);
  const startTime = Date.now();

  if (!tool) {
    // Log unknown tool call
    logToolCall({
      toolName: call.function.name,
      arguments: {},
      success: false,
      errorMessage: `Unknown tool '${call.function.name}'`,
      durationMs: Date.now() - startTime,
    });
    return {
      toolCallId: call.id,
      name: call.function.name,
      result: `Error: Unknown tool '${call.function.name}'`,
      success: false,
    };
  }

  try {
    // Parse arguments from JSON string
    let args: Record<string, unknown> = {};
    if (call.function.arguments) {
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        // Log parse error
        logToolCall({
          toolName: call.function.name,
          arguments: {},
          success: false,
          errorMessage: `Invalid JSON arguments: ${call.function.arguments}`,
          durationMs: Date.now() - startTime,
        });
        return {
          toolCallId: call.id,
          name: call.function.name,
          result: `Error: Invalid JSON arguments: ${call.function.arguments}`,
          success: false,
        };
      }
    }

    // Execute handler
    let result = await tool.handler(args);
    const durationMs = Date.now() - startTime;

    // Truncate oversized results to prevent token explosion
    if (result.length > MAX_TOOL_RESULT_LENGTH) {
      const originalLength = result.length;
      result = result.slice(0, MAX_TOOL_RESULT_LENGTH) +
        `\n\n[Result truncated: ${originalLength.toLocaleString()} chars → ${MAX_TOOL_RESULT_LENGTH.toLocaleString()} chars]`;
      console.warn(`[Tools] ${call.function.name} result truncated: ${originalLength} → ${MAX_TOOL_RESULT_LENGTH} chars`);
    }

    // Log successful call
    logToolCall({
      toolName: call.function.name,
      arguments: args,
      resultSummary: result,
      success: true,
      durationMs,
    });

    return {
      toolCallId: call.id,
      name: call.function.name,
      result,
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    // Log error
    logToolCall({
      toolName: call.function.name,
      arguments: {},
      success: false,
      errorMessage: message,
      durationMs,
    });

    return {
      toolCallId: call.id,
      name: call.function.name,
      result: `Error executing tool: ${message}`,
      success: false,
    };
  }
}

/**
 * Execute multiple tool calls in parallel
 *
 * @param calls - Array of tool calls from LLM response
 * @returns Array of tool results
 */
export async function executeTools(calls: ToolCall[]): Promise<ToolResult[]> {
  return Promise.all(calls.map(executeTool));
}

// === TOOL REGISTRATION ===
// Import tool arrays and register them
// This happens after the registry Map is initialized

import { tools as timeTools } from './time.js';
import { tools as notesTools } from './notes.js';
import { tools as listsTools } from './lists.js';
import { tools as trackersTools } from './trackers.js';
import { tools as calendarTools } from './calendar.js';
import { tools as commitmentTools } from './commitments.js';
import { tools as reminderTools } from './reminders.js';
import { tools as codingTools } from './coding/index.js';
import { tools as stewardTools } from './steward.js';
import { tools as memoryTools } from './memory/index.js';
import { tools as emailTools } from './email/index.js';
import { tools as squireEmailTools } from './squire-email/index.js';
import { tools as searchTools } from './search.js';
import { tools as scratchpadTools } from './scratchpad.js';
import { tools as communeTools } from './commune.js';
import { tools as imageTools } from './images.js';
import { tools as reportTools } from './report.js';
import { tools as pageTools } from './page.js';
import { tools as goalTools } from './goals.js';
import { tools as continuityTools } from './continuity.js';
import { tools as pdfTools } from './pdf.js';
import { tools as scoutTools } from './scout.js';
import { tools as sandboxTools } from './sandbox.js';
import { tools as jobTools } from './jobs.js';
import { tools as browserTools } from './browser/index.js';

const allToolSpecs: ToolSpec[] = [
  ...timeTools,
  ...notesTools,
  ...listsTools,
  ...trackersTools,
  ...calendarTools,
  ...commitmentTools,
  ...reminderTools,
  ...codingTools,
  ...stewardTools,
  ...memoryTools,
  ...emailTools,
  ...squireEmailTools,
  ...searchTools,
  ...scratchpadTools,
  ...communeTools,
  ...imageTools,
  ...reportTools,
  ...pageTools,
  ...goalTools,
  ...continuityTools,
  ...pdfTools,
  ...scoutTools,
  ...sandboxTools,
  ...jobTools,
  ...browserTools,
];

for (const spec of allToolSpecs) {
  registerTool(spec.name, spec.description, spec.parameters, spec.handler);
}
