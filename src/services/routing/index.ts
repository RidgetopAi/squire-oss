/**
 * Model Routing Module
 *
 * Provides multi-model routing for cost-efficient LLM usage.
 * Routes tasks to appropriate model tier based on complexity.
 */

// Models and configuration
export {
  type ModelTier,
  type TierConfig,
  getTierConfig,
  getDefaultTier,
  isRoutingEnabled,
} from './models.js';

// Task classification
export {
  classifyTask,
  classifyWithReasoning,
} from './classifier.js';

// Router
export {
  routedCallLLM,
  type LLMMessage,
  type LLMResponse,
  type LLMCallOptions,
} from './router.js';
