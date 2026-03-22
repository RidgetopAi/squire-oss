/**
 * Resolution Detection Service
 *
 * Detects when chat messages indicate resolution of open commitments.
 * Uses LLM classification + embedding similarity to match resolutions to commitments.
 */

import { pool } from '../db/pool.js';
import { complete, type LLMMessage } from '../providers/llm.js';
import { generateEmbedding } from '../providers/embeddings.js';
import type { Commitment, ResolutionType } from './commitments.js';
import { createEdge } from './edges.js';

// === TYPES ===

interface ResolutionDetection {
  is_resolution: boolean;
  resolution_type: ResolutionType | null;
  subject_hint: string | null;
  confidence: 'high' | 'medium' | 'low';
}

interface CommitmentMatch {
  commitment: Commitment;
  similarity: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface ResolutionCandidate {
  message_content: string;
  detection: ResolutionDetection;
  matches: CommitmentMatch[];
  best_match: CommitmentMatch | null;
  requires_confirmation: boolean;
}

// === RESOLUTION CLASSIFICATION PROMPT ===

const RESOLUTION_DETECTION_PROMPT = `Analyze this message and determine if it indicates the resolution of a commitment, task, or goal.

Resolution patterns to detect:
- COMPLETED: "I finished...", "Done with...", "Completed...", "I did...", "Just wrapped up..."
- CANCELED: "I'm not going to...", "Decided against...", "Nevermind about...", "Canceled..."
- NO_LONGER_RELEVANT: "That's not needed anymore", "Circumstances changed", "No longer applies..."
- SUPERSEDED: "Replaced by...", "Changed to...", "Instead I'll...", "Rescheduled to..."

NOT resolution:
- Future intentions: "I will finish...", "I need to do..."
- Progress updates: "I'm working on...", "Started..."
- Questions: "Did I finish...?", "Should I cancel...?"
- General statements unrelated to tasks

Return JSON with:
- is_resolution: boolean - true ONLY if the message indicates something was resolved
- resolution_type: "completed" | "canceled" | "no_longer_relevant" | "superseded" | null
- subject_hint: string | null - what was resolved (extract key nouns/phrases that identify the task)
- confidence: "high" | "medium" | "low"
  - high: explicit resolution language ("I finished the report")
  - medium: implied resolution ("The report is done")
  - low: ambiguous but possible ("That's handled")

Examples:

Input: "I finished that dentist appointment scheduling"
Output: {"is_resolution": true, "resolution_type": "completed", "subject_hint": "dentist appointment scheduling", "confidence": "high"}

Input: "Actually, I'm not going to do the presentation after all"
Output: {"is_resolution": true, "resolution_type": "canceled", "subject_hint": "presentation", "confidence": "high"}

Input: "The meeting got moved to next month instead"
Output: {"is_resolution": true, "resolution_type": "superseded", "subject_hint": "meeting", "confidence": "medium"}

Input: "I need to finish the report by Friday"
Output: {"is_resolution": false, "resolution_type": null, "subject_hint": null, "confidence": "high"}

Input: "Working on the budget proposal"
Output: {"is_resolution": false, "resolution_type": null, "subject_hint": null, "confidence": "high"}

Input: "That's taken care of"
Output: {"is_resolution": true, "resolution_type": "completed", "subject_hint": null, "confidence": "low"}

IMPORTANT: Return ONLY valid JSON object, no markdown, no explanation.`;

// === CORE FUNCTIONS ===

/**
 * Detect if a message indicates resolution of a commitment
 */
async function detectResolution(message: string): Promise<ResolutionDetection | null> {
  // Quick pre-check for resolution-related keywords to avoid unnecessary LLM calls
  const resolutionKeywords = /\b(finish|done|complete|cancel|nevermind|never mind|not going to|decided against|no longer|supersed|replaced|instead|rescheduled|taken care|handled|wrapped up|accomplished|achieved)\b/i;

  if (!resolutionKeywords.test(message)) {
    return null;
  }

  try {
    const messages: LLMMessage[] = [
      { role: 'system', content: RESOLUTION_DETECTION_PROMPT },
      { role: 'user', content: message },
    ];

    const result = await complete(messages, {
      temperature: 0.1,
      maxTokens: 300,
    });

    const content = result.content.trim();

    // Extract JSON from response
    let jsonStr = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as ResolutionDetection;

    // Validate structure
    if (typeof parsed.is_resolution !== 'boolean') {
      console.error('[Resolution] Invalid detection response - missing is_resolution');
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('[Resolution] Detection failed:', error);
    return null;
  }
}

/**
 * Find open commitments that match a resolution hint using embedding similarity
 */
async function findMatchingCommitments(
  subjectHint: string,
  options: {
    limit?: number;
    minSimilarity?: number;
  } = {}
): Promise<CommitmentMatch[]> {
  const { limit = 5, minSimilarity = 0.3 } = options;

  // Generate embedding for the subject hint
  const embedding = await generateEmbedding(subjectHint);
  const embeddingStr = `[${embedding.join(',')}]`;

  // Search for open commitments by embedding similarity
  const result = await pool.query<Commitment & { similarity: number }>(
    `SELECT c.*,
            1 - (c.embedding <=> $1::vector) as similarity
     FROM commitments c
     WHERE c.status IN ('open', 'in_progress')
       AND c.embedding IS NOT NULL
       AND 1 - (c.embedding <=> $1::vector) >= $2
     ORDER BY similarity DESC
     LIMIT $3`,
    [embeddingStr, minSimilarity, limit]
  );

  return result.rows.map((row) => {
    const similarity = row.similarity;
    let confidence: 'high' | 'medium' | 'low';

    if (similarity >= 0.7) {
      confidence = 'high';
    } else if (similarity >= 0.5) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // Remove similarity from the commitment object
    const { similarity: _, ...commitment } = row;

    return {
      commitment: commitment as Commitment,
      similarity,
      confidence,
    };
  });
}

/**
 * Find matching commitments using text search as fallback
 */
async function findMatchingCommitmentsText(
  subjectHint: string,
  options: {
    limit?: number;
  } = {}
): Promise<CommitmentMatch[]> {
  const { limit = 5 } = options;

  // Prepare search terms from the hint
  const searchTerms = subjectHint
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 2)
    .map((term) => term.replace(/[^a-z0-9]/g, ''));

  if (searchTerms.length === 0) {
    return [];
  }

  // Build ILIKE conditions for each term
  const conditions = searchTerms.map((_, i) => `(title ILIKE $${i + 2} OR description ILIKE $${i + 2})`);
  const params = searchTerms.map((term) => `%${term}%`);

  const result = await pool.query<Commitment>(
    `SELECT *
     FROM commitments
     WHERE status IN ('open', 'in_progress')
       AND (${conditions.join(' OR ')})
     ORDER BY
       CASE
         WHEN title ILIKE $${searchTerms.length + 2} THEN 1
         ELSE 2
       END,
       created_at DESC
     LIMIT $1`,
    [limit, ...params, `%${subjectHint}%`]
  );

  return result.rows.map((commitment) => ({
    commitment,
    similarity: 0.4, // Text match gets moderate base similarity
    confidence: 'medium' as const,
  }));
}

/**
 * Process a message for potential commitment resolution
 * Returns resolution candidates with matching commitments
 */
async function processMessageForResolution(
  message: string
): Promise<ResolutionCandidate | null> {
  // Step 1: Detect if message indicates resolution
  const detection = await detectResolution(message);

  if (!detection?.is_resolution) {
    return null;
  }

  // Step 2: Find matching commitments
  let matches: CommitmentMatch[] = [];

  if (detection.subject_hint) {
    // Try embedding similarity first
    matches = await findMatchingCommitments(detection.subject_hint);

    // If no embedding matches, try text search
    if (matches.length === 0) {
      matches = await findMatchingCommitmentsText(detection.subject_hint);
    }
  }

  // Step 3: Determine if confirmation is needed
  const firstMatch = matches[0];
  const bestMatch: CommitmentMatch | null = firstMatch ?? null;
  const requiresConfirmation =
    !bestMatch ||
    bestMatch.confidence === 'low' ||
    detection.confidence === 'low' ||
    matches.length > 1;

  return {
    message_content: message,
    detection,
    matches,
    best_match: bestMatch,
    requires_confirmation: requiresConfirmation,
  };
}

/**
 * Auto-resolve a commitment if confidence is high enough
 * Returns true if resolution was applied
 */
async function autoResolveCommitment(
  candidate: ResolutionCandidate,
  resolutionMemoryId?: string
): Promise<boolean> {
  if (
    !candidate.best_match ||
    candidate.requires_confirmation ||
    !candidate.detection.resolution_type
  ) {
    return false;
  }

  // Only auto-resolve high confidence matches
  if (
    candidate.detection.confidence !== 'high' ||
    candidate.best_match.confidence !== 'high'
  ) {
    return false;
  }

  const commitment = candidate.best_match.commitment;
  const resolutionType = candidate.detection.resolution_type;

  // Update the commitment status
  const newStatus = resolutionType === 'completed' ? 'completed' : 'canceled';

  await pool.query(
    `UPDATE commitments
     SET status = $1,
         resolved_at = NOW(),
         resolution_type = $2,
         resolution_memory_id = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [
      newStatus,
      resolutionType,
      resolutionMemoryId ?? null,
      commitment.id,
    ]
  );

  // Create memory edge if both original and resolution memories exist
  if (commitment.memory_id && resolutionMemoryId) {
    try {
      // Use RESOLVES for completion, CONTRADICTS for cancellation
      const edgeType = resolutionType === 'completed' || resolutionType === 'superseded'
        ? 'RESOLVES'
        : 'CONTRADICTS';

      await createEdge({
        source_memory_id: commitment.memory_id,
        target_memory_id: resolutionMemoryId,
        edge_type: edgeType,
        weight: 1.0,
        metadata: {
          commitment_id: commitment.id,
          resolution_type: resolutionType,
          auto_resolved: true,
        },
      });

      console.log(
        `[Resolution] Created ${edgeType} edge from memory ${commitment.memory_id} to ${resolutionMemoryId}`
      );
    } catch (edgeError) {
      console.error('[Resolution] Failed to create memory edge:', edgeError);
    }
  }

  console.log(
    `[Resolution] Auto-resolved commitment "${commitment.title}" as ${resolutionType}`
  );

  return true;
}

// === BATCH PROCESSING ===

/**
 * Process multiple messages for resolutions (used by chat extraction)
 */
export async function processMessagesForResolutions(
  messages: { id: string; content: string }[]
): Promise<{
  resolved: { messageId: string; commitmentId: string; resolutionType: ResolutionType }[];
  pendingConfirmation: { messageId: string; candidate: ResolutionCandidate }[];
}> {
  const resolved: { messageId: string; commitmentId: string; resolutionType: ResolutionType }[] = [];
  const pendingConfirmation: { messageId: string; candidate: ResolutionCandidate }[] = [];

  for (const msg of messages) {
    try {
      const candidate = await processMessageForResolution(msg.content);

      if (!candidate) {
        continue;
      }

      if (candidate.requires_confirmation) {
        pendingConfirmation.push({ messageId: msg.id, candidate });
      } else if (candidate.best_match && candidate.detection.resolution_type) {
        const wasResolved = await autoResolveCommitment(candidate);
        if (wasResolved) {
          resolved.push({
            messageId: msg.id,
            commitmentId: candidate.best_match.commitment.id,
            resolutionType: candidate.detection.resolution_type,
          });
        }
      }
    } catch (error) {
      console.error(`[Resolution] Failed to process message ${msg.id}:`, error);
    }
  }

  return { resolved, pendingConfirmation };
}
