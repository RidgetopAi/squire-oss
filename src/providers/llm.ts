/**
 * LLM Provider (Legacy API)
 *
 * Thin wrapper around unified services/llm/ module.
 * Preserves the existing `complete()` / `completeText()` API
 * used by 15+ consumers across the codebase.
 *
 * All provider-specific logic (Anthropic, Groq, xAI, Gemini, Ollama)
 * now lives in services/llm/call.ts and services/llm/stream.ts.
 */

import { config } from '../config/index.js';
import { callLLM, type LLMMessage as UnifiedMessage, type LLMResponse, type ImageContent } from '../services/llm/index.js';
import type { ToolDefinition, ToolCall } from '../tools/types.js';

// Re-export tool types for convenience
export type { ToolDefinition, ToolCall } from '../tools/types.js';
export type { ImageContent } from '../services/llm/index.js';

// === TYPES ===

/**
 * LLM message - matches unified format
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  images?: ImageContent[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface LLMCompletionOptions {
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
}

export interface LLMCompletionResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length';
}

export interface LLMProvider {
  complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMCompletionResult>;
  isAvailable(): Promise<boolean>;
}

// === MAIN API ===

/**
 * Complete a prompt with the configured LLM.
 * Delegates to unified callLLM and adapts the response.
 */
export async function complete(
  messages: LLMMessage[],
  options?: LLMCompletionOptions
): Promise<LLMCompletionResult> {
  // Convert messages (content: string | null → string)
  const unifiedMessages: UnifiedMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content ?? '',
    images: m.images,
    tool_calls: m.tool_calls,
    tool_call_id: m.tool_call_id,
  }));

  const response: LLMResponse = await callLLM(unifiedMessages, options?.tools, {
    maxTokens: options?.maxTokens,
    temperature: options?.temperature,
  });

  const promptTokens = response.usage?.promptTokens ?? 0;
  const completionTokens = response.usage?.completionTokens ?? 0;

  return {
    content: response.content,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    model: response.model ?? config.llm.model,
    provider: config.llm.provider,
    toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
    finishReason: response.toolCalls.length > 0 ? 'tool_calls' : 'stop',
  };
}

/**
 * Simple text completion helper
 */
export async function completeText(
  prompt: string,
  systemPrompt?: string,
  options?: LLMCompletionOptions
): Promise<string> {
  const messages: LLMMessage[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const result = await complete(messages, options);
  return result.content;
}

/**
 * Check if LLM provider is available
 */
export async function checkLLMHealth(): Promise<boolean> {
  try {
    // Make a minimal call to verify the provider is reachable
    const result = await complete(
      [{ role: 'user', content: 'hi' }],
      { maxTokens: 1 }
    );
    return !!result.content || result.content === '';
  } catch {
    return false;
  }
}

/**
 * Get current LLM configuration info
 */
export function getLLMInfo(): { provider: string; model: string; configured: boolean } {
  let configured = true;
  switch (config.llm.provider) {
    case 'groq':
      configured = !!config.llm.groqApiKey;
      break;
    case 'xai':
      configured = !!config.llm.xaiApiKey;
      break;
    case 'gemini':
      configured = !!config.llm.geminiApiKey;
      break;
    case 'anthropic':
      configured = !!config.llm.anthropicApiKey;
      break;
    case 'ollama':
      configured = true;
      break;
  }
  return {
    provider: config.llm.provider,
    model: config.llm.model,
    configured,
  };
}
