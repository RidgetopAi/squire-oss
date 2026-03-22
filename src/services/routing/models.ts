/**
 * Model Tier Definitions for Routing
 *
 * Defines the available model tiers and their configurations.
 */

import { config } from '../../config/index.js';

// === Types ===

/**
 * Available model tiers
 * - smart: High capability model for complex tasks (Sonnet)
 * - fast: Quick/cheap model for search and retrieval (Grok)
 */
export type ModelTier = 'smart' | 'fast';

/**
 * Configuration for a model tier
 */
export interface TierConfig {
  provider: 'anthropic' | 'xai' | 'groq' | 'gemini' | 'ollama';
  model: string;
}

// === Tier Configurations ===

/**
 * Get configuration for a specific tier
 */
export function getTierConfig(tier: ModelTier): TierConfig {
  if (tier === 'fast') {
    return {
      provider: config.routing.fast.provider,
      model: config.routing.fast.model,
    };
  }

  // Default to smart tier
  return {
    provider: config.routing.smart.provider,
    model: config.routing.smart.model,
  };
}

/**
 * Get the default tier from config
 */
export function getDefaultTier(): ModelTier {
  return config.routing.defaultTier;
}

/**
 * Check if routing is enabled
 */
export function isRoutingEnabled(): boolean {
  return config.routing.enabled;
}
