/**
 * LLM Message Format Conversion
 *
 * Single source of truth for converting between canonical (OpenAI-style)
 * message format and provider-specific formats.
 *
 * Previously this logic was duplicated in 4 places. Now it's here.
 */

import type {
  LLMMessage,
  LLMResponse,
  ToolDefinition,
  ToolCall,
  AnthropicResponse,
  OpenAIResponse,
} from './types.js';

// === Anthropic Message Types ===

type AnthropicContentItem = {
  type: string;
  tool_use_id?: string;
  content?: string;
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
};

export type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentItem[];
};

export type AnthropicSystemBlock = {
  type: 'text';
  text: string;
  cache_control: { type: 'ephemeral' };
};

export type AnthropicToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: { type: 'ephemeral' };
};

// === Conversion Functions ===

/**
 * Convert canonical messages to Anthropic format.
 * Extracts system prompts (Anthropic uses top-level system field).
 * Supports multiple system messages for prompt caching: the first system
 * message is treated as static/cacheable, subsequent ones as dynamic.
 */
export function toAnthropicMessages(messages: LLMMessage[]): {
  systemParts: string[];
  messages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const anthropicMessages: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content);
    } else if (msg.role === 'user') {
      // Handle user messages with optional images
      if (msg.images && msg.images.length > 0) {
        const content: AnthropicContentItem[] = [];
        // Add images first
        for (const img of msg.images) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mediaType,
              data: img.data,
            },
          });
        }
        // Then add text content
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        anthropicMessages.push({ role: 'user', content });
      } else {
        anthropicMessages.push({ role: 'user', content: msg.content });
      }
    } else if (msg.role === 'assistant') {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Assistant message with tool calls → content blocks array
        const content: AnthropicContentItem[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          let input: unknown = {};
          try {
            input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            console.warn(`[LLM Format] Malformed tool call arguments for ${tc.function.name}, using empty object`);
          }
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input,
          });
        }
        anthropicMessages.push({ role: 'assistant', content });
      } else {
        anthropicMessages.push({ role: 'assistant', content: msg.content });
      }
    } else if (msg.role === 'tool' && msg.tool_call_id) {
      // Tool results → user message with tool_result content block
      anthropicMessages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: msg.tool_call_id, content: msg.content }],
      });
    }
  }

  return { systemParts, messages: anthropicMessages };
}

/**
 * Convert canonical tool definitions to Anthropic format.
 * Adds cache_control to last tool for prompt caching.
 */
export function toAnthropicTools(tools: ToolDefinition[]): AnthropicToolDef[] {
  return tools.map((tool, index) => {
    const def: AnthropicToolDef = {
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters as Record<string, unknown>,
    };
    // Cache the entire tool set by marking the last tool
    if (index === tools.length - 1) {
      def.cache_control = { type: 'ephemeral' };
    }
    return def;
  });
}

export type AnthropicSystemBlockUncached = {
  type: 'text';
  text: string;
};

/**
 * Build Anthropic system blocks with prompt caching.
 * First block (static content) gets cache_control for prompt caching.
 * Subsequent blocks (dynamic content like date/time, context) are uncached.
 */
export function toAnthropicSystem(systemParts: string[]): (AnthropicSystemBlock | AnthropicSystemBlockUncached)[] {
  if (systemParts.length === 0) return [];

  return systemParts.map((text, index) => {
    if (index === 0) {
      // First block is static — cache it
      return { type: 'text' as const, text, cache_control: { type: 'ephemeral' as const } };
    }
    // Subsequent blocks are dynamic — no cache_control
    return { type: 'text' as const, text };
  });
}

/**
 * Convert canonical messages to OpenAI-compatible format.
 * Used by Groq, xAI, Gemini.
 */
export function toOpenAIMessages(messages: LLMMessage[]): Array<Record<string, unknown>> {
  return messages.map((msg) => {
    if (msg.tool_calls) {
      return {
        role: msg.role,
        content: msg.content || null,
        tool_calls: msg.tool_calls,
      };
    }
    if (msg.tool_call_id) {
      return {
        role: 'tool',
        content: msg.content,
        tool_call_id: msg.tool_call_id,
      };
    }
    // Handle user messages with images (OpenAI vision format)
    if (msg.role === 'user' && msg.images && msg.images.length > 0) {
      const content: Array<Record<string, unknown>> = [];
      // Add images first
      for (const img of msg.images) {
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${img.mediaType};base64,${img.data}`,
          },
        });
      }
      // Then add text
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      return { role: msg.role, content };
    }
    return { role: msg.role, content: msg.content };
  });
}

// === Response Parsing ===

/**
 * Parse Anthropic API response to canonical format.
 */
export function fromAnthropicResponse(data: AnthropicResponse): LLMResponse {
  let textContent = '';
  const toolCalls: ToolCall[] = [];

  for (const block of data.content ?? []) {
    if (block.type === 'text' && block.text) {
      textContent += block.text;
    } else if (block.type === 'tool_use' && block.id && block.name) {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  return {
    content: textContent,
    toolCalls,
    usage: data.usage ? {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
    } : undefined,
    model: data.model,
  };
}

/**
 * Parse OpenAI-compatible response to canonical format.
 */
export function fromOpenAIResponse(data: OpenAIResponse): LLMResponse {
  const choice = data.choices?.[0];

  if (!choice) {
    throw new Error('No response from LLM');
  }

  return {
    content: choice.message?.content ?? '',
    toolCalls: choice.message?.tool_calls ?? [],
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
    } : undefined,
    model: data.model,
  };
}
