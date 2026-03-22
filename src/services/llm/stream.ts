/**
 * Streaming LLM Calls
 *
 * Single implementation for streaming from all supported LLM providers.
 * Extracted from socket/handlers.ts — previously inline with handler logic.
 *
 * Returns the complete LLMResponse when streaming finishes.
 * Calls onChunk callback for each text chunk during streaming.
 */

import { config } from '../../config/index.js';
import type {
  LLMMessage,
  LLMResponse,
  CallOptions,
  StreamCallbacks,
  ToolDefinition,
  ToolCall,
  ProviderConfig,
} from './types.js';
import {
  toAnthropicMessages,
  toAnthropicTools,
  toAnthropicSystem,
  toOpenAIMessages,
} from './format.js';
import { resolveProvider } from './call.js';

/**
 * Stream an LLM response from any supported provider.
 *
 * Streams text chunks via callbacks.onChunk and returns the
 * complete response (including any tool calls) when done.
 */
export async function streamLLM(
  messages: LLMMessage[],
  tools?: ToolDefinition[],
  callbacks?: StreamCallbacks,
  options?: CallOptions
): Promise<LLMResponse> {
  const pc = resolveProvider(options);

  if (!pc.apiKey) {
    throw new Error(`${pc.provider} API key not configured`);
  }

  if (pc.provider === 'anthropic') {
    return streamAnthropic(messages, tools, callbacks, pc, options);
  }

  return streamOpenAICompatible(messages, tools, callbacks, pc, options);
}

// === Anthropic Streaming ===

async function streamAnthropic(
  messages: LLMMessage[],
  tools: ToolDefinition[] | undefined,
  callbacks: StreamCallbacks | undefined,
  pc: ProviderConfig,
  options?: CallOptions
): Promise<LLMResponse> {
  const { systemParts, messages: anthropicMessages } = toAnthropicMessages(messages);

  const requestBody: Record<string, unknown> = {
    model: pc.model,
    messages: anthropicMessages,
    max_tokens: options?.maxTokens ?? config.llm.maxTokens,
    temperature: options?.temperature ?? config.llm.temperature,
    stream: true,
  };

  if (systemParts.length > 0) {
    requestBody.system = toAnthropicSystem(systemParts);
  }

  if (tools && tools.length > 0) {
    requestBody.tools = toAnthropicTools(tools);
  }

  const timeoutMs = config.llm.apiTimeoutMs;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  if (options?.signal) {
    options.signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
  }

  try {
    const response = await fetch(`${pc.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': pc.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify(requestBody),
      signal: timeoutController.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let currentToolCall: { id: string; name: string; input: string } | null = null;
    const toolCalls: ToolCall[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'message_start' && parsed.message?.usage) {
              inputTokens = parsed.message.usage.input_tokens ?? 0;
            } else if (parsed.type === 'content_block_start') {
              if (parsed.content_block?.type === 'tool_use') {
                currentToolCall = {
                  id: parsed.content_block.id,
                  name: parsed.content_block.name,
                  input: '',
                };
              }
            } else if (parsed.type === 'content_block_delta') {
              if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
                fullContent += parsed.delta.text;
                callbacks?.onChunk?.(parsed.delta.text);
              } else if (parsed.delta?.type === 'input_json_delta' && currentToolCall) {
                currentToolCall.input += parsed.delta.partial_json ?? '';
              }
            } else if (parsed.type === 'content_block_stop' && currentToolCall) {
              toolCalls.push({
                id: currentToolCall.id,
                type: 'function',
                function: {
                  name: currentToolCall.name,
                  arguments: currentToolCall.input,
                },
              });
              currentToolCall = null;
            } else if (parsed.type === 'message_delta' && parsed.usage) {
              outputTokens = parsed.usage.output_tokens ?? 0;
            }
          } catch {
            // Ignore parse errors for partial data
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Flush any incomplete tool call (stream disconnected mid-tool-call)
    if (currentToolCall) {
      console.warn(`[LLM Stream] Flushing incomplete Anthropic tool call: ${currentToolCall.name}`);
      toolCalls.push({
        id: currentToolCall.id,
        type: 'function',
        function: {
          name: currentToolCall.name,
          arguments: currentToolCall.input || '{}',
        },
      });
      currentToolCall = null;
    }

    return {
      content: fullContent,
      toolCalls,
      usage: { promptTokens: inputTokens, completionTokens: outputTokens },
      model: pc.model,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// === OpenAI-Compatible Streaming (Groq, xAI, Gemini) ===

/** Track streaming tool calls as they arrive in chunks */
interface StreamingToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

async function streamOpenAICompatible(
  messages: LLMMessage[],
  tools: ToolDefinition[] | undefined,
  callbacks: StreamCallbacks | undefined,
  pc: ProviderConfig,
  options?: CallOptions
): Promise<LLMResponse> {
  const openaiMessages = toOpenAIMessages(messages);

  const requestBody: Record<string, unknown> = {
    model: pc.model,
    messages: openaiMessages,
    max_tokens: options?.maxTokens ?? config.llm.maxTokens,
    temperature: options?.temperature ?? config.llm.temperature,
    stream: true,
  };

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = 'auto';
  }

  const timeoutMs = config.llm.apiTimeoutMs;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  if (options?.signal) {
    options.signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
  }

  try {
    const response = await fetch(`${pc.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pc.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: timeoutController.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${pc.provider} API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    const accumulatedToolCalls: Map<number, StreamingToolCall> = new Map();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          // Handle SSE error events
          if (line.startsWith('event: error')) continue;

          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);

          // Check for error responses (e.g., Llama tool_use_failed)
          try {
            const errorCheck = JSON.parse(data);
            if (errorCheck.error) {
              console.log(`[LLM] ${pc.provider} API error: ${errorCheck.error.message}`);

              // Handle Llama XML-style function call fallback
              if (errorCheck.error.code === 'tool_use_failed' && errorCheck.error.failed_generation) {
                const parsed = parseLlamaFunctionCall(errorCheck.error.failed_generation);
                if (parsed) {
                  console.log(`[LLM] Parsed Llama XML function call: ${parsed.name}`);
                  return {
                    content: fullContent,
                    toolCalls: [{
                      id: `call_${Date.now()}`,
                      type: 'function',
                      function: parsed,
                    }],
                    model: pc.model,
                  };
                }
              }

              throw new Error(`${pc.provider} API error: ${errorCheck.error.message}`);
            }
          } catch (e) {
            if (e instanceof Error && e.message.includes('API error')) throw e;
            // Not an error object, continue normal processing
          }

          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data) as {
              choices: Array<{
                delta: {
                  content?: string;
                  tool_calls?: Array<{
                    index: number;
                    id?: string;
                    type?: 'function';
                    function?: { name?: string; arguments?: string };
                  }>;
                };
                finish_reason?: string | null;
              }>;
            };

            const delta = parsed.choices[0]?.delta;

            // Handle text content
            if (delta?.content) {
              fullContent += delta.content;
              callbacks?.onChunk?.(delta.content);
            }

            // Handle streaming tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = accumulatedToolCalls.get(tc.index);
                if (existing) {
                  if (tc.function?.arguments) {
                    existing.function.arguments += tc.function.arguments;
                  }
                } else if (tc.id && tc.function?.name) {
                  accumulatedToolCalls.set(tc.index, {
                    id: tc.id,
                    type: 'function',
                    function: {
                      name: tc.function.name,
                      arguments: tc.function.arguments || '',
                    },
                  });
                }
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Convert accumulated tool calls to array, validating arguments
    const toolCalls: ToolCall[] = Array.from(accumulatedToolCalls.values()).map((tc) => {
      // Ensure arguments is valid JSON — if not, default to empty object
      const args = tc.function.arguments || '{}';
      try {
        JSON.parse(args);
      } catch {
        console.warn(`[LLM Stream] Malformed tool call arguments for ${tc.function.name}: ${args.substring(0, 100)}`);
        tc.function.arguments = '{}';
      }
      return tc;
    });

    return {
      content: fullContent,
      toolCalls,
      model: pc.model,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// === Llama XML Function Call Parser ===

/**
 * Parse Llama's XML-style function call format: <function=name{...}>
 * Used as fallback when Groq's tool_use fails with Llama models.
 */
function parseLlamaFunctionCall(failedGeneration: string): { name: string; arguments: string } | null {
  try {
    const match = failedGeneration.match(/<function=(\w+)(\{[\s\S]*)/);
    if (!match) return null;

    const toolName = match[1]!;
    let argsString = match[2] ?? '{}';

    // Remove trailing </function> or > if present
    argsString = argsString.replace(/<\/function>.*$/, '').replace(/>\s*$/, '');

    // Fix incomplete JSON by closing open braces/brackets
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escaped = false;

    for (const char of argsString) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (!inString) {
        if (char === '{') openBraces++;
        else if (char === '}') openBraces--;
        else if (char === '[') openBrackets++;
        else if (char === ']') openBrackets--;
      }
    }

    while (openBrackets > 0) { argsString += ']'; openBrackets--; }
    while (openBraces > 0) { argsString += '}'; openBraces--; }

    // Validate JSON
    JSON.parse(argsString);

    return { name: toolName, arguments: argsString };
  } catch {
    return null;
  }
}
