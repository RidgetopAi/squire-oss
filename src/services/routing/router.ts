/**
 * Model Router for Multi-Tier LLM Calls
 *
 * Routes LLM calls to appropriate provider based on model tier.
 * Thin wrapper around unified LLM service with tier resolution.
 */

import { callLLM, type LLMMessage, type LLMResponse } from '../llm/index.js';
import type { ToolDefinition } from '../../tools/types.js';
import { getTierConfig, isRoutingEnabled, getDefaultTier, type ModelTier } from './models.js';

// Re-export types for backward compatibility
export type { LLMMessage, LLMResponse } from '../llm/index.js';

export interface LLMCallOptions {
  signal?: AbortSignal;
}

/**
 * Make an LLM call routed to the appropriate tier.
 * Resolves tier → provider/model, then delegates to unified callLLM.
 */
export async function routedCallLLM(
  messages: LLMMessage[],
  tools?: ToolDefinition[],
  tier?: ModelTier,
  options?: LLMCallOptions
): Promise<LLMResponse> {
  const selectedTier = tier ?? getDefaultTier();
  const tierConfig = getTierConfig(selectedTier);

  if (isRoutingEnabled()) {
    console.log(`[Routing] Using ${selectedTier} tier: ${tierConfig.provider}/${tierConfig.model}`);
  }

  return callLLM(messages, tools, {
    provider: tierConfig.provider,
    model: tierConfig.model,
    signal: options?.signal,
  });
}
