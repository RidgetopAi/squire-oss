/**
 * LLM Calling Functions for Agent Engine
 *
 * Thin wrapper around unified LLM service that adds routing support.
 * Returns raw responses without recursive tool execution — the
 * AgentEngine handles the loop.
 */

import {
  callLLM as unifiedCallLLM,
  type LLMMessage as UnifiedLLMMessage,
  type LLMResponse as UnifiedLLMResponse,
  type ToolDefinition,
} from '../llm/index.js';
import { routedCallLLM, isRoutingEnabled, type ModelTier } from '../routing/index.js';

// === Types (re-export for backward compatibility) ===

export type LLMMessage = UnifiedLLMMessage;
export type LLMResponse = UnifiedLLMResponse;

export interface LLMCallOptions {
  signal?: AbortSignal;
  tier?: ModelTier;
}

// === Main Entry Point ===

/**
 * Call the LLM and get a single response (non-streaming, non-recursive)
 *
 * When routing is enabled, calls are routed to appropriate model tier.
 * Otherwise, uses default provider from config.
 */
export async function callLLM(
  messages: LLMMessage[],
  tools?: ToolDefinition[],
  options?: LLMCallOptions
): Promise<LLMResponse> {
  if (isRoutingEnabled()) {
    return routedCallLLM(messages, tools, options?.tier, {
      signal: options?.signal,
    });
  }

  return unifiedCallLLM(messages, tools, {
    signal: options?.signal,
  });
}
