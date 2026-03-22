/**
 * Agent Module
 *
 * Exports the AgentEngine and related types for managing
 * autonomous agent loops in Squire.
 */

export {
  AgentEngine,
  type AgentState,
  type AgentResult,
  type AgentCallbacks,
  type AgentEngineOptions,
} from './engine.js';

export {
  callLLM,
  type LLMMessage,
  type LLMResponse,
  type LLMCallOptions,
} from './llm.js';
