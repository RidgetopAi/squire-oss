/**
 * Insights Service (Slice 7C)
 *
 * Generates higher-level insights by cross-analyzing patterns, beliefs, and memories.
 * Insights are meta-observations: connections, contradictions, opportunities, warnings.
 */

import { pool } from '../db/pool.js';
import { completeText } from '../providers/llm.js';
import { broadcastInsightCreated } from '../api/socket/broadcast.js';

// === TYPES ===

export const INSIGHT_TYPES = [
  'connection',      // links between related concepts/patterns
  'contradiction',   // inconsistencies between beliefs and behaviors
  'opportunity',     // potential improvements or optimizations
  'warning',         // flags potential issues or risks
] as const;

export type InsightType = (typeof INSIGHT_TYPES)[number];

export const INSIGHT_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type InsightPriority = (typeof INSIGHT_PRIORITIES)[number];

export const INSIGHT_STATUSES = ['active', 'dismissed', 'actioned', 'stale'] as const;
export type InsightStatus = (typeof INSIGHT_STATUSES)[number];

export const SOURCE_TYPES = ['memory', 'belief', 'pattern'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface Insight {
  id: string;
  content: string;
  insight_type: InsightType;
  priority: InsightPriority;
  confidence: number;
  status: InsightStatus;
  dismissed_reason: string | null;
  actioned_at: Date | null;
  generated_by_model: string | null;
  generation_prompt_version: string | null;
  last_validated_at: Date;
  validation_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface InsightSource {
  id: string;
  insight_id: string;
  source_type: SourceType;
  source_id: string;
  contribution_type: 'supports' | 'primary' | 'context' | 'contrasts';
  contribution_strength: number;
  explanation: string | null;
  added_at: Date;
}

export interface ExtractedInsight {
  content: string;
  insight_type: InsightType;
  priority: InsightPriority;
  confidence: number;
  sources: Array<{
    type: SourceType;
    id: string;
    contribution: 'supports' | 'primary' | 'context' | 'contrasts';
    explanation?: string;
  }>;
  reason: string;
}

// === INSIGHT GENERATION ===

interface AnalysisContext {
  beliefs: Array<{ id: string; content: string; type: string; confidence: number }>;
  patterns: Array<{ id: string; content: string; type: string; confidence: number; frequency: number }>;
  recentMemories: Array<{ id: string; content: string; created_at: Date }>;
}

/**
 * Generate insights from cross-analysis of beliefs, patterns, and memories
 */
export async function generateInsights(
  context: AnalysisContext
): Promise<ExtractedInsight[]> {
  if (context.beliefs.length === 0 && context.patterns.length === 0) {
    return [];
  }

  const systemPrompt = `You are an insight generator. Given a person's beliefs, patterns, and recent memories, identify higher-level insights.

An insight is NOT just restating a belief or pattern - it's a NEW observation from CONNECTING different pieces of information.

Insight types:
- connection: Links between related concepts ("Your productivity pattern aligns with your belief about morning work")
- contradiction: Inconsistencies between what someone believes vs does ("You value balance but patterns show 60+ hour weeks")
- opportunity: Potential improvements based on the data ("Your high-energy mornings could be better used for creative work")
- warning: Potential issues or risks to flag ("Stress patterns correlating with project deadlines suggest overcommitment")

Priority levels: low, medium, high, critical

Requirements:
1. Each insight MUST reference at least 2 sources (beliefs, patterns, or memories)
2. Only generate insights with confidence >= 0.5
3. Focus on actionable or meaningful observations
4. Avoid obvious or trivial connections

Return ONLY a JSON array. If no meaningful insights, return: []

Format: [{
  "content": "insight statement",
  "insight_type": "connection|contradiction|opportunity|warning",
  "priority": "low|medium|high|critical",
  "confidence": 0.X,
  "sources": [
    {"type": "belief|pattern|memory", "id": "uuid", "contribution": "primary|supports|context|contrasts", "explanation": "how this source relates"}
  ],
  "reason": "why this insight matters"
}]`;

  // Build context string
  const beliefsStr = context.beliefs.length > 0
    ? `BELIEFS:\n${context.beliefs.map((b) => `- [${b.id}] (${b.type}, conf: ${b.confidence.toFixed(2)}): "${b.content}"`).join('\n')}`
    : 'BELIEFS: None recorded yet';

  const patternsStr = context.patterns.length > 0
    ? `PATTERNS:\n${context.patterns.map((p) => `- [${p.id}] (${p.type}, conf: ${p.confidence.toFixed(2)}, freq: ${p.frequency.toFixed(2)}): "${p.content}"`).join('\n')}`
    : 'PATTERNS: None detected yet';

  const memoriesStr = context.recentMemories.length > 0
    ? `RECENT MEMORIES:\n${context.recentMemories.slice(0, 10).map((m) => `- [${m.id}]: "${m.content.slice(0, 200)}..."`).join('\n')}`
    : 'RECENT MEMORIES: None';

  const prompt = `Analyze this person's data and generate insights:

${beliefsStr}

${patternsStr}

${memoriesStr}

What connections, contradictions, opportunities, or warnings do you see? Return JSON array only.`;

  try {
    const response = await completeText(prompt, systemPrompt, {
      temperature: 0.3,
      maxTokens: 2000,
    });

    // Parse JSON response - find the JSON array by matching balanced brackets
    let jsonStr: string | null = null;
    const startIdx = response.indexOf('[');
    if (startIdx === -1) {
      return [];
    }

    // Find matching closing bracket
    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx; i < response.length; i++) {
      if (response[i] === '[') depth++;
      if (response[i] === ']') depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }

    if (endIdx === -1) {
      return [];
    }

    jsonStr = response.substring(startIdx, endIdx + 1);

    const extracted = JSON.parse(jsonStr) as Array<{
      content: string;
      insight_type: string;
      priority: string;
      confidence: number;
      sources: Array<{
        type: string;
        id: string;
        contribution: string;
        explanation?: string;
      }>;
      reason?: string;
    }>;

    // Validate and filter
    const filtered = extracted
      .filter(
        (i) =>
          INSIGHT_TYPES.includes(i.insight_type as InsightType) &&
          INSIGHT_PRIORITIES.includes(i.priority as InsightPriority) &&
          i.content &&
          i.confidence >= 0.5 &&
          Array.isArray(i.sources)  // Just require sources array exists (can be empty)
      )
      .map((i) => ({
        content: i.content,
        insight_type: i.insight_type as InsightType,
        priority: i.priority as InsightPriority,
        confidence: Math.min(1.0, Math.max(0.0, i.confidence)),
        sources: i.sources
          .filter((s) => SOURCE_TYPES.includes(s.type as SourceType))
          .map((s) => ({
            type: s.type as SourceType,
            id: s.id,
            contribution: (['supports', 'primary', 'context', 'contrasts'].includes(s.contribution)
              ? s.contribution
              : 'supports') as 'supports' | 'primary' | 'context' | 'contrasts',
            explanation: s.explanation,
          })),
        reason: i.reason || '',
      }));

    return filtered;
  } catch (error) {
    console.error('Insight generation failed:', error);
    return [];
  }
}

// === INSIGHT SIMILARITY ===

/**
 * Find existing insight that matches (to avoid duplicates)
 */
export async function findSimilarInsight(
  content: string,
  insightType: InsightType
): Promise<Insight | null> {
  const normalized = content.toLowerCase().trim();

  const result = await pool.query<Insight>(
    `SELECT * FROM insights
     WHERE insight_type = $1
       AND status = 'active'
       AND LOWER(content) = $2
     LIMIT 1`,
    [insightType, normalized]
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  // TODO: Add embedding-based similarity search
  return null;
}

// === INSIGHT CRUD ===

/**
 * Create a new insight
 */
export async function createInsight(
  content: string,
  insightType: InsightType,
  confidence: number,
  priority: InsightPriority = 'medium',
  model?: string
): Promise<Insight> {
  const result = await pool.query<Insight>(
    `INSERT INTO insights (
       content, insight_type, confidence, priority,
       generated_by_model, generation_prompt_version
     )
     VALUES ($1, $2, $3, $4, $5, 'v1')
     RETURNING *`,
    [content, insightType, confidence, priority, model || null]
  );

  const insight = result.rows[0]!;

  // Broadcast to connected WebSocket clients (P6-T5)
  broadcastInsightCreated(insight);

  return insight;
}

/**
 * Get an insight by ID
 */
export async function getInsight(id: string): Promise<Insight | null> {
  const result = await pool.query<Insight>(
    `SELECT * FROM insights WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Get all insights with optional filters
 */
export async function getAllInsights(options?: {
  type?: InsightType;
  status?: InsightStatus;
  priority?: InsightPriority;
  minConfidence?: number;
  limit?: number;
}): Promise<Insight[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramCount = 0;

  if (options?.type) {
    paramCount++;
    conditions.push(`insight_type = $${paramCount}`);
    params.push(options.type);
  }

  if (options?.status) {
    paramCount++;
    conditions.push(`status = $${paramCount}`);
    params.push(options.status);
  } else {
    conditions.push(`status = 'active'`);
  }

  if (options?.priority) {
    paramCount++;
    conditions.push(`priority = $${paramCount}`);
    params.push(options.priority);
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

  const result = await pool.query<Insight>(
    `SELECT * FROM insights
     ${whereClause}
     ORDER BY
       CASE priority
         WHEN 'critical' THEN 1
         WHEN 'high' THEN 2
         WHEN 'medium' THEN 3
         WHEN 'low' THEN 4
       END,
       confidence DESC,
       created_at DESC
     LIMIT $${paramCount}`,
    params
  );
  return result.rows;
}

/**
 * Get insights by type
 */
export async function getInsightsByType(type: InsightType): Promise<Insight[]> {
  return getAllInsights({ type });
}

/**
 * Validate/reinforce an existing insight
 */
export async function validateInsight(insightId: string): Promise<Insight> {
  const result = await pool.query<Insight>(
    `UPDATE insights
     SET validation_count = validation_count + 1,
         last_validated_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [insightId]
  );

  if (!result.rows[0]) {
    throw new Error(`Insight not found: ${insightId}`);
  }
  return result.rows[0];
}

/**
 * Dismiss an insight (user says not relevant)
 */
export async function dismissInsight(
  insightId: string,
  reason?: string
): Promise<Insight> {
  const result = await pool.query<Insight>(
    `UPDATE insights
     SET status = 'dismissed',
         dismissed_reason = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [insightId, reason || null]
  );

  if (!result.rows[0]) {
    throw new Error(`Insight not found: ${insightId}`);
  }
  return result.rows[0];
}

/**
 * Mark insight as actioned (user did something about it)
 */
export async function actionInsight(insightId: string): Promise<Insight> {
  const result = await pool.query<Insight>(
    `UPDATE insights
     SET status = 'actioned',
         actioned_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [insightId]
  );

  if (!result.rows[0]) {
    throw new Error(`Insight not found: ${insightId}`);
  }
  return result.rows[0];
}

/**
 * Mark stale insights (not validated recently)
 */
export async function markStaleInsights(daysThreshold: number = 30): Promise<number> {
  const result = await pool.query(
    `UPDATE insights
     SET status = 'stale',
         updated_at = NOW()
     WHERE status = 'active'
       AND last_validated_at < NOW() - INTERVAL '1 day' * $1
     RETURNING id`,
    [daysThreshold]
  );
  return result.rowCount || 0;
}

// === SOURCE MANAGEMENT ===

/**
 * Link a source to an insight
 */
export async function linkSource(
  insightId: string,
  sourceType: SourceType,
  sourceId: string,
  contributionType: 'supports' | 'primary' | 'context' | 'contrasts' = 'supports',
  contributionStrength: number = 0.5,
  explanation?: string
): Promise<InsightSource> {
  const result = await pool.query<InsightSource>(
    `INSERT INTO insight_sources (
       insight_id, source_type, source_id,
       contribution_type, contribution_strength, explanation
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (insight_id, source_type, source_id)
     DO UPDATE SET contribution_type = $4, contribution_strength = $5, explanation = $6
     RETURNING *`,
    [insightId, sourceType, sourceId, contributionType, contributionStrength, explanation || null]
  );
  return result.rows[0]!;
}

/**
 * Get sources for an insight
 */
export async function getInsightSources(
  insightId: string
): Promise<Array<InsightSource & { source_content?: string }>> {
  // Get sources with their content (polymorphic join)
  const result = await pool.query<InsightSource & { source_content: string }>(
    `SELECT
       s.*,
       CASE s.source_type
         WHEN 'memory' THEN m.content
         WHEN 'belief' THEN b.content
         WHEN 'pattern' THEN p.content
       END as source_content
     FROM insight_sources s
     LEFT JOIN memories m ON s.source_type = 'memory' AND s.source_id = m.id
     LEFT JOIN beliefs b ON s.source_type = 'belief' AND s.source_id = b.id
     LEFT JOIN patterns p ON s.source_type = 'pattern' AND s.source_id = p.id
     WHERE s.insight_id = $1
     ORDER BY
       CASE s.contribution_type
         WHEN 'primary' THEN 1
         WHEN 'supports' THEN 2
         WHEN 'context' THEN 3
         WHEN 'contrasts' THEN 4
       END,
       s.contribution_strength DESC`,
    [insightId]
  );
  return result.rows;
}

/**
 * Get insights that reference a specific source
 */
export async function getInsightsBySource(
  sourceType: SourceType,
  sourceId: string
): Promise<Insight[]> {
  const result = await pool.query<Insight>(
    `SELECT i.*
     FROM insights i
     JOIN insight_sources s ON s.insight_id = i.id
     WHERE s.source_type = $1 AND s.source_id = $2 AND i.status = 'active'
     ORDER BY i.priority DESC, i.confidence DESC`,
    [sourceType, sourceId]
  );
  return result.rows;
}

// === STATISTICS ===

/**
 * Get insight statistics
 */
export async function getInsightStats(): Promise<{
  total: number;
  active: number;
  dismissed: number;
  actioned: number;
  stale: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  avgConfidence: number;
}> {
  const result = await pool.query<{
    total: string;
    active: string;
    dismissed: string;
    actioned: string;
    stale: string;
    avg_confidence: string;
  }>(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE status = 'dismissed') as dismissed,
      COUNT(*) FILTER (WHERE status = 'actioned') as actioned,
      COUNT(*) FILTER (WHERE status = 'stale') as stale,
      AVG(confidence) as avg_confidence
    FROM insights
  `);

  const byTypeResult = await pool.query<{ insight_type: string; count: string }>(`
    SELECT insight_type, COUNT(*) as count
    FROM insights
    WHERE status = 'active'
    GROUP BY insight_type
  `);

  const byPriorityResult = await pool.query<{ priority: string; count: string }>(`
    SELECT priority, COUNT(*) as count
    FROM insights
    WHERE status = 'active'
    GROUP BY priority
  `);

  const row = result.rows[0]!;
  const byType: Record<string, number> = {};
  for (const r of byTypeResult.rows) {
    byType[r.insight_type] = parseInt(r.count, 10);
  }
  const byPriority: Record<string, number> = {};
  for (const r of byPriorityResult.rows) {
    byPriority[r.priority] = parseInt(r.count, 10);
  }

  return {
    total: parseInt(row.total, 10),
    active: parseInt(row.active, 10),
    dismissed: parseInt(row.dismissed, 10),
    actioned: parseInt(row.actioned, 10),
    stale: parseInt(row.stale, 10),
    byType,
    byPriority,
    avgConfidence: parseFloat(row.avg_confidence) || 0,
  };
}

// === HELPERS ===

/**
 * Check if an insight type is valid
 */
export function isValidInsightType(type: string): type is InsightType {
  return INSIGHT_TYPES.includes(type as InsightType);
}

/**
 * Get human-readable description of insight type
 */
export function getInsightTypeDescription(type: InsightType): string {
  const descriptions: Record<InsightType, string> = {
    connection: 'Links between related concepts',
    contradiction: 'Inconsistencies in beliefs vs behaviors',
    opportunity: 'Potential improvements',
    warning: 'Potential issues or risks',
  };
  return descriptions[type];
}

/**
 * Get emoji for insight type
 */
export function getInsightTypeEmoji(type: InsightType): string {
  const emojis: Record<InsightType, string> = {
    connection: '\u{1F517}',    // link
    contradiction: '\u{26A0}',  // warning sign
    opportunity: '\u{1F4A1}',   // light bulb
    warning: '\u{1F6A8}',       // rotating light
  };
  return emojis[type];
}

/**
 * Get emoji for priority
 */
export function getPriorityEmoji(priority: InsightPriority): string {
  const emojis: Record<InsightPriority, string> = {
    low: '\u{25CB}',       // white circle
    medium: '\u{25D0}',    // half circle
    high: '\u{25CF}',      // black circle
    critical: '\u{1F534}', // red circle
  };
  return emojis[priority];
}

// === HIGH-LEVEL INTEGRATION ===

export interface InsightGenerationResult {
  created: Insight[];
  validated: Array<{ insight: Insight; wasValidated: boolean }>;
  staleMarked: number;
}

/**
 * Process insights during consolidation
 * Gathers context, generates new insights, validates existing ones
 */
export async function processInsightsForConsolidation(
  model?: string
): Promise<InsightGenerationResult> {
  const result: InsightGenerationResult = {
    created: [],
    validated: [],
    staleMarked: 0,
  };

  // Gather analysis context
  const beliefsResult = await pool.query<{
    id: string;
    content: string;
    belief_type: string;
    confidence: number;
  }>(
    `SELECT id, content, belief_type, confidence
     FROM beliefs
     WHERE status = 'active'
     ORDER BY confidence DESC
     LIMIT 20`
  );

  const patternsResult = await pool.query<{
    id: string;
    content: string;
    pattern_type: string;
    confidence: number;
    frequency: number;
  }>(
    `SELECT id, content, pattern_type, confidence, frequency
     FROM patterns
     WHERE status = 'active'
     ORDER BY confidence DESC
     LIMIT 20`
  );

  const memoriesResult = await pool.query<{
    id: string;
    content: string;
    created_at: Date;
  }>(
    `SELECT id, content, created_at
     FROM memories
     ORDER BY created_at DESC
     LIMIT 15`
  );

  const context: AnalysisContext = {
    beliefs: beliefsResult.rows.map((b) => ({
      id: b.id,
      content: b.content,
      type: b.belief_type,
      confidence: b.confidence,
    })),
    patterns: patternsResult.rows.map((p) => ({
      id: p.id,
      content: p.content,
      type: p.pattern_type,
      confidence: p.confidence,
      frequency: p.frequency,
    })),
    recentMemories: memoriesResult.rows,
  };

  // Generate new insights
  const extracted = await generateInsights(context);

  for (const ext of extracted) {
    // Check for existing similar insight
    const existing = await findSimilarInsight(ext.content, ext.insight_type);

    if (existing) {
      // Validate existing insight
      const validated = await validateInsight(existing.id);
      result.validated.push({ insight: validated, wasValidated: true });
    } else {
      // Create new insight
      const insight = await createInsight(
        ext.content,
        ext.insight_type,
        ext.confidence,
        ext.priority,
        model
      );

      // Link sources
      for (const source of ext.sources) {
        await linkSource(
          insight.id,
          source.type,
          source.id,
          source.contribution,
          ext.confidence,
          source.explanation
        );
      }

      result.created.push(insight);
    }
  }

  // Mark stale insights
  result.staleMarked = await markStaleInsights(30);

  return result;
}
