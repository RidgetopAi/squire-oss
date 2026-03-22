/**
 * Unified LLM Service
 *
 * Single module for all LLM interactions across Squire.
 * Supports both streaming and non-streaming calls to all providers.
 *
 * Previously, LLM calling logic was duplicated in 4 places:
 * - providers/llm.ts (class-based providers)
 * - services/agent/llm.ts (agent engine)
 * - services/routing/router.ts (model routing)
 * - api/socket/handlers.ts (inline streaming)
 *
 * Now they all import from here.
 */

// Public API
export { callLLM, resolveProvider } from './call.js';
export { streamLLM } from './stream.js';

// Types
export type {
  LLMMessage,
  LLMResponse,
  CallOptions,
  StreamCallbacks,
  ToolDefinition,
  ToolCall,
  ImageContent,
} from './types.js';

// Format utilities (for consumers that need custom formatting)
export {
  toAnthropicMessages,
  toAnthropicTools,
  toAnthropicSystem,
  toOpenAIMessages,
  fromAnthropicResponse,
  fromOpenAIResponse,
} from './format.js';
