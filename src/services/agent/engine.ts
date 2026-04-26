/**
 * Agent Engine - State Machine for Autonomous Agent Loop
 *
 * Manages the state of a multi-turn conversation where the agent
 * calls tools repeatedly until the task is complete.
 */

import { callLLM, type LLMMessage, type LLMResponse } from './llm.js';
import {
  getToolDefinitions,
  executeTools,
  type ToolDefinition,
} from '../../tools/index.js';
import { SQUIRE_SYSTEM_PROMPT_BASE, TOOL_CALLING_INSTRUCTIONS } from '../../constants/prompts.js';
import { classifyTask, type ModelTier, isRoutingEnabled } from '../routing/index.js';
import { buildMemoryContext } from '../memory/index.js';

// === Types ===

/**
 * Possible states of the agent engine
 */
export type AgentState =
  | 'idle'       // Waiting for input
  | 'gathering'  // Loading context
  | 'thinking'   // Waiting for LLM response
  | 'executing'  // Running tool calls
  | 'complete'   // Task finished
  | 'cancelled'  // User cancelled
  | 'error';     // Error occurred

/**
 * Result returned when the agent run completes
 */
export interface AgentResult {
  /** Whether the run completed successfully */
  success: boolean;
  /** Final content/response from the agent */
  content: string;
  /** Number of turns executed */
  turnCount: number;
  /** Final state of the agent */
  state: AgentState;
  /** Error message if state is 'error' */
  error?: string;
}

/**
 * Callbacks for monitoring agent execution
 */
export interface AgentCallbacks {
  /** Called when the agent state changes */
  onStateChange?: (state: AgentState, turnCount: number) => void;
  /** Called when a tool is invoked */
  onToolCall?: (toolName: string, args: unknown) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
}

/**
 * Options for initializing the AgentEngine
 */
export interface AgentEngineOptions {
  /** Unique identifier for this conversation */
  conversationId: string;
  /** Maximum number of turns before stopping (default: 50) */
  maxTurns?: number;
  /** Event callbacks */
  callbacks?: AgentCallbacks;
  /** Custom system prompt (defaults to SQUIRE_SYSTEM_PROMPT_BASE + TOOL_CALLING_INSTRUCTIONS) */
  systemPrompt?: string;
  /** Tools to make available (defaults to all registered tools) */
  tools?: ToolDefinition[];
  /** Force a specific model tier, bypassing task classification */
  tier?: ModelTier;
}

// === AgentEngine Class ===

/**
 * AgentEngine manages the autonomous agent loop state machine.
 *
 * The engine transitions through states as it processes user input,
 * gathers context, calls the LLM, and executes tools. It supports
 * cancellation and provides callbacks for monitoring execution.
 *
 * @example
 * ```typescript
 * const engine = new AgentEngine({
 *   conversationId: 'conv-123',
 *   maxTurns: 10,
 *   callbacks: {
 *     onStateChange: (state, turn) => console.log(`State: ${state}, Turn: ${turn}`),
 *     onToolCall: (name, args) => console.log(`Tool: ${name}`, args),
 *   },
 * });
 *
 * const result = await engine.run('Help me analyze this code');
 * console.log(result.content);
 * ```
 */
export class AgentEngine {
  private state: AgentState = 'idle';
  private turnCount: number = 0;
  private readonly maxTurns: number;
  private readonly conversationId: string;
  private readonly abortController: AbortController;
  private readonly callbacks: AgentCallbacks;
  private readonly systemPrompt: string;
  private readonly tools: ToolDefinition[];
  private messages: LLMMessage[] = [];
  private tier: ModelTier | undefined;

  /**
   * Create a new AgentEngine instance
   *
   * @param options - Configuration options for the engine
   */
  constructor(options: AgentEngineOptions) {
    this.conversationId = options.conversationId;
    this.maxTurns = options.maxTurns ?? 200;
    this.callbacks = options.callbacks ?? {};
    this.abortController = new AbortController();

    // Set system prompt with tool calling instructions if using default
    if (options.systemPrompt) {
      this.systemPrompt = options.systemPrompt;
    } else {
      this.systemPrompt = SQUIRE_SYSTEM_PROMPT_BASE + TOOL_CALLING_INSTRUCTIONS;
    }

    // Use provided tools or default to all registered tools
    this.tools = options.tools ?? getToolDefinitions();

    // Allow callers to force a model tier (bypasses task classification)
    this.tier = options.tier;
  }

  /**
   * Run the agent loop with the given input
   *
   * This is the main entry point for executing an agent task.
   * The agent will process the input, gather context, call the LLM,
   * and execute tools until the task is complete or cancelled.
   *
   * @param input - The user's input/request
   * @param context - Optional additional context to include
   * @returns Promise resolving to the agent result
   */
  async run(input: string, context?: string): Promise<AgentResult> {
    // Reset state for new run
    this.turnCount = 0;
    this.messages = [];
    this.setState('gathering');

    try {
      // Check for cancellation
      if (this.abortController.signal.aborted) {
        return this.createResult('cancelled', '');
      }

      // Retrieve relevant memory context
      const memoryContext = await buildMemoryContext(input);

      // System prompt split into two messages for Anthropic prompt caching:
      // Message 1 (static): personality + instructions — identical every call, gets cached
      // Message 2 (dynamic): memory context + additional context — changes per call, uncached
      this.messages.push({ role: 'system', content: this.systemPrompt });

      // Build dynamic context block (if any)
      const dynamicParts: string[] = [];
      if (memoryContext) dynamicParts.push(memoryContext);
      if (context) dynamicParts.push(context);

      if (dynamicParts.length > 0) {
        this.messages.push({ role: 'system', content: dynamicParts.join('\n\n---\n\n') });
      }
      this.messages.push({ role: 'user', content: input });

      // Classify task for routing (once per conversation, skip if tier was preset)
      if (!this.tier && isRoutingEnabled()) {
        this.tier = classifyTask(input);
        console.log(`[Routing] Task classified as "${this.tier}" tier`);
      } else if (this.tier) {
        console.log(`[Routing] Using preset tier: "${this.tier}"`);
      }

      // Track final response content
      let finalContent = '';

      // Main agent loop
      while (this.turnCount < this.maxTurns) {
        // Check for cancellation at start of each turn
        if (this.abortController.signal.aborted) {
          return this.createResult('cancelled', finalContent);
        }

        this.turnCount++;
        this.setState('thinking');

        // Call the LLM
        let response: LLMResponse;
        try {
          response = await callLLM(this.messages, this.tools, {
            signal: this.abortController.signal,
            tier: this.tier,
          });
        } catch (error) {
          // Check if this was an abort
          if (this.abortController.signal.aborted) {
            return this.createResult('cancelled', finalContent);
          }
          throw error;
        }

        // Update final content with latest response
        finalContent = response.content;

        // Check if there are tool calls
        if (response.toolCalls.length === 0) {
          // No tool calls - we're done
          this.setState('complete');
          return this.createResult('complete', finalContent);
        }

        // Have tool calls - execute them
        this.setState('executing');

        // Add assistant message with tool calls to conversation
        this.messages.push({
          role: 'assistant',
          content: response.content,
          tool_calls: response.toolCalls,
        });

        // Fire callback for each tool call before execution
        for (const toolCall of response.toolCalls) {
          this.callbacks.onToolCall?.(
            toolCall.function.name,
            this.safeParseArgs(toolCall.function.arguments)
          );
        }

        // Execute all tool calls
        const toolResults = await executeTools(response.toolCalls);

        // Add tool results to messages
        for (const result of toolResults) {
          this.messages.push({
            role: 'tool',
            content: result.result,
            tool_call_id: result.toolCallId,
          });
        }

        // Loop continues - will call LLM again with tool results
      }

      // Max turns reached
      this.setState('complete');
      return this.createResult(
        'complete',
        finalContent || `[AgentEngine] Max turns (${this.maxTurns}) reached without final response`
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.setState('error');
      this.callbacks.onError?.(err);
      return this.createResult('error', '', err.message);
    }
  }

  /**
   * Safely parse JSON arguments, returning empty object on failure
   */
  private safeParseArgs(argsString: string): unknown {
    try {
      return JSON.parse(argsString);
    } catch {
      return {};
    }
  }

  /**
   * Cancel the current agent run
   *
   * This will abort any in-progress operations and set the state to 'cancelled'.
   * Safe to call multiple times.
   */
  cancel(): void {
    this.abortController.abort();
    this.setState('cancelled');
  }

  /**
   * Get the current state of the agent
   *
   * @returns The current AgentState
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Get the current turn count
   *
   * @returns Number of turns executed so far
   */
  getTurnCount(): number {
    return this.turnCount;
  }

  /**
   * Get the conversation ID for this engine instance
   *
   * @returns The conversation ID
   */
  getConversationId(): string {
    return this.conversationId;
  }

  /**
   * Check if the abort signal has been triggered
   *
   * @returns True if cancelled, false otherwise
   */
  isAborted(): boolean {
    return this.abortController.signal.aborted;
  }

  // === Private Methods ===

  /**
   * Update the agent state and notify callbacks
   */
  private setState(newState: AgentState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.callbacks.onStateChange?.(this.state, this.turnCount);
    }
  }

  /**
   * Create a standardized AgentResult
   */
  private createResult(
    state: AgentState,
    content: string,
    error?: string
  ): AgentResult {
    return {
      success: state === 'complete',
      content,
      turnCount: this.turnCount,
      state,
      error,
    };
  }
}
