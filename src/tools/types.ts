/**
 * Tool Types
 *
 * Type definitions for the tool calling infrastructure.
 * Follows OpenAI/Groq function calling format.
 */

// === TOOL DEFINITION (sent to LLM) ===

/**
 * Tool definition in OpenAI/Groq format
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

// === TOOL CALL (from LLM response) ===

/**
 * Tool call request from LLM
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string - needs parsing
  };
}

// === TOOL RESULT (for LLM) ===

/**
 * Result of executing a tool
 */
export interface ToolResult {
  toolCallId: string;
  name: string;
  result: string; // String content for LLM
  success: boolean;
}

// === TOOL HANDLER ===

/**
 * Function signature for tool handlers
 * Takes parsed arguments, returns string result
 */
export type ToolHandler<T = unknown> = (args: T) => Promise<string> | string;

/**
 * Compact tool specification for registration.
 * Each tool module exports an array of these.
 */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: ToolHandler;
}

/**
 * Registered tool with definition and handler
 */
export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

// === LLM MESSAGE EXTENSIONS ===

/**
 * Extended message type that includes tool calls (assistant) and tool results
 */
export interface ToolMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

/**
 * Assistant message with optional tool calls
 */
export interface AssistantMessageWithTools {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
}
