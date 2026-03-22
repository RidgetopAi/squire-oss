import { pool } from '../db/pool.js';
import { Memory } from './memories.js';
import {
  Session,
  SessionStats,
  getPendingConsolidationSessions,
  updateConsolidationStatus,
} from './sessions.js';
import {
  processMemoryForPatterns,
  markStalePatternsDormant,
} from './patterns.js';
import {
  processInsightsForConsolidation,
} from './insights.js';
import {
  processResearchForConsolidation,
} from './research.js';
import { extractMemoriesFromChat } from './chatExtraction.js';
import { updateAllSummaries } from './summaries.js';
import { evaluateUnevaluatedMemories } from './expressionEvaluator.js';
import { processThreadsForConsolidation } from './continuity.js';
import { processStateSnapshot } from './stateSnapshots.js';
import { processTrendsForConsolidation } from './trends.js';

/**
 * Consolidation Configuration
 *
 * These parameters control how memories decay and strengthen over time.
 * The goal is to make memory feel alive - important things persist,
 * trivial things fade, and connections form organically.
 */
export const CONSOLIDATION_CONFIG = {
  // Decay settings
  decay: {
    /** Base decay rate per consolidation cycle (0-1) */
    baseRate: 0.05,
    /** Minimum strength before memory is "dormant" (still searchable) */
    minStrength: 0.1,
    /** Days since last access that triggers accelerated decay */
    accessDecayDays: 7,
    /** Multiplier for decay when memory hasn't been accessed */
    unaccessed_multiplier: 1.5,
  },

  // Strengthening settings
  strengthen: {
    /** Base strengthening per access */
    baseGain: 0.1,
    /** Maximum strength (capped at 1.0) */
    maxStrength: 1.0,
    /** Access count threshold for "frequently accessed" */
    frequentAccessThreshold: 3,
    /** Salience threshold for "high salience" (0-10) */
    highSalienceThreshold: 6.0,
  },

  // SIMILAR edge settings
  edges: {
    /** Minimum embedding similarity for SIMILAR edge (0-1) */
    similarityThreshold: 0.75,
    /** Maximum SIMILAR edges per memory */
    maxEdgesPerMemory: 10,
    /** Edge decay rate per consolidation */
    edgeDecayRate: 0.1,
    /** Minimum edge weight before pruning */
    minEdgeWeight: 0.2,
  },
};

export interface ConsolidationResult {
  sessionId?: string;
  // Chat extraction (Step 0)
  chatConversationsProcessed: number;
  chatMessagesProcessed: number;
  chatMemoriesCreated: number;
  chatBeliefsCreated: number;
  // Memory processing
  memoriesProcessed: number;
  memoriesDecayed: number;
  memoriesStrengthened: number;
  edgesCreated: number;
  edgesReinforced: number;
  edgesPruned: number;
  patternsCreated: number;
  patternsReinforced: number;
  patternsDormant: number;
  insightsCreated: number;
  insightsValidated: number;
  insightsStale: number;
  gapsCreated: number;
  gapsSurfaced: number;
  questionsCreated: number;
  questionsExpired: number;
  summariesUpdated: number;
  summaryMemoriesProcessed: number;
  // Expression evaluation (Step 0b)
  expressionEvaluated: number;
  expressionPassed: number;
  expressionBlocked: number;
  // Continuity threads (Step 8.5)
  threadsDormant: number;
  followupsGenerated: number;
  // State snapshot (Step 9)
  snapshotCreated: boolean;
  concernsDetected: number;
  // Trends (Step 10)
  trendsGenerated: string[];
  durationMs: number;
}

/**
 * Time-bound extraction types that should decay faster after their date passes.
 * Events, tasks, and reminders are inherently temporal — "meeting next Thursday"
 * shouldn't persist at full strength weeks after Thursday.
 */
const TIME_BOUND_TYPES = new Set(['event', 'task', 'reminder']);

/**
 * Calculate decay amount for a memory
 *
 * Decay formula:
 * - Higher salience = less decay (salience protects)
 * - More recent access = less decay (access protects)
 * - Higher access count = less decay (frequent use protects)
 * - Time-bound memories (events/tasks/reminders) decay 3x faster after 5 days
 */
function calculateDecay(memory: Memory): number {
  const { baseRate, accessDecayDays, unaccessed_multiplier, minStrength } = CONSOLIDATION_CONFIG.decay;
  const { highSalienceThreshold } = CONSOLIDATION_CONFIG.strengthen;

  // Salience protection (0-1): higher salience = more protection
  const salienceFactor = memory.salience_score / 10.0;
  const salienceProtection = salienceFactor * 0.5; // Up to 50% reduction

  // Access protection: recent access protects
  let accessProtection = 0;
  if (memory.last_accessed_at) {
    const daysSinceAccess = (Date.now() - new Date(memory.last_accessed_at).getTime()) / (1000 * 60 * 60 * 24);
    accessProtection = daysSinceAccess < accessDecayDays ? 0.3 : 0;
  }

  // Frequency protection: high access count protects
  const frequencyProtection = Math.min(memory.access_count / 10, 0.2);

  // Total protection (0-1)
  const totalProtection = Math.min(salienceProtection + accessProtection + frequencyProtection, 0.9);

  // Calculate final decay rate
  let decayRate = baseRate * (1 - totalProtection);

  // Accelerate decay for unaccessed, low-salience memories
  if (!memory.last_accessed_at && memory.salience_score < highSalienceThreshold) {
    decayRate *= unaccessed_multiplier;
  }

  // Accelerated decay for time-bound memories (events, tasks, reminders)
  // After 5 days, these decay 3x faster — they're temporal, not timeless facts.
  // After 14 days, 5x faster — stale appointments shouldn't persist.
  const extractionType = (memory.source_metadata as Record<string, unknown>)?.extraction_type as string | undefined;
  if (extractionType && TIME_BOUND_TYPES.has(extractionType)) {
    const daysSinceCreated = (Date.now() - new Date(memory.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreated > 14) {
      decayRate *= 5.0;
    } else if (daysSinceCreated > 5) {
      decayRate *= 3.0;
    }
  }

  // Don't decay below minimum
  const maxDecay = memory.current_strength - minStrength;
  return Math.min(decayRate, Math.max(0, maxDecay));
}

/**
 * Calculate strengthening for a memory
 *
 * Strengthening happens when:
 * - Memory was accessed recently
 * - Memory has high salience
 * - Memory is frequently accessed
 */
function calculateStrengthen(memory: Memory): number {
  const { baseGain, maxStrength, frequentAccessThreshold, highSalienceThreshold } = CONSOLIDATION_CONFIG.strengthen;
  const { accessDecayDays } = CONSOLIDATION_CONFIG.decay;

  let strengthGain = 0;

  // Recent access bonus
  if (memory.last_accessed_at) {
    const daysSinceAccess = (Date.now() - new Date(memory.last_accessed_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceAccess < accessDecayDays) {
      strengthGain += baseGain * 0.5;
    }
  }

  // High salience bonus
  if (memory.salience_score >= highSalienceThreshold) {
    strengthGain += baseGain * 0.3;
  }

  // Frequent access bonus
  if (memory.access_count >= frequentAccessThreshold) {
    strengthGain += baseGain * 0.2;
  }

  // Don't exceed maximum strength
  const maxGain = maxStrength - memory.current_strength;
  return Math.min(strengthGain, Math.max(0, maxGain));
}

/**
 * Apply decay and strengthening to all memories
 *
 * This is idempotent - running it multiple times on the same data
 * will continue to apply small decay, but won't cause issues.
 */
async function processMemoryStrength(): Promise<{ decayed: number; strengthened: number }> {
  const { minStrength } = CONSOLIDATION_CONFIG.decay;

  // Get all memories with their current state
  // Include source_metadata + created_at for time-bound decay calculation
  const result = await pool.query(
    `SELECT id, salience_score, last_accessed_at, access_count, current_strength,
            source_metadata, created_at
     FROM memories
     WHERE current_strength > $1`,
    [minStrength]
  );

  const memories = result.rows as Memory[];
  let decayed = 0;
  let strengthened = 0;

  for (const memory of memories) {
    const decay = calculateDecay(memory);
    const strengthen = calculateStrengthen(memory);
    const netChange = strengthen - decay;

    if (Math.abs(netChange) > 0.001) {
      const newStrength = Math.max(minStrength, Math.min(1.0, memory.current_strength + netChange));

      await pool.query(
        `UPDATE memories SET current_strength = $2 WHERE id = $1`,
        [memory.id, newStrength]
      );

      if (netChange < 0) {
        decayed++;
      } else {
        strengthened++;
      }
    }
  }

  return { decayed, strengthened };
}

/**
 * Find and create SIMILAR edges between memories
 *
 * For each memory, find the most similar other memories
 * and create SIMILAR edges if similarity exceeds threshold.
 */
async function processSimilarEdges(): Promise<{ created: number; reinforced: number }> {
  const { similarityThreshold, maxEdgesPerMemory } = CONSOLIDATION_CONFIG.edges;

  let created = 0;
  let reinforced = 0;

  // Get memories with embeddings that don't have maximum edges yet
  const memoriesResult = await pool.query(
    `SELECT m.id, m.embedding
     FROM memories m
     WHERE m.embedding IS NOT NULL
       AND (
         SELECT COUNT(*) FROM memory_edges e
         WHERE e.source_memory_id = m.id AND e.edge_type = 'SIMILAR'
       ) < $1`,
    [maxEdgesPerMemory]
  );

  for (const memory of memoriesResult.rows) {
    // Find similar memories
    const similarResult = await pool.query(
      `SELECT
         m2.id as target_id,
         1 - (m2.embedding <=> $1::vector) as similarity
       FROM memories m2
       WHERE m2.id != $2
         AND m2.embedding IS NOT NULL
         AND 1 - (m2.embedding <=> $1::vector) >= $3
       ORDER BY similarity DESC
       LIMIT $4`,
      [memory.embedding, memory.id, similarityThreshold, maxEdgesPerMemory]
    );

    for (const similar of similarResult.rows) {
      // Try to insert or update the edge
      const edgeResult = await pool.query(
        `INSERT INTO memory_edges (source_memory_id, target_memory_id, edge_type, similarity, weight)
         VALUES ($1, $2, 'SIMILAR', $3, 1.0)
         ON CONFLICT (source_memory_id, target_memory_id, edge_type)
         DO UPDATE SET
           last_reinforced_at = NOW(),
           reinforcement_count = memory_edges.reinforcement_count + 1,
           weight = LEAST(1.0, memory_edges.weight + 0.1)
         RETURNING (xmax = 0) as is_new`,
        [memory.id, similar.target_id, similar.similarity]
      );

      if (edgeResult.rows[0]?.is_new) {
        created++;
      } else {
        reinforced++;
      }
    }
  }

  return { created, reinforced };
}

/**
 * Decay edges that haven't been reinforced
 * and prune edges below minimum weight
 */
async function processEdgeDecay(): Promise<{ pruned: number }> {
  const { edgeDecayRate, minEdgeWeight } = CONSOLIDATION_CONFIG.edges;

  // Decay edges that weren't reinforced in this consolidation cycle
  await pool.query(
    `UPDATE memory_edges
     SET weight = GREATEST($2, weight - $1)
     WHERE last_reinforced_at < NOW() - INTERVAL '1 hour'`,
    [edgeDecayRate, minEdgeWeight]
  );

  // Prune edges below minimum weight
  const pruneResult = await pool.query(
    `DELETE FROM memory_edges
     WHERE weight <= $1
     RETURNING id`,
    [minEdgeWeight]
  );

  return { pruned: pruneResult.rowCount ?? 0 };
}

/**
 * Process memories for pattern detection
 *
 * Finds memories that haven't been analyzed for patterns yet
 * and runs pattern extraction on them.
 */
async function processPatterns(limit: number = 10): Promise<{
  created: number;
  reinforced: number;
}> {
  let created = 0;
  let reinforced = 0;

  // Find memories without pattern evidence (not yet analyzed)
  const result = await pool.query<{ id: string; content: string; created_at: Date }>(
    `SELECT m.id, m.content, m.created_at
     FROM memories m
     WHERE NOT EXISTS (
       SELECT 1 FROM pattern_evidence pe WHERE pe.memory_id = m.id
     )
     ORDER BY m.created_at DESC
     LIMIT $1`,
    [limit]
  );

  for (const memory of result.rows) {
    try {
      const patternResult = await processMemoryForPatterns(
        memory.id,
        memory.content,
        memory.created_at
      );
      created += patternResult.created.length;
      reinforced += patternResult.reinforced.length;
    } catch (error) {
      console.error(`Pattern extraction failed for memory ${memory.id}:`, error);
    }
  }

  return { created, reinforced };
}

/**
 * Run consolidation for a specific session
 */
async function consolidateSession(session: Session): Promise<ConsolidationResult> {
  const startTime = Date.now();

  // Mark session as in progress
  await updateConsolidationStatus(session.id, 'in_progress');

  try {
    // 0. Extract memories from chat conversations
    const chatResult = await extractMemoriesFromChat();

    // 0b. Evaluate expression safety for new/unevaluated memories
    const expressionResult = await evaluateUnevaluatedMemories();

    // 1. Process memory strength (decay and strengthen)
    const strengthResult = await processMemoryStrength();

    // 2. Process SIMILAR edges
    const edgeResult = await processSimilarEdges();

    // 3. Process edge decay
    const decayResult = await processEdgeDecay();

    // 4. Process patterns (detect new patterns from unanalyzed memories)
    const patternResult = await processPatterns(10);

    // 5. Mark stale patterns as dormant
    const dormantCount = await markStalePatternsDormant(30);

    // 6. Process insights (cross-analyze beliefs, patterns, memories)
    const insightResult = await processInsightsForConsolidation();

    // 7. Process active research (detect gaps, generate questions)
    const researchResult = await processResearchForConsolidation();

    // 8. Update living summaries (generate summaries from pending memories)
    const summaryResult = await updateAllSummaries();

    // 8.5. Process continuity threads
    const continuityResult = await processThreadsForConsolidation();

    // 9. Generate state snapshot
    const snapshotResult = await processStateSnapshot();

    // 10. Process trends
    const trendsResult = await processTrendsForConsolidation();

    // Count total memories processed
    const countResult = await pool.query(`SELECT COUNT(*) as count FROM memories`);
    const memoriesProcessed = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const stats: SessionStats = {
      memories_decayed: strengthResult.decayed,
      memories_strengthened: strengthResult.strengthened,
      edges_created: edgeResult.created,
      edges_reinforced: edgeResult.reinforced,
      edges_pruned: decayResult.pruned,
    };

    // Mark session as completed
    await updateConsolidationStatus(session.id, 'completed', stats);

    return {
      sessionId: session.id,
      // Chat extraction results
      chatConversationsProcessed: chatResult.conversationsProcessed,
      chatMessagesProcessed: chatResult.messagesProcessed,
      chatMemoriesCreated: chatResult.memoriesCreated,
      chatBeliefsCreated: chatResult.beliefsCreated,
      // Memory processing results
      memoriesProcessed,
      memoriesDecayed: strengthResult.decayed,
      memoriesStrengthened: strengthResult.strengthened,
      edgesCreated: edgeResult.created,
      edgesReinforced: edgeResult.reinforced,
      edgesPruned: decayResult.pruned,
      patternsCreated: patternResult.created,
      patternsReinforced: patternResult.reinforced,
      patternsDormant: dormantCount,
      insightsCreated: insightResult.created.length,
      insightsValidated: insightResult.validated.length,
      insightsStale: insightResult.staleMarked,
      gapsCreated: researchResult.gapsCreated.length,
      gapsSurfaced: researchResult.gapsSurfaced.length,
      questionsCreated: researchResult.questionsCreated.length,
      questionsExpired: researchResult.questionsExpired,
      summariesUpdated: summaryResult.updated.length,
      summaryMemoriesProcessed: summaryResult.memoriesProcessed,
      expressionEvaluated: expressionResult.evaluated,
      expressionPassed: expressionResult.passed,
      expressionBlocked: expressionResult.blocked,
      threadsDormant: continuityResult.threadsDormant,
      followupsGenerated: continuityResult.followupsGenerated,
      snapshotCreated: snapshotResult.snapshotCreated,
      concernsDetected: snapshotResult.concernsDetected,
      trendsGenerated: trendsResult.trendsGenerated,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    await updateConsolidationStatus(session.id, 'failed');
    throw error;
  }
}

/**
 * Run consolidation without a session context
 * Creates a system session for tracking
 */
export async function consolidateAll(): Promise<ConsolidationResult> {
  const startTime = Date.now();

  // 0. Extract memories from chat conversations (NEW)
  console.log('[Consolidation] Step 0: Extracting memories from chat...');
  const chatResult = await extractMemoriesFromChat();

  // 0b. Evaluate expression safety for new/unevaluated memories (local Ollama model)
  console.log('[Consolidation] Step 0b: Evaluating expression safety...');
  const expressionResult = await evaluateUnevaluatedMemories();

  // 1. Process memory strength (decay and strengthen)
  console.log('[Consolidation] Step 1: Processing memory strength...');
  const strengthResult = await processMemoryStrength();

  // 2. Process SIMILAR edges
  console.log('[Consolidation] Step 2: Processing SIMILAR edges...');
  const edgeResult = await processSimilarEdges();

  // 3. Process edge decay
  console.log('[Consolidation] Step 3: Processing edge decay...');
  const decayResult = await processEdgeDecay();

  // 4. Process patterns (detect new patterns from unanalyzed memories)
  console.log('[Consolidation] Step 4: Processing patterns...');
  const patternResult = await processPatterns(10);

  // 5. Mark stale patterns as dormant
  console.log('[Consolidation] Step 5: Marking stale patterns dormant...');
  const dormantCount = await markStalePatternsDormant(30);

  // 6. Process insights (cross-analyze beliefs, patterns, memories)
  console.log('[Consolidation] Step 6: Processing insights...');
  const insightResult = await processInsightsForConsolidation();

  // 7. Process active research (detect gaps, generate questions)
  console.log('[Consolidation] Step 7: Processing research...');
  const researchResult = await processResearchForConsolidation();

  // 8. Update living summaries (generate summaries from pending memories)
  console.log('[Consolidation] Step 8: Updating living summaries...');
  const summaryResult = await updateAllSummaries();

  // 8.5. Process continuity threads (dormancy + follow-up generation)
  console.log('[Consolidation] Step 8.5: Processing continuity threads...');
  const continuityResult = await processThreadsForConsolidation();

  // 9. Generate state snapshot (affect inference + narrative)
  console.log('[Consolidation] Step 9: Generating state snapshot...');
  const snapshotResult = await processStateSnapshot();

  // 10. Generate trend summaries (weekly/monthly/quarterly as appropriate)
  console.log('[Consolidation] Step 10: Processing trends...');
  const trendsResult = await processTrendsForConsolidation();

  // Count total memories processed
  const countResult = await pool.query(`SELECT COUNT(*) as count FROM memories`);
  const memoriesProcessed = parseInt(countResult.rows[0]?.count ?? '0', 10);

  console.log(`[Consolidation] Complete in ${Date.now() - startTime}ms`);

  return {
    // Chat extraction results
    chatConversationsProcessed: chatResult.conversationsProcessed,
    chatMessagesProcessed: chatResult.messagesProcessed,
    chatMemoriesCreated: chatResult.memoriesCreated,
    chatBeliefsCreated: chatResult.beliefsCreated,
    // Memory processing results
    memoriesProcessed,
    memoriesDecayed: strengthResult.decayed,
    memoriesStrengthened: strengthResult.strengthened,
    edgesCreated: edgeResult.created,
    edgesReinforced: edgeResult.reinforced,
    edgesPruned: decayResult.pruned,
    patternsCreated: patternResult.created,
    patternsReinforced: patternResult.reinforced,
    patternsDormant: dormantCount,
    insightsCreated: insightResult.created.length,
    insightsValidated: insightResult.validated.length,
    insightsStale: insightResult.staleMarked,
    gapsCreated: researchResult.gapsCreated.length,
    gapsSurfaced: researchResult.gapsSurfaced.length,
    questionsCreated: researchResult.questionsCreated.length,
    questionsExpired: researchResult.questionsExpired,
    summariesUpdated: summaryResult.updated.length,
    summaryMemoriesProcessed: summaryResult.memoriesProcessed,
    expressionEvaluated: expressionResult.evaluated,
    expressionPassed: expressionResult.passed,
    expressionBlocked: expressionResult.blocked,
    threadsDormant: continuityResult.threadsDormant,
    followupsGenerated: continuityResult.followupsGenerated,
    snapshotCreated: snapshotResult.snapshotCreated,
    concernsDetected: snapshotResult.concernsDetected,
    trendsGenerated: trendsResult.trendsGenerated,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Run consolidation for all pending sessions
 */
export async function consolidatePendingSessions(): Promise<ConsolidationResult[]> {
  const pendingSessions = await getPendingConsolidationSessions();
  const results: ConsolidationResult[] = [];

  for (const session of pendingSessions) {
    const result = await consolidateSession(session);
    results.push(result);
  }

  return results;
}

/**
 * Get consolidation statistics
 */
export async function getConsolidationStats(): Promise<{
  totalEdges: number;
  averageWeight: number;
  dormantMemories: number;
  activeMemories: number;
}> {
  const { minStrength } = CONSOLIDATION_CONFIG.decay;

  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM memory_edges WHERE edge_type = 'SIMILAR') as total_edges,
      (SELECT AVG(weight) FROM memory_edges WHERE edge_type = 'SIMILAR') as avg_weight,
      (SELECT COUNT(*) FROM memories WHERE current_strength <= $1) as dormant,
      (SELECT COUNT(*) FROM memories WHERE current_strength > $1) as active
  `, [minStrength]);

  const row = result.rows[0];
  return {
    totalEdges: parseInt(row.total_edges ?? '0', 10),
    averageWeight: parseFloat(row.avg_weight ?? '1.0'),
    dormantMemories: parseInt(row.dormant ?? '0', 10),
    activeMemories: parseInt(row.active ?? '0', 10),
  };
}
