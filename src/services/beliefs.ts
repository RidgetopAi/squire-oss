/**
 * Beliefs Service (Slice 7A)
 *
 * Extracts and manages persistent beliefs from memories.
 * Tracks belief evidence, confidence, and conflicts.
 */

import { pool } from '../db/pool.js';
import { completeText } from '../providers/llm.js';
import { generateEmbedding } from '../providers/embeddings.js';
import { searchEntities } from './entities.js';

// === TYPES ===

export const BELIEF_TYPES = [
  'value',               // core values ("I value honesty")
  'preference',          // preferences ("I prefer morning work")
  'self_knowledge',      // self-understanding ("I work best under pressure")
  'prediction',          // expectations ("The project will succeed")
  'about_person',        // beliefs about others ("Sarah is reliable")
  'about_project',       // beliefs about work ("This approach is best")
  'about_world',         // general world beliefs ("Remote work is the future")
  'should',              // normative ("I should prioritize health")
  'support_preference',  // How they prefer to be supported
  'trigger_sensitivity', // What triggers negative reactions
  'protective_priority', // What they'll protect at all costs
  'vulnerability_theme', // Deep fears/insecurities shaping behavior
] as const;

export type BeliefType = (typeof BELIEF_TYPES)[number];

export interface Belief {
  id: string;
  content: string;
  belief_type: BeliefType;
  related_entity_id: string | null;
  confidence: number;
  source_memory_count: number;
  first_extracted_at: Date;
  last_reinforced_at: Date | null;
  reinforcement_count: number;
  status: 'active' | 'superseded' | 'conflicted';
  superseded_by: string | null;
  extracted_by_model: string | null;
  extraction_prompt_version: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BeliefEvidence {
  id: string;
  belief_id: string;
  memory_id: string;
  support_strength: number;
  evidence_type: 'supports' | 'contradicts' | 'nuances';
  extracted_at: Date;
}

export interface BeliefConflict {
  id: string;
  belief_a_id: string;
  belief_b_id: string;
  conflict_type: 'direct_contradiction' | 'tension' | 'evolution';
  conflict_description: string | null;
  resolution_status: string;
  resolution_notes: string | null;
  resolved_at: Date | null;
  detected_at: Date;
}

interface ExtractedBelief {
  content: string;
  belief_type: BeliefType;
  confidence: number;
  entity_name?: string;  // For about_person/about_project
  reason: string;
}

// === BELIEF EXTRACTION ===

/**
 * Extract beliefs from a memory's content using LLM
 */
async function extractBeliefsFromContent(
  content: string
): Promise<ExtractedBelief[]> {
  const systemPrompt = `You are a belief extractor. Given a memory/observation, identify any beliefs the person holds.

A belief is a persistent conviction or understanding, NOT just a fact or observation.

Belief types:
- value: Core values ("I value honesty", "Family is important to me")
- preference: Preferences ("I prefer working in the morning", "I like remote work")
- self_knowledge: Self-understanding ("I work best under pressure", "I'm an introvert")
- prediction: Expectations ("This project will succeed", "The market will recover")
- about_person: Beliefs about others ("Sarah is reliable", "Tom is ambitious")
- about_project: Beliefs about work/projects ("This codebase is well-designed")
- about_world: General beliefs ("Remote work is the future", "AI will transform work")
- should: Normative beliefs ("I should prioritize health", "One should always be honest")
- support_preference: How they prefer to be supported ("I need space when stressed", "I want direct feedback")
- trigger_sensitivity: What triggers negative reactions ("Being rushed makes me shut down", "I hate being micromanaged")
- protective_priority: What they'll protect at all costs ("My family time is non-negotiable", "I won't compromise on quality")
- vulnerability_theme: Deep fears/insecurities shaping behavior ("I worry I'm not doing enough", "I fear losing control")

IMPORTANT for support types (support_preference, trigger_sensitivity, protective_priority, vulnerability_theme):
- Only extract when CLEARLY demonstrated through behavior or explicit statement (not single offhand comments)
- Start at LOW confidence (0.4) — these need 3+ reinforcements to reach the display threshold
- These are deeply personal — be conservative in extraction

Return ONLY a JSON array of beliefs found. Include confidence (0.0-1.0).
If no beliefs are present, return an empty array: []

Format: [{"content": "belief statement", "belief_type": "type", "confidence": 0.X, "entity_name": "name if about_person/about_project", "reason": "why this is a belief"}]`;

  const prompt = `Memory: "${content}"

What beliefs does this memory reveal? Return JSON array only.`;

  try {
    const response = await completeText(prompt, systemPrompt, {
      temperature: 0.2,
      maxTokens: 500,
    });

    // Parse JSON response
    const jsonMatch = response.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return [];
    }

    const extracted = JSON.parse(jsonMatch[0]) as Array<{
      content: string;
      belief_type: string;
      confidence: number;
      entity_name?: string;
      reason?: string;
    }>;

    // Validate and filter
    return extracted
      .filter(
        (b) =>
          BELIEF_TYPES.includes(b.belief_type as BeliefType) &&
          b.content &&
          b.confidence >= 0.3
      )
      .map((b) => ({
        content: b.content,
        belief_type: b.belief_type as BeliefType,
        confidence: Math.min(1.0, Math.max(0.0, b.confidence)),
        entity_name: b.entity_name,
        reason: b.reason || '',
      }));
  } catch (error) {
    console.error('Belief extraction failed:', error);
    return [];
  }
}

// === BELIEF SIMILARITY ===

// Minimum similarity score to count as matching belief (same as reinforcement)
const BELIEF_SIMILARITY_THRESHOLD = 0.85;

/**
 * Find existing belief that matches (for reinforcement vs creation)
 * Uses embedding-based similarity search with fallback to exact text match
 */
async function findSimilarBelief(
  content: string,
  beliefType: BeliefType
): Promise<Belief | null> {
  // First, try exact text match (fast path)
  const normalized = content.toLowerCase().trim();
  const exactMatch = await pool.query<Belief>(
    `SELECT * FROM beliefs
     WHERE belief_type = $1
       AND status = 'active'
       AND LOWER(content) = $2
     LIMIT 1`,
    [beliefType, normalized]
  );

  if (exactMatch.rows[0]) {
    return exactMatch.rows[0];
  }

  // Generate embedding for similarity search
  try {
    const embedding = await generateEmbedding(content);
    const embeddingStr = `[${embedding.join(',')}]`;

    // Search for similar beliefs using embedding similarity
    const similarResult = await pool.query<Belief & { similarity: number }>(
      `SELECT *, 1 - (embedding <=> $1::vector) as similarity
       FROM beliefs
       WHERE belief_type = $2
         AND status = 'active'
         AND embedding IS NOT NULL
         AND 1 - (embedding <=> $1::vector) >= $3
       ORDER BY similarity DESC
       LIMIT 1`,
      [embeddingStr, beliefType, BELIEF_SIMILARITY_THRESHOLD]
    );

    if (similarResult.rows[0]) {
      console.log(
        `[Beliefs] Found similar belief (similarity: ${similarResult.rows[0].similarity.toFixed(3)}): "${similarResult.rows[0].content.substring(0, 50)}..."`
      );
      return similarResult.rows[0];
    }
  } catch (error) {
    console.error('[Beliefs] Embedding similarity search failed:', error);
    // Fall through to return null if embedding search fails
  }

  return null;
}

// === BELIEF CRUD ===

/**
 * Create a new belief with embedding for similarity search
 */
async function createBelief(
  content: string,
  beliefType: BeliefType,
  confidence: number,
  relatedEntityId?: string,
  model?: string
): Promise<Belief> {
  // Generate embedding for the belief content
  let embeddingStr: string | null = null;
  try {
    const embedding = await generateEmbedding(content);
    embeddingStr = `[${embedding.join(',')}]`;
  } catch (error) {
    console.error('[Beliefs] Failed to generate embedding for belief:', error);
    // Continue without embedding - will rely on exact text match
  }

  const result = await pool.query<Belief>(
    `INSERT INTO beliefs (
       content, belief_type, related_entity_id, confidence,
       extracted_by_model, extraction_prompt_version, embedding
     )
     VALUES ($1, $2, $3, $4, $5, 'v1', $6::vector)
     RETURNING *`,
    [content, beliefType, relatedEntityId || null, confidence, model || null, embeddingStr]
  );
  return result.rows[0]!;
}

/**
 * Get a belief by ID
 */
export async function getBelief(id: string): Promise<Belief | null> {
  const result = await pool.query<Belief>(
    `SELECT * FROM beliefs WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Get all active beliefs
 */
export async function getAllBeliefs(options?: {
  type?: BeliefType;
  status?: string;
  minConfidence?: number;
  limit?: number;
}): Promise<Belief[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramCount = 0;

  if (options?.type) {
    paramCount++;
    conditions.push(`belief_type = $${paramCount}`);
    params.push(options.type);
  }

  if (options?.status) {
    paramCount++;
    conditions.push(`status = $${paramCount}`);
    params.push(options.status);
  } else {
    conditions.push(`status = 'active'`);
  }

  if (options?.minConfidence) {
    paramCount++;
    conditions.push(`confidence >= $${paramCount}`);
    params.push(options.minConfidence);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const limit = options?.limit || 100;
  paramCount++;
  params.push(limit);

  const result = await pool.query<Belief>(
    `SELECT * FROM beliefs
     ${whereClause}
     ORDER BY confidence DESC, reinforcement_count DESC
     LIMIT $${paramCount}`,
    params
  );
  return result.rows;
}

/**
 * Get beliefs by type
 */
export async function getBeliefsByType(type: BeliefType): Promise<Belief[]> {
  return getAllBeliefs({ type });
}

/**
 * Get beliefs about a specific entity
 */
export async function getBeliefsByEntity(entityId: string): Promise<Belief[]> {
  const result = await pool.query<Belief>(
    `SELECT * FROM beliefs
     WHERE related_entity_id = $1 AND status = 'active'
     ORDER BY confidence DESC`,
    [entityId]
  );
  return result.rows;
}

/**
 * Reinforce an existing belief (new evidence found)
 */
async function reinforceBelief(
  beliefId: string,
  confidenceBoost: number = 0.1
): Promise<Belief> {
  const result = await pool.query<Belief>(
    `UPDATE beliefs
     SET confidence = LEAST(1.0, confidence + $2),
         reinforcement_count = reinforcement_count + 1,
         last_reinforced_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [beliefId, confidenceBoost]
  );

  if (!result.rows[0]) {
    throw new Error(`Belief not found: ${beliefId}`);
  }
  return result.rows[0];
}

/**
 * Supersede a belief with a newer one
 */
async function supersedeBelief(
  oldBeliefId: string,
  newBeliefId: string
): Promise<void> {
  await pool.query(
    `UPDATE beliefs
     SET status = 'superseded',
         superseded_by = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [oldBeliefId, newBeliefId]
  );
}

// === EVIDENCE MANAGEMENT ===

/**
 * Link a memory as evidence for a belief
 */
async function linkEvidence(
  beliefId: string,
  memoryId: string,
  supportStrength: number,
  evidenceType: 'supports' | 'contradicts' | 'nuances' = 'supports'
): Promise<BeliefEvidence> {
  const result = await pool.query<BeliefEvidence>(
    `INSERT INTO belief_evidence (belief_id, memory_id, support_strength, evidence_type)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (belief_id, memory_id)
     DO UPDATE SET support_strength = $3, evidence_type = $4
     RETURNING *`,
    [beliefId, memoryId, supportStrength, evidenceType]
  );

  // Update source memory count
  await pool.query(
    `UPDATE beliefs
     SET source_memory_count = (
       SELECT COUNT(*) FROM belief_evidence WHERE belief_id = $1
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [beliefId]
  );

  return result.rows[0]!;
}

/**
 * Get evidence for a belief
 */
export async function getBeliefEvidence(
  beliefId: string
): Promise<Array<BeliefEvidence & { memory_content: string }>> {
  const result = await pool.query<BeliefEvidence & { memory_content: string }>(
    `SELECT be.*, m.content as memory_content
     FROM belief_evidence be
     JOIN memories m ON m.id = be.memory_id
     WHERE be.belief_id = $1
     ORDER BY be.support_strength DESC`,
    [beliefId]
  );
  return result.rows;
}

// === CONFLICT DETECTION ===

/**
 * Check if a new belief conflicts with existing beliefs
 */
async function detectConflicts(
  beliefId: string
): Promise<BeliefConflict[]> {
  const belief = await getBelief(beliefId);
  if (!belief) return [];

  // Get other active beliefs of the same type
  const otherBeliefs = await pool.query<Belief>(
    `SELECT * FROM beliefs
     WHERE id != $1
       AND status = 'active'
       AND belief_type = $2`,
    [beliefId, belief.belief_type]
  );

  if (otherBeliefs.rows.length === 0) return [];

  // Use LLM to detect conflicts
  const systemPrompt = `You are a belief conflict detector. Given a new belief and a list of existing beliefs, identify any conflicts.

Conflict types:
- direct_contradiction: The beliefs cannot both be true
- tension: The beliefs are in tension but could coexist in different contexts
- evolution: The new belief appears to be an update/evolution of an older belief

Return ONLY a JSON array of conflicts found.
Format: [{"existing_belief_id": "...", "conflict_type": "...", "description": "brief explanation"}]

If no conflicts, return: []`;

  const existingList = otherBeliefs.rows
    .map((b) => `- ID: ${b.id}, Content: "${b.content}"`)
    .join('\n');

  const prompt = `New belief: "${belief.content}"

Existing beliefs of type "${belief.belief_type}":
${existingList}

Identify any conflicts. Return JSON array only.`;

  try {
    const response = await completeText(prompt, systemPrompt, {
      temperature: 0.1,
      maxTokens: 500,
    });

    const jsonMatch = response.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    const conflicts = JSON.parse(jsonMatch[0]) as Array<{
      existing_belief_id: string;
      conflict_type: string;
      description: string;
    }>;

    // Create conflict records
    const createdConflicts: BeliefConflict[] = [];
    for (const c of conflicts) {
      if (!['direct_contradiction', 'tension', 'evolution'].includes(c.conflict_type)) {
        continue;
      }

      const result = await pool.query<BeliefConflict>(
        `INSERT INTO belief_conflicts (belief_a_id, belief_b_id, conflict_type, conflict_description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (belief_a_id, belief_b_id) DO NOTHING
         RETURNING *`,
        [beliefId, c.existing_belief_id, c.conflict_type, c.description]
      );

      if (result.rows[0]) {
        createdConflicts.push(result.rows[0]);

        // Mark beliefs as conflicted
        await pool.query(
          `UPDATE beliefs SET status = 'conflicted', updated_at = NOW()
           WHERE id IN ($1, $2) AND status = 'active'`,
          [beliefId, c.existing_belief_id]
        );
      }
    }

    return createdConflicts;
  } catch (error) {
    console.error('Conflict detection failed:', error);
    return [];
  }
}

/**
 * Get all unresolved conflicts
 */
export async function getUnresolvedConflicts(): Promise<
  Array<BeliefConflict & { belief_a_content: string; belief_b_content: string }>
> {
  const result = await pool.query<
    BeliefConflict & { belief_a_content: string; belief_b_content: string }
  >(
    `SELECT bc.*,
            ba.content as belief_a_content,
            bb.content as belief_b_content
     FROM belief_conflicts bc
     JOIN beliefs ba ON ba.id = bc.belief_a_id
     JOIN beliefs bb ON bb.id = bc.belief_b_id
     WHERE bc.resolution_status = 'unresolved'
     ORDER BY bc.detected_at DESC`
  );
  return result.rows;
}

/**
 * Resolve a conflict
 */
export async function resolveConflict(
  conflictId: string,
  resolution: 'belief_a_active' | 'belief_b_active' | 'both_valid' | 'merged' | 'user_resolved',
  notes?: string
): Promise<BeliefConflict> {
  const conflict = await pool.query<BeliefConflict>(
    `SELECT * FROM belief_conflicts WHERE id = $1`,
    [conflictId]
  );

  if (!conflict.rows[0]) {
    throw new Error(`Conflict not found: ${conflictId}`);
  }

  const c = conflict.rows[0];

  // Update conflict status
  const result = await pool.query<BeliefConflict>(
    `UPDATE belief_conflicts
     SET resolution_status = $2,
         resolution_notes = $3,
         resolved_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [conflictId, resolution, notes || null]
  );

  // Update belief statuses based on resolution
  if (resolution === 'belief_a_active') {
    await supersedeBelief(c.belief_b_id, c.belief_a_id);
    await pool.query(
      `UPDATE beliefs SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [c.belief_a_id]
    );
  } else if (resolution === 'belief_b_active') {
    await supersedeBelief(c.belief_a_id, c.belief_b_id);
    await pool.query(
      `UPDATE beliefs SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [c.belief_b_id]
    );
  } else if (resolution === 'both_valid') {
    await pool.query(
      `UPDATE beliefs SET status = 'active', updated_at = NOW() WHERE id IN ($1, $2)`,
      [c.belief_a_id, c.belief_b_id]
    );
  }

  return result.rows[0]!;
}

// === STATISTICS ===

/**
 * Get belief statistics
 */
export async function getBeliefStats(): Promise<{
  total: number;
  active: number;
  conflicted: number;
  superseded: number;
  byType: Record<string, number>;
  avgConfidence: number;
  unresolvedConflicts: number;
}> {
  const result = await pool.query<{
    total: string;
    active: string;
    conflicted: string;
    superseded: string;
    avg_confidence: string;
  }>(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE status = 'conflicted') as conflicted,
      COUNT(*) FILTER (WHERE status = 'superseded') as superseded,
      AVG(confidence) as avg_confidence
    FROM beliefs
  `);

  const byTypeResult = await pool.query<{ belief_type: string; count: string }>(`
    SELECT belief_type, COUNT(*) as count
    FROM beliefs
    WHERE status = 'active'
    GROUP BY belief_type
  `);

  const conflictResult = await pool.query<{ count: string }>(`
    SELECT COUNT(*) as count FROM belief_conflicts WHERE resolution_status = 'unresolved'
  `);

  const row = result.rows[0]!;
  const byType: Record<string, number> = {};
  for (const r of byTypeResult.rows) {
    byType[r.belief_type] = parseInt(r.count, 10);
  }

  return {
    total: parseInt(row.total, 10),
    active: parseInt(row.active, 10),
    conflicted: parseInt(row.conflicted, 10),
    superseded: parseInt(row.superseded, 10),
    byType,
    avgConfidence: parseFloat(row.avg_confidence) || 0,
    unresolvedConflicts: parseInt(conflictResult.rows[0]?.count || '0', 10),
  };
}

// === HELPERS ===

/**
 * Check if a belief type is valid
 */
export function isValidBeliefType(type: string): type is BeliefType {
  return BELIEF_TYPES.includes(type as BeliefType);
}

/**
 * Get human-readable description of belief type
 */
export function getBeliefTypeDescription(type: BeliefType): string {
  const descriptions: Record<BeliefType, string> = {
    value: 'Core values and principles',
    preference: 'Personal preferences',
    self_knowledge: 'Self-understanding and traits',
    prediction: 'Expectations and predictions',
    about_person: 'Beliefs about other people',
    about_project: 'Beliefs about work and projects',
    about_world: 'General world beliefs',
    should: 'Normative beliefs (what should be)',
    support_preference: 'How they prefer to be supported',
    trigger_sensitivity: 'What triggers negative reactions',
    protective_priority: 'What they protect at all costs',
    vulnerability_theme: 'Deep fears and insecurities',
  };
  return descriptions[type];
}

// === HIGH-LEVEL INTEGRATION ===

/**
 * Resolve an entity name to an entity ID
 * For about_person beliefs, search for person entities
 * For about_project beliefs, search for project entities
 */
async function resolveEntityName(
  entityName: string | undefined,
  beliefType: BeliefType
): Promise<string | undefined> {
  if (!entityName) {
    return undefined;
  }

  // Determine entity type based on belief type
  const entityType = beliefType === 'about_person' ? 'person' :
                     beliefType === 'about_project' ? 'project' : undefined;

  try {
    const matchingEntities = await searchEntities(entityName, entityType);
    const firstMatch = matchingEntities[0];
    if (firstMatch) {
      console.log(
        `[Beliefs] Resolved entity "${entityName}" to ${firstMatch.name} (${firstMatch.id})`
      );
      return firstMatch.id;
    } else {
      console.log(
        `[Beliefs] Could not resolve entity "${entityName}" - no matching entity found`
      );
      return undefined;
    }
  } catch (error) {
    console.error(`[Beliefs] Failed to resolve entity "${entityName}":`, error);
    return undefined;
  }
}

export interface BeliefExtractionResult {
  created: Belief[];
  reinforced: Array<{ belief: Belief; wasReinforced: boolean }>;
  conflicts: BeliefConflict[];
}

/**
 * Process a memory for beliefs: extract, create/reinforce, detect conflicts
 * Called from observe flow
 */
export async function processMemoryForBeliefs(
  memoryId: string,
  content: string,
  model?: string
): Promise<BeliefExtractionResult> {
  const result: BeliefExtractionResult = {
    created: [],
    reinforced: [],
    conflicts: [],
  };

  // Extract beliefs from content
  const extracted = await extractBeliefsFromContent(content);
  if (extracted.length === 0) {
    return result;
  }

  for (const ext of extracted) {
    // Check if similar belief already exists
    const existing = await findSimilarBelief(ext.content, ext.belief_type);

    if (existing) {
      // Reinforce existing belief
      const reinforced = await reinforceBelief(existing.id, 0.05);
      await linkEvidence(existing.id, memoryId, ext.confidence, 'supports');
      result.reinforced.push({ belief: reinforced, wasReinforced: true });
    } else {
      // Create new belief
      // Resolve entity_name to entity_id for about_person/about_project beliefs
      const relatedEntityId = await resolveEntityName(ext.entity_name, ext.belief_type);

      const belief = await createBelief(
        ext.content,
        ext.belief_type,
        ext.confidence,
        relatedEntityId,
        model
      );
      await linkEvidence(belief.id, memoryId, ext.confidence, 'supports');
      result.created.push(belief);

      // Check for conflicts with existing beliefs
      const conflicts = await detectConflicts(belief.id);
      result.conflicts.push(...conflicts);
    }
  }

  return result;
}
