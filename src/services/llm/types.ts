/**
 * Unified LLM Types
 *
 * Canonical types for all LLM interactions across Squire.
 * All providers convert to/from this format.
 */

import type { ToolCall } from '../../tools/types.js';

// Re-export tool types for convenience
export type { ToolCall, ToolDefinition } from '../../tools/types.js';

/**
 * Image content for vision-enabled messages
 */
export interface ImageContent {
  /** Base64-encoded image data */
  data: string;
  /** MIME type (e.g., 'image/jpeg', 'image/png', 'image/gif', 'image/webp') */
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

/**
 * Canonical message format (OpenAI-style, used internally everywhere)
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Optional images attached to this message (for vision) */
  images?: ImageContent[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * Response from a single LLM call
 */
export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  model?: string;
}

/**
 * Options for LLM calls
 */
export interface CallOptions {
  signal?: AbortSignal;
  /** Override default provider */
  provider?: string;
  /** Override default model */
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Callbacks for streaming responses
 */
export interface StreamCallbacks {
  /** Called for each text chunk as it arrives */
  onChunk?: (text: string) => void;
}

/**
 * Resolved provider configuration (internal)
 */
export interface ProviderConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}

// === Anthropic API types ===

export interface AnthropicContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  model?: string;
}

// === OpenAI-compatible API types ===

export interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: ToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  model?: string;
}
