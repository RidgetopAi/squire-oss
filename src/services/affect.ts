/**
 * Affect Service (Memory Upgrade Phase 3)
 *
 * Infers emotional/motivational state from recent memories and active threads.
 * Lightweight LLM call to produce structured affect signals.
 */

import { pool } from '../db/pool.js';
import { completeText } from '../providers/llm.js';

// =============================================================================
// TYPES
// =============================================================================

export interface AffectSignals {
  stress: number | null;       // 1-10
  energy: number | null;       // 1-10
  motivation: number | null;   // 1-10
  emotional_tone: string;
  pressures: string[];
  energizers: string[];
}

// =============================================================================
// INFERENCE
// =============================================================================

const AFFECT_INFERENCE_PROMPT = `You are analyzing recent context about a person to infer their current emotional state.
Based on the memories and active threads below, estimate:

Return JSON only:
{
  "stress": 1-10 (1=calm, 10=overwhelmed) or null if insufficient data,
  "energy": 1-10 (1=depleted, 10=energized) or null if insufficient data,
  "motivation": 1-10 (1=unmotivated, 10=driven) or null if insufficient data,
  "emotional_tone": "a 2-4 word description like 'cautiously optimistic' or 'overwhelmed but determined'",
  "pressures": ["top 1-3 sources of stress/pressure"],
  "energizers": ["top 1-3 sources of energy/motivation"]
}

Guidelines:
- Only rate what you can reasonably infer. Use null for dimensions with no signal.
- Be specific in pressures/energizers — "permit application deadline" not just "work"
- emotional_tone should feel human, not clinical
- If there's very little emotional content, default to neutral (stress: 4, energy: 5, motivation: 5)`;

/**
 * Infer affect signals from recent memories and active threads.
 * Single LLM call, ~200 input tokens, ~150 output tokens.
 */
export async function inferAffectFromRecent(
  lookbackHours: number = 24
): Promise<AffectSignals> {
  const defaults: AffectSignals = {
    stress: null,
    energy: null,
    motivation: null,
    emotional_tone: 'neutral',
    pressures: [],
    energizers: [],
  };

  try {
    // Fetch recent memories (exclude meta_ai)
    const memoriesResult = await pool.query<{ content: string }>(
      `SELECT content FROM memories
       WHERE created_at > NOW() - INTERVAL '${Math.floor(lookbackHours)} hours'
         AND (conversation_mode IS NULL OR conversation_mode != 'meta_ai')
         AND (tier IS NULL OR tier = 'solid')
       ORDER BY created_at DESC
       LIMIT 20`
    );

    // Fetch active high-emotional-weight threads
    const threadsResult = await pool.query<{ title: string; current_state_summary: string | null; emotional_weight: number }>(
      `SELECT title, current_state_summary, emotional_weight
       FROM continuity_threads
       WHERE status = 'active'
         AND emotional_weight >= 5
       ORDER BY emotional_weight DESC
       LIMIT 5`
    );

    if (memoriesResult.rows.length === 0 && threadsResult.rows.length === 0) {
      return defaults;
    }

    // Build context for LLM
    const contextParts: string[] = [];

    if (memoriesResult.rows.length > 0) {
      contextParts.push('Recent memories:');
      for (const mem of memoriesResult.rows) {
        contextParts.push(`- ${mem.content}`);
      }
    }

    if (threadsResult.rows.length > 0) {
      contextParts.push('\nActive emotional threads:');
      for (const thread of threadsResult.rows) {
        contextParts.push(`- ${thread.title} (weight: ${thread.emotional_weight}/10): ${thread.current_state_summary ?? 'active'}`);
      }
    }

    const response = await completeText(
      contextParts.join('\n'),
      AFFECT_INFERENCE_PROMPT,
      { temperature: 0.3, maxTokens: 200 }
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return defaults;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    return {
      stress: typeof parsed.stress === 'number' ? Math.min(10, Math.max(1, parsed.stress)) : null,
      energy: typeof parsed.energy === 'number' ? Math.min(10, Math.max(1, parsed.energy)) : null,
      motivation: typeof parsed.motivation === 'number' ? Math.min(10, Math.max(1, parsed.motivation)) : null,
      emotional_tone: typeof parsed.emotional_tone === 'string' ? parsed.emotional_tone : 'neutral',
      pressures: Array.isArray(parsed.pressures) ? parsed.pressures.map(String) : [],
      energizers: Array.isArray(parsed.energizers) ? parsed.energizers.map(String) : [],
    };
  } catch (error) {
    console.error('[Affect] Inference failed:', error);
    return defaults;
  }
}
