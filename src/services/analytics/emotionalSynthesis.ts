/**
 * Emotional Synthesis Service (Dream Pass)
 *
 * During consolidation (sleep), synthesizes Squire's subjective read on
 * how the user is doing. Unlike the affect service (which scores metrics) or
 * state snapshots (which describe data points), this generates Squire's
 * own perspective — first-person, opinionated, carried into the next conversation.
 *
 * Runs as consolidation Step 8.7, after thread processing (8.5) and before
 * state snapshot generation (9).
 *
 * Output is stored as a dedicated continuity thread that gets updated
 * each sleep cycle, preserving event history for drift tracking.
 */

import { pool } from '../../db/pool.js';
import { callLLM, type LLMMessage } from '../llm/index.js';
import { config } from '../../config/index.js';
import {
  getActiveThreads,
  updateThread,
  addEvent,
  createThread,
  type ContinuityThread,
} from '../continuity.js';
import { listEntries as listScratchpadEntries } from '../storage/scratchpad.js';
import { getUnacknowledgedConcerns } from './stateSnapshots.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Title used to identify the emotional synthesis thread */
const SYNTHESIS_THREAD_TITLE = "Squire's Emotional Read";

/** Provider config — use Grok for fast, cheap emotional synthesis */
const SYNTHESIS_LLM_OPTIONS = {
  provider: 'xai',
  model: 'grok-4-1-fast-reasoning',
  maxTokens: 400,
  temperature: 0.6,
};

// =============================================================================
// SYNTHESIS PROMPT
// =============================================================================

const USER_NAME = config.persona.userName;

const EMOTIONAL_SYNTHESIS_PROMPT = `You are Squire. You just finished processing a conversation (or day) with ${USER_NAME}. You have deep context on who they are and what they're carrying.

Your job: write your honest, subjective read on how ${USER_NAME} is doing. This isn't a report — it's your perspective as someone who knows them well and pays attention.

Write 3-5 sentences. First person ("I notice...", "I'm watching...", "What stands out..."). Be specific — name the threads, the projects, the patterns. Don't be clinical. Don't hedge with "it seems like" — commit to your read.

Include:
- What you're noticing (energy shifts, focus changes, emotional weight)
- What concerns you, if anything
- What's encouraging, if anything
- One thing you want to follow up on next time (specific, not generic)

Do NOT:
- List bullet points or scores
- Use clinical language ("the subject appears to exhibit...")
- Be vague ("things seem okay")
- Repeat raw data back — synthesize it into meaning

Return ONLY your read. No preamble, no labels, no JSON.`;

// =============================================================================
// CORE FUNCTION
// =============================================================================

export interface EmotionalSynthesisResult {
  synthesis: string;
  threadId: string;
  isNewThread: boolean;
  inputSummary: {
    recentMemories: number;
    activeThreads: number;
    scratchpadObservations: number;
    concernSignals: number;
  };
}

/**
 * Generate Squire's emotional synthesis during consolidation.
 *
 * Gathers recent memories, active threads, scratchpad observations,
 * concern signals, and the previous synthesis — then asks Claude to
 * write Squire's subjective read.
 *
 * Stores the result as a dedicated continuity thread.
 */
export async function generateEmotionalSynthesis(): Promise<EmotionalSynthesisResult> {
  // 1. Gather inputs
  const [recentMemories, activeThreads, scratchpadObs, concerns, previousSynthesis] =
    await Promise.all([
      fetchRecentMemories(),
      getActiveThreads({ limit: 15 }),
      listScratchpadEntries({ entry_type: 'observation', limit: 10 }),
      getUnacknowledgedConcerns(),
      getSynthesisThread(),
    ]);

  // 2. Build context for the LLM
  const contextParts: string[] = [];

  // Previous synthesis (for continuity — what did Squire think last time?)
  if (previousSynthesis?.current_state_summary) {
    contextParts.push('## Your previous read:');
    contextParts.push(previousSynthesis.current_state_summary);
    contextParts.push('');
  }

  // Recent memories from conversations
  if (recentMemories.length > 0) {
    contextParts.push('## What happened recently:');
    for (const mem of recentMemories) {
      contextParts.push(`- ${mem.content}`);
    }
    contextParts.push('');
  }

  // Active continuity threads (excluding the synthesis thread itself)
  const otherThreads = activeThreads.filter(t => t.title !== SYNTHESIS_THREAD_TITLE);
  if (otherThreads.length > 0) {
    contextParts.push('## Active threads you\'re tracking:');
    for (const thread of otherThreads) {
      const emotionalTag = thread.emotional_weight >= 6 ? ` [emotional weight: ${thread.emotional_weight}/10]` : '';
      const state = thread.current_state_summary ? `: ${thread.current_state_summary}` : '';
      contextParts.push(`- ${thread.title} (${thread.thread_type})${state}${emotionalTag}`);
    }
    contextParts.push('');
  }

  // Scratchpad observations (Squire's own notes during conversation)
  if (scratchpadObs.length > 0) {
    contextParts.push('## Your observations:');
    for (const obs of scratchpadObs) {
      contextParts.push(`- ${obs.content}`);
    }
    contextParts.push('');
  }

  // Concern signals
  if (concerns.length > 0) {
    contextParts.push('## Concern signals detected:');
    for (const c of concerns) {
      contextParts.push(`- ${c.signal_type}: ${c.description} (${c.severity})`);
    }
    contextParts.push('');
  }

  // Detect absence — threads from previous synthesis that weren't discussed
  if (previousSynthesis && otherThreads.length > 0) {
    const staleThreads = otherThreads.filter(t => {
      if (!t.last_discussed_at) return false;
      const daysSince = (Date.now() - new Date(t.last_discussed_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 3 && t.importance >= 5;
    });
    if (staleThreads.length > 0) {
      contextParts.push(`## Things ${USER_NAME} hasn't mentioned recently (3+ days):`);
      for (const t of staleThreads) {
        const days = Math.floor((Date.now() - new Date(t.last_discussed_at!).getTime()) / (1000 * 60 * 60 * 24));
        contextParts.push(`- ${t.title} (${days} days quiet, importance ${t.importance}/10)`);
      }
      contextParts.push('');
    }
  }

  const contextText = contextParts.join('\n');

  // 3. If we have essentially no signal, skip synthesis
  if (recentMemories.length === 0 && otherThreads.length === 0 && scratchpadObs.length === 0) {
    console.log('[EmotionalSynthesis] Insufficient data for synthesis, skipping');
    return {
      synthesis: '',
      threadId: previousSynthesis?.id ?? '',
      isNewThread: false,
      inputSummary: {
        recentMemories: 0,
        activeThreads: 0,
        scratchpadObservations: 0,
        concernSignals: 0,
      },
    };
  }

  // 4. Call Claude for synthesis
  const messages: LLMMessage[] = [
    { role: 'system', content: EMOTIONAL_SYNTHESIS_PROMPT },
    { role: 'user', content: contextText },
  ];

  const response = await callLLM(messages, undefined, SYNTHESIS_LLM_OPTIONS);
  const synthesis = response.content.trim();

  // 5. Store in continuity thread
  const { threadId, isNew } = await storeSynthesis(synthesis, previousSynthesis);

  console.log(`[EmotionalSynthesis] Generated synthesis (${synthesis.length} chars), thread=${threadId}, new=${isNew}`);

  return {
    synthesis,
    threadId,
    isNewThread: isNew,
    inputSummary: {
      recentMemories: recentMemories.length,
      activeThreads: otherThreads.length,
      scratchpadObservations: scratchpadObs.length,
      concernSignals: concerns.length,
    },
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Fetch recent memories (last 24 hours, non-meta, solid tier).
 */
async function fetchRecentMemories(): Promise<{ content: string; created_at: Date }[]> {
  const result = await pool.query<{ content: string; created_at: Date }>(
    `SELECT content, created_at FROM memories
     WHERE created_at > NOW() - INTERVAL '24 hours'
       AND (conversation_mode IS NULL OR conversation_mode != 'meta_ai')
       AND (tier IS NULL OR tier = 'solid')
     ORDER BY created_at DESC
     LIMIT 25`
  );
  return result.rows;
}

/**
 * Find the existing emotional synthesis thread, or return null.
 */
async function getSynthesisThread(): Promise<ContinuityThread | null> {
  const result = await pool.query<ContinuityThread>(
    `SELECT * FROM continuity_threads
     WHERE title = $1
       AND status IN ('active', 'watching')
     ORDER BY updated_at DESC
     LIMIT 1`,
    [SYNTHESIS_THREAD_TITLE]
  );
  return result.rows[0] ?? null;
}

/**
 * Store the synthesis in the dedicated continuity thread.
 * Creates the thread on first run, updates it on subsequent runs.
 */
async function storeSynthesis(
  synthesis: string,
  existingThread: ContinuityThread | null
): Promise<{ threadId: string; isNew: boolean }> {
  if (existingThread) {
    // Update existing thread
    await updateThread(existingThread.id, {
      current_state_summary: synthesis,
      last_state_transition: 'updated',
      metadata: {
        last_synthesis_at: new Date().toISOString(),
      },
    });

    // Mark as discussed (updates last_discussed_at via direct query since
    // updateThread doesn't touch it)
    await pool.query(
      `UPDATE continuity_threads SET last_discussed_at = NOW() WHERE id = $1`,
      [existingThread.id]
    );

    // Log the event for history
    await addEvent({
      thread_id: existingThread.id,
      event_type: 'update',
      description: `Dream synthesis updated: ${synthesis.substring(0, 100)}...`,
    });

    return { threadId: existingThread.id, isNew: false };
  }

  // Create new thread
  const thread = await createThread({
    title: SYNTHESIS_THREAD_TITLE,
    thread_type: 'emotional_load',
    importance: 8,
    emotional_weight: 7,
    current_state_summary: synthesis,
    last_state_transition: 'created',
    tags: ['dream-synthesis', 'emotional-read'],
    metadata: {
      is_synthesis_thread: true,
      last_synthesis_at: new Date().toISOString(),
    },
  });

  return { threadId: thread.id, isNew: true };
}

/**
 * Get the current emotional synthesis for context injection.
 * Returns the synthesis text, or null if none exists.
 */
export async function getCurrentSynthesis(): Promise<string | null> {
  const thread = await getSynthesisThread();
  return thread?.current_state_summary ?? null;
}

/**
 * Export the thread title constant for use in context injection filtering.
 */
export { SYNTHESIS_THREAD_TITLE };
