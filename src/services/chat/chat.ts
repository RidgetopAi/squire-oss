/**
 * Chat Service (P1-T4)
 *
 * Handles chat interactions with LLM integration.
 * Combines context retrieval with conversation management.
 * Includes tool calling support.
 */

import { complete, type LLMMessage, type LLMCompletionResult } from '../../providers/llm.js';
import type { ImageContent } from '../llm/types.js';
import { generateContext, type ContextPackage } from './context.js';
import { config } from '../../config/index.js';
import { getToolDefinitions, executeTools, hasTools } from '../../tools/index.js';
import { SQUIRE_SYSTEM_PROMPT_BASE, TOOL_CALLING_INSTRUCTIONS } from '../../constants/prompts.js';

// === TYPES ===

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: ImageContent[];
}

export interface ChatRequest {
  message: string;
  images?: ImageContent[];
  conversationHistory?: ChatMessage[];
  includeContext?: boolean;
  contextQuery?: string;
  contextProfile?: string;
  maxContextTokens?: number;
}

export interface ChatResponse {
  message: string;
  role: 'assistant';
  context?: {
    memoryCount: number;
    entityCount: number;
    summaryCount: number;
    tokenCount: number;
    disclosureId: string;
  };
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}

// === SYSTEM PROMPT ===

/**
 * Generate current date/time string for grounding the model
 * Returns something like: "Monday, December 29, 2025 at 8:14 AM EST"
 */
function getCurrentDateTimeString(): string {
  const now = new Date();

  // Format: "Monday, December 29, 2025 at 8:14 AM EST"
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: config.timezone, // Auto-detected from system
  };

  return now.toLocaleString('en-US', options);
}

// === HELPER FUNCTIONS ===

/**
 * Build the full message array for the LLM
 */
function buildMessages(
  userMessage: string,
  conversationHistory: ChatMessage[],
  contextMarkdown?: string,
  images?: ImageContent[]
): LLMMessage[] {
  const messages: LLMMessage[] = [];

  // Static system prompt (cacheable — identical across calls)
  let staticPrompt = SQUIRE_SYSTEM_PROMPT_BASE;
  if (hasTools()) {
    staticPrompt += TOOL_CALLING_INSTRUCTIONS;
  }
  messages.push({ role: 'system', content: staticPrompt });

  // Dynamic system prompt (changes per call — date/time + context)
  const dateTimeGrounding = `**Current date and time**: ${getCurrentDateTimeString()}`;
  let dynamicContent = dateTimeGrounding;
  if (contextMarkdown) {
    dynamicContent += `\n\n---\n\n${contextMarkdown}`;
  }
  messages.push({ role: 'system', content: dynamicContent });

  // Add conversation history (last N messages to fit context)
  const recentHistory = conversationHistory.slice(-10); // Keep last 10 exchanges
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content, images: msg.images });
  }

  // Add current user message with optional images
  messages.push({ role: 'user', content: userMessage, images });

  return messages;
}

// === MAIN FUNCTION ===

/**
 * Process a chat message and return the assistant's response
 */
export async function chat(request: ChatRequest): Promise<ChatResponse> {
  const {
    message,
    images,
    conversationHistory = [],
    includeContext = true,
    contextQuery,
    contextProfile,
    maxContextTokens,
  } = request;

  let contextPackage: ContextPackage | undefined;
  let contextMarkdown: string | undefined;

  // Fetch context if requested
  if (includeContext) {
    try {
      contextPackage = await generateContext({
        query: contextQuery ?? message,
        profile: contextProfile,
        maxTokens: maxContextTokens,
      });
      contextMarkdown = contextPackage.markdown;
    } catch (error) {
      console.error('Failed to generate context:', error);
      // Continue without context rather than failing
    }
  }

  // Build messages for LLM
  const messages = buildMessages(message, conversationHistory, contextMarkdown, images);

  // Get available tools
  const tools = hasTools() ? getToolDefinitions() : undefined;

  // Call LLM with tools
  let result: LLMCompletionResult = await complete(messages, { tools });

  // Tool calling loop - handle tool calls until we get a final response
  const maxToolIterations = 50; // Prevent infinite loops
  let iterations = 0;

  while (result.finishReason === 'tool_calls' && result.toolCalls?.length && iterations < maxToolIterations) {
    iterations++;
    console.log(`Tool call iteration ${iterations}: ${result.toolCalls.map((t) => t.function.name).join(', ')}`);

    // Execute all tool calls in parallel
    const toolResults = await executeTools(result.toolCalls);

    // Add assistant message with tool calls to conversation
    messages.push({
      role: 'assistant',
      content: result.content,
      tool_calls: result.toolCalls,
    });

    // Add tool results to conversation
    for (const tr of toolResults) {
      messages.push({
        role: 'tool',
        tool_call_id: tr.toolCallId,
        content: tr.result,
      });
      console.log(`Tool ${tr.name} result: ${tr.success ? 'success' : 'failed'}`);
    }

    // Re-prompt LLM with tool results
    result = await complete(messages, { tools });
  }

  if (iterations >= maxToolIterations) {
    console.warn(`Tool calling reached max iterations (${maxToolIterations})`);
  }

  // Build response
  const response: ChatResponse = {
    message: result.content,
    role: 'assistant',
    usage: result.usage,
    model: result.model,
    provider: result.provider,
  };

  // Add context metadata if available
  if (contextPackage) {
    response.context = {
      memoryCount: contextPackage.memories.length,
      entityCount: contextPackage.entities.length,
      summaryCount: contextPackage.summaries.length,
      tokenCount: contextPackage.token_count,
      disclosureId: contextPackage.disclosure_id,
    };
  }

  return response;
}

/**
 * Simple chat without context (for quick responses)
 */
export async function chatSimple(
  message: string,
  history: ChatMessage[] = []
): Promise<string> {
  const response = await chat({
    message,
    conversationHistory: history,
    includeContext: false,
  });
  return response.message;
}

