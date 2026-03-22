/**
 * Memory Reinforcement Service (Phase 3)
 *
 * Handles the promotion of memories from hypothesis → solid tier based on:
 * 1. Finding similar existing memories via embedding search
 * 2. Boosting confidence when repeated mentions occur
 * 3. Promoting to 'solid' tier when confidence crosses 0.75 threshold
 * 4. Creating SIMILAR edges for audit trail
 */

import { pool } from '../db/pool.js';
import { generateEmbedding } from '../providers/embeddings.js';
import { createEdge } from './edges.js';

export interface ReinforcementResult {
  memoryId: string;
  previousConfidence: number;
  newConfidence: number;
  previousTier: 'hypothesis' | 'solid';
  newTier: 'hypothesis' | 'solid';
  wasPromoted: boolean;
  reinforcedBy: string[]; // IDs of similar memories that reinforced this one
}

interface SimilarMemory {
  id: string;
  content: string;
  similarity: number;
  tier: string;
  confidence: number;
}

const SIMILARITY_THRESHOLD = 0.80; // Minimum similarity to count as reinforcement (lowered to catch paraphrased mentions)
const CONFIDENCE_BOOST = 0.15; // How much to boost confidence per reinforcement
const PROMOTION_THRESHOLD = 0.75; // Confidence needed to promote to solid

/**
 * Check if a new memory is reinforced by existing similar memories.
 * If so, boost its confidence and potentially promote to solid tier.
 *
 * Called after creating a new memory to check for reinforcement.
 */
export async function checkReinforcement(
  memoryId: string,
  content: string,
  currentConfidence: number
): Promise<ReinforcementResult> {
  const result: ReinforcementResult = {
    memoryId,
    previousConfidence: currentConfidence,
    newConfidence: currentConfidence,
    previousTier: currentConfidence >= PROMOTION_THRESHOLD ? 'solid' : 'hypothesis',
    newTier: currentConfidence >= PROMOTION_THRESHOLD ? 'solid' : 'hypothesis',
    wasPromoted: false,
    reinforcedBy: [],
  };

  try {
    // Generate embedding for the new memory content
    const embedding = await generateEmbedding(content);
    const embeddingStr = `[${embedding.join(',')}]`;

    // Find similar memories (excluding this one)
    const similarResult = await pool.query<SimilarMemory>(
      `SELECT id, content, tier, confidence,
              1 - (embedding <=> $1::vector) as similarity
       FROM memories
       WHERE id != $2
         AND embedding IS NOT NULL
         AND 1 - (embedding <=> $1::vector) >= $3
       ORDER BY similarity DESC
       LIMIT 5`,
      [embeddingStr, memoryId, SIMILARITY_THRESHOLD]
    );

    const similarMemories = similarResult.rows;

    if (similarMemories.length === 0) {
      // No similar memories found - no reinforcement
      return result;
    }

    // Calculate confidence boost based on number and quality of matches
    let totalBoost = 0;
    for (const similar of similarMemories) {
      // Higher similarity = stronger reinforcement
      const similarityBonus = (similar.similarity - SIMILARITY_THRESHOLD) / (1 - SIMILARITY_THRESHOLD);
      const boost = CONFIDENCE_BOOST * (0.5 + 0.5 * similarityBonus);
      totalBoost += boost;

      result.reinforcedBy.push(similar.id);

      // Create SIMILAR edge for audit trail
      await createEdge({
        source_memory_id: memoryId,
        target_memory_id: similar.id,
        edge_type: 'SIMILAR',
        similarity: similar.similarity,
        weight: boost,
        metadata: {
          reinforcement: true,
          boost_applied: boost,
        },
      });

      console.log(
        `[Reinforcement] Memory ${memoryId.substring(0, 8)} reinforced by ${similar.id.substring(0, 8)} (similarity: ${similar.similarity.toFixed(3)}, boost: ${boost.toFixed(3)})`
      );
    }

    // Cap total boost at 0.4 to prevent one batch from going 0.3 → 1.0
    totalBoost = Math.min(totalBoost, 0.4);

    // Calculate new confidence (capped at 1.0)
    result.newConfidence = Math.min(currentConfidence + totalBoost, 1.0);

    // Check if promotion to solid is warranted
    if (result.previousTier === 'hypothesis' && result.newConfidence >= PROMOTION_THRESHOLD) {
      result.newTier = 'solid';
      result.wasPromoted = true;
    }

    // Update the memory in the database
    await pool.query(
      `UPDATE memories SET confidence = $1, tier = $2 WHERE id = $3`,
      [result.newConfidence, result.newTier, memoryId]
    );

    if (result.wasPromoted) {
      console.log(
        `[Reinforcement] PROMOTED memory ${memoryId.substring(0, 8)} to SOLID (confidence: ${result.previousConfidence.toFixed(2)} → ${result.newConfidence.toFixed(2)})`
      );
    }

    return result;
  } catch (error) {
    console.error('[Reinforcement] Error checking reinforcement:', error);
    return result;
  }
}

