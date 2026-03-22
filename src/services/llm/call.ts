/**
 * Non-Streaming LLM Calls
 *
 * Single implementation for calling all supported LLM providers
 * without streaming. Used by AgentEngine, routing, and REST chat.
 */

import { config } from '../../config/index.js';
import type {
  LLMMessage,
  LLMResponse,
  CallOptions,
  ToolDefinition,
  ProviderConfig,
  AnthropicResponse,
  OpenAIResponse,
} from './types.js';
import {
  toAnthropicMessages,
  toAnthropicTools,
  toAnthropicSystem,
  toOpenAIMessages,
  fromAnthropicResponse,
  fromOpenAIResponse,
} from './format.js';

/**
 * Resolve provider configuration from options + config defaults.
 */
export function resolveProvider(options?: CallOptions): ProviderConfig {
  const provider = options?.provider ?? config.llm.provider;
  const model = options?.model ?? config.llm.model;

  switch (provider) {
    case 'anthropic':
      return { provider, model, apiKey: config.llm.anthropicApiKey, baseUrl: config.llm.anthropicUrl };
    case 'groq':
      return { provider, model, apiKey: config.llm.groqApiKey, baseUrl: config.llm.groqUrl };
    case 'xai':
      return { provider, model, apiKey: config.llm.xaiApiKey, baseUrl: config.llm.xaiUrl };
    case 'gemini':
      return { provider, model, apiKey: config.llm.geminiApiKey, baseUrl: config.llm.geminiUrl };
    case 'ollama':
      return { provider, model, apiKey: 'ollama', baseUrl: `${config.llm.ollamaUrl}/v1` };
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

/**
 * Make a non-streaming LLM call to any supported provider.
 */
export async function callLLM(
  messages: LLMMessage[],
  tools?: ToolDefinition[],
  options?: CallOptions
): Promise<LLMResponse> {
  const pc = resolveProvider(options);

  if (!pc.apiKey) {
    throw new Error(`${pc.provider} API key not configured`);
  }

  if (pc.provider === 'anthropic') {
    return callAnthropic(messages, tools, pc, options);
  }

  return callOpenAICompatible(messages, tools, pc, options);
}

// === Anthropic (non-streaming) ===

async function callAnthropic(
  messages: LLMMessage[],
  tools: ToolDefinition[] | undefined,
  pc: ProviderConfig,
  options?: CallOptions
): Promise<LLMResponse> {
  const { systemParts, messages: anthropicMessages } = toAnthropicMessages(messages);

  const requestBody: Record<string, unknown> = {
    model: pc.model,
    messages: anthropicMessages,
    max_tokens: options?.maxTokens ?? config.llm.maxTokens,
    temperature: options?.temperature ?? config.llm.temperature,
    stream: false,
  };

  if (systemParts.length > 0) {
    requestBody.system = toAnthropicSystem(systemParts);
  }

  if (tools && tools.length > 0) {
    requestBody.tools = toAnthropicTools(tools);
  }

  const response = await fetch(`${pc.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': pc.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify(requestBody),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as AnthropicResponse;
  return fromAnthropicResponse(data);
}

// === OpenAI-Compatible (Groq, xAI, Gemini) ===

async function callOpenAICompatible(
  messages: LLMMessage[],
  tools: ToolDefinition[] | undefined,
  pc: ProviderConfig,
  options?: CallOptions
): Promise<LLMResponse> {
  const openaiMessages = toOpenAIMessages(messages);

  const requestBody: Record<string, unknown> = {
    model: pc.model,
    messages: openaiMessages,
    max_tokens: options?.maxTokens ?? config.llm.maxTokens,
    temperature: options?.temperature ?? config.llm.temperature,
    stream: false,
  };

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
  }

  const response = await fetch(`${pc.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pc.apiKey}`,
    },
    body: JSON.stringify(requestBody),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${pc.provider} API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as OpenAIResponse;
  return fromOpenAIResponse(data);
}
