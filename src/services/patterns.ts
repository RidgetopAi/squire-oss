/**
 * Patterns Service (Slice 7B)
 *
 * Detects and manages recurring patterns from memories.
 * Supports behavioral, temporal, emotional, social, cognitive, and physical patterns.
 */

import { pool } from '../db/pool.js';
import { completeText } from '../providers/llm.js';

// === TYPES ===

export const PATTERN_TYPES = [
  'behavioral',    // recurring actions/habits ("checks email first thing")
  'temporal',      // time-based rhythms ("most productive afternoons")
  'emotional',     // emotional tendencies ("anxious before presentations")
  'social',        // interaction patterns ("avoids large meetings")
  'cognitive',     // thinking patterns ("overthinks decisions")
  'physical',      // body/health patterns ("tired after lunch")
] as const;

export type PatternType = (typeof PATTERN_TYPES)[number];

export const TIME_OF_DAY = [
  'early_morning', 'morning', 'midday', 'afternoon', 'evening', 'night', 'late_night',
] as const;

export type TimeOfDay = (typeof TIME_OF_DAY)[number];

export const DAY_OF_WEEK = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'weekday', 'weekend',
] as const;

export type DayOfWeek = (typeof DAY_OF_WEEK)[number];

export interface Pattern {
  id: string;
  content: string;
  pattern_type: PatternType;
  related_entity_id: string | null;
  confidence: number;
  frequency: number;
  time_of_day: TimeOfDay | null;
  day_of_week: DayOfWeek | null;
  time_span_days: number | null;
  source_memory_count: number;
  first_detected_at: Date;
  last_observed_at: Date | null;
  observation_count: number;
  status: 'active' | 'dormant' | 'disproven';
  dormant_since: Date | null;
  detected_by_model: string | null;
  detection_prompt_version: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PatternEvidence {
  id: string;
  pattern_id: string;
  memory_id: string;
  evidence_strength: number;
  evidence_type: 'demonstrates' | 'contradicts' | 'triggers' | 'context';
  memory_timestamp: Date | null;
  extracted_at: Date;
}

interface ExtractedPattern {
  content: string;
  pattern_type: PatternType;
  confidence: number;
  frequency?: number;
  time_of_day?: TimeOfDay;
  day_of_week?: DayOfWeek;
  entity_name?: string;
  reason: string;
}

// === PATTERN EXTRACTION ===

/**
 * Extract patterns from a memory's content using LLM
 */
async function extractPatternsFromContent(
  content: string,
  existingPatterns: Pattern[] = []
): Promise<ExtractedPattern[]> {
  const systemPrompt = `You are a pattern detector. Given a memory/observation, identify any recurring patterns this might indicate about the person.

A pattern is a recurring behavior, tendency, or rhythm - NOT a one-time event.

Pattern types:
- behavioral: Recurring actions/habits ("checks email first thing", "procrastinates on complex tasks")
- temporal: Time-based rhythms ("most productive in the morning", "energy dips after lunch")
- emotional: Emotional tendencies ("gets anxious before presentations", "energized by deadlines")
- social: Interaction patterns ("prefers 1-on-1 meetings", "avoids large groups")
- cognitive: Thinking patterns ("overthinks decisions", "thinks best while walking")
- physical: Body/health patterns ("tired after lunch", "exercises when stressed")

Time indicators (optional):
- time_of_day: early_morning, morning, midday, afternoon, evening, night, late_night
- day_of_week: monday, tuesday, etc., or weekday/weekend

Return ONLY a JSON array of patterns. Include confidence (0.0-1.0) and frequency (0.0=rare, 1.0=constant).
If no patterns are present, return an empty array: []

Format: [{"content": "pattern description", "pattern_type": "type", "confidence": 0.X, "frequency": 0.X, "time_of_day": "morning" or null, "day_of_week": "monday" or null, "entity_name": "name if about specific person/project", "reason": "why this is a pattern"}]`;

  const existingInfo = existingPatterns.length > 0
    ? `\n\nExisting patterns (check for reinforcement):\n${existingPatterns.map((p) => `- ${p.content}`).join('\n')}`
    : '';

  const prompt = `Memory: "${content}"${existingInfo}

What patterns does this memory reveal or reinforce? Return JSON array only.`;

  try {
    const response = await completeText(prompt, systemPrompt, {
      temperature: 0.2,
      maxTokens: 600,
    });

    // Parse JSON response
    const jsonMatch = response.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return [];
    }

    const extracted = JSON.parse(jsonMatch[0]) as Array<{
      content: string;
      pattern_type: string;
      confidence: number;
      frequency?: number;
      time_of_day?: string;
      day_of_week?: string;
      entity_name?: string;
      reason?: string;
    }>;

    // Validate and filter
    return extracted
      .filter(
        (p) =>
          PATTERN_TYPES.includes(p.pattern_type as PatternType) &&
          p.content &&
          p.confidence >= 0.3
      )
      .map((p) => ({
        content: p.content,
        pattern_type: p.pattern_type as PatternType,
        confidence: Math.min(1.0, Math.max(0.0, p.confidence)),
        frequency: p.frequency ? Math.min(1.0, Math.max(0.0, p.frequency)) : undefined,
        time_of_day: TIME_OF_DAY.includes(p.time_of_day as TimeOfDay)
          ? (p.time_of_day as TimeOfDay)
          : undefined,
        day_of_week: DAY_OF_WEEK.includes(p.day_of_week as DayOfWeek)
          ? (p.day_of_week as DayOfWeek)
          : undefined,
        entity_name: p.entity_name,
        reason: p.reason || '',
      }));
  } catch (error) {
    console.error('Pattern extraction failed:', error);
    return [];
  }
}

// === PATTERN SIMILARITY ===

/**
 * Find existing pattern that matches (for reinforcement vs creation)
 */
async function findSimilarPattern(
  content: string,
  patternType: PatternType
): Promise<Pattern | null> {
  // Normalize for comparison
  const normalized = content.toLowerCase().trim();

  // Look for patterns of same type with similar content
  const result = await pool.query<Pattern>(
    `SELECT * FROM patterns
     WHERE pattern_type = $1
       AND status = 'active'
       AND LOWER(content) = $2
     LIMIT 1`,
    [patternType, normalized]
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  // TODO: Add embedding-based similarity search
  return null;
}

// === PATTERN CRUD ===

/**
 * Create a new pattern
 */
async function createPattern(
  content: string,
  patternType: PatternType,
  confidence: number,
  options?: {
    frequency?: number;
    timeOfDay?: TimeOfDay;
    dayOfWeek?: DayOfWeek;
    relatedEntityId?: string;
    model?: string;
  }
): Promise<Pattern> {
  const result = await pool.query<Pattern>(
    `INSERT INTO patterns (
       content, pattern_type, related_entity_id, confidence, frequency,
       time_of_day, day_of_week,
       detected_by_model, detection_prompt_version
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'v1')
     RETURNING *`,
    [
      content,
      patternType,
      options?.relatedEntityId || null,
      confidence,
      options?.frequency || 0.5,
      options?.timeOfDay || null,
      options?.dayOfWeek || null,
      options?.model || null,
    ]
  );
  return result.rows[0]!;
}

/**
 * Get a pattern by ID
 */
export async function getPattern(id: string): Promise<Pattern | null> {
  const result = await pool.query<Pattern>(
    `SELECT * FROM patterns WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Get all patterns with optional filters
 */
export async function getAllPatterns(options?: {
  type?: PatternType;
  status?: string;
  minConfidence?: number;
  timeOfDay?: TimeOfDay;
  dayOfWeek?: DayOfWeek;
  limit?: number;
}): Promise<Pattern[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramCount = 0;

  if (options?.type) {
    paramCount++;
    conditions.push(`pattern_type = $${paramCount}`);
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

  if (options?.timeOfDay) {
    paramCount++;
    conditions.push(`time_of_day = $${paramCount}`);
    params.push(options.timeOfDay);
  }

  if (options?.dayOfWeek) {
    paramCount++;
    conditions.push(`day_of_week = $${paramCount}`);
    params.push(options.dayOfWeek);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const limit = options?.limit || 100;
  paramCount++;
  params.push(limit);

  const result = await pool.query<Pattern>(
    `SELECT * FROM patterns
     ${whereClause}
     ORDER BY confidence DESC, observation_count DESC
     LIMIT $${paramCount}`,
    params
  );
  return result.rows;
}

/**
 * Get patterns by type
 */
export async function getPatternsByType(type: PatternType): Promise<Pattern[]> {
  return getAllPatterns({ type });
}

/**
 * Get patterns about a specific entity
 */
export async function getPatternsByEntity(entityId: string): Promise<Pattern[]> {
  const result = await pool.query<Pattern>(
    `SELECT * FROM patterns
     WHERE related_entity_id = $1 AND status = 'active'
     ORDER BY confidence DESC`,
    [entityId]
  );
  return result.rows;
}

/**
 * Reinforce an existing pattern (new evidence found)
 */
async function reinforcePattern(
  patternId: string,
  confidenceBoost: number = 0.05
): Promise<Pattern> {
  const result = await pool.query<Pattern>(
    `UPDATE patterns
     SET confidence = LEAST(1.0, confidence + $2),
         observation_count = observation_count + 1,
         last_observed_at = NOW(),
         status = 'active',
         dormant_since = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [patternId, confidenceBoost]
  );

  if (!result.rows[0]) {
    throw new Error(`Pattern not found: ${patternId}`);
  }
  return result.rows[0];
}


// === EVIDENCE MANAGEMENT ===

/**
 * Link a memory as evidence for a pattern
 */
async function linkEvidence(
  patternId: string,
  memoryId: string,
  evidenceStrength: number,
  evidenceType: 'demonstrates' | 'contradicts' | 'triggers' | 'context' = 'demonstrates',
  memoryTimestamp?: Date
): Promise<PatternEvidence> {
  const result = await pool.query<PatternEvidence>(
    `INSERT INTO pattern_evidence (pattern_id, memory_id, evidence_strength, evidence_type, memory_timestamp)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (pattern_id, memory_id)
     DO UPDATE SET evidence_strength = $3, evidence_type = $4
     RETURNING *`,
    [patternId, memoryId, evidenceStrength, evidenceType, memoryTimestamp || null]
  );

  // Update source memory count
  await pool.query(
    `UPDATE patterns
     SET source_memory_count = (
       SELECT COUNT(*) FROM pattern_evidence WHERE pattern_id = $1
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [patternId]
  );

  return result.rows[0]!;
}

/**
 * Get evidence for a pattern
 */
export async function getPatternEvidence(
  patternId: string
): Promise<Array<PatternEvidence & { memory_content: string }>> {
  const result = await pool.query<PatternEvidence & { memory_content: string }>(
    `SELECT pe.*, m.content as memory_content
     FROM pattern_evidence pe
     JOIN memories m ON m.id = pe.memory_id
     WHERE pe.pattern_id = $1
     ORDER BY pe.evidence_strength DESC`,
    [patternId]
  );
  return result.rows;
}

// === DORMANCY DETECTION ===

/**
 * Mark stale patterns as dormant
 */
export async function markStalePatternsDormant(daysThreshold: number = 30): Promise<number> {
  const result = await pool.query(
    `UPDATE patterns
     SET status = 'dormant',
         dormant_since = NOW(),
         updated_at = NOW()
     WHERE status = 'active'
       AND last_observed_at < NOW() - INTERVAL '1 day' * $1
     RETURNING id`,
    [daysThreshold]
  );
  return result.rowCount || 0;
}

// === STATISTICS ===

/**
 * Get pattern statistics
 */
export async function getPatternStats(): Promise<{
  total: number;
  active: number;
  dormant: number;
  disproven: number;
  byType: Record<string, number>;
  avgConfidence: number;
  avgFrequency: number;
}> {
  const result = await pool.query<{
    total: string;
    active: string;
    dormant: string;
    disproven: string;
    avg_confidence: string;
    avg_frequency: string;
  }>(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE status = 'dormant') as dormant,
      COUNT(*) FILTER (WHERE status = 'disproven') as disproven,
      AVG(confidence) as avg_confidence,
      AVG(frequency) as avg_frequency
    FROM patterns
  `);

  const byTypeResult = await pool.query<{ pattern_type: string; count: string }>(`
    SELECT pattern_type, COUNT(*) as count
    FROM patterns
    WHERE status = 'active'
    GROUP BY pattern_type
  `);

  const row = result.rows[0]!;
  const byType: Record<string, number> = {};
  for (const r of byTypeResult.rows) {
    byType[r.pattern_type] = parseInt(r.count, 10);
  }

  return {
    total: parseInt(row.total, 10),
    active: parseInt(row.active, 10),
    dormant: parseInt(row.dormant, 10),
    disproven: parseInt(row.disproven, 10),
    byType,
    avgConfidence: parseFloat(row.avg_confidence) || 0,
    avgFrequency: parseFloat(row.avg_frequency) || 0,
  };
}

// === HELPERS ===

/**
 * Check if a pattern type is valid
 */
export function isValidPatternType(type: string): type is PatternType {
  return PATTERN_TYPES.includes(type as PatternType);
}

/**
 * Get human-readable description of pattern type
 */
export function getPatternTypeDescription(type: PatternType): string {
  const descriptions: Record<PatternType, string> = {
    behavioral: 'Recurring actions and habits',
    temporal: 'Time-based rhythms and cycles',
    emotional: 'Emotional tendencies and reactions',
    social: 'Interaction and relationship patterns',
    cognitive: 'Thinking and decision patterns',
    physical: 'Body and health patterns',
  };
  return descriptions[type];
}

// === HIGH-LEVEL INTEGRATION ===

export interface PatternDetectionResult {
  created: Pattern[];
  reinforced: Array<{ pattern: Pattern; wasReinforced: boolean }>;
}

/**
 * Process a memory for patterns: extract, create/reinforce
 * Called from observe or consolidation flow
 */
export async function processMemoryForPatterns(
  memoryId: string,
  content: string,
  memoryTimestamp?: Date,
  model?: string
): Promise<PatternDetectionResult> {
  const result: PatternDetectionResult = {
    created: [],
    reinforced: [],
  };

  // Get existing patterns for context
  const existingPatterns = await getAllPatterns({ status: 'active', limit: 50 });

  // Extract patterns from content
  const extracted = await extractPatternsFromContent(content, existingPatterns);
  if (extracted.length === 0) {
    return result;
  }

  for (const ext of extracted) {
    // Check if similar pattern already exists
    const existing = await findSimilarPattern(ext.content, ext.pattern_type);

    if (existing) {
      // Reinforce existing pattern
      const reinforced = await reinforcePattern(existing.id, 0.03);
      await linkEvidence(existing.id, memoryId, ext.confidence, 'demonstrates', memoryTimestamp);
      result.reinforced.push({ pattern: reinforced, wasReinforced: true });
    } else {
      // Create new pattern
      const pattern = await createPattern(ext.content, ext.pattern_type, ext.confidence, {
        frequency: ext.frequency,
        timeOfDay: ext.time_of_day,
        dayOfWeek: ext.day_of_week,
        model,
      });
      await linkEvidence(pattern.id, memoryId, ext.confidence, 'demonstrates', memoryTimestamp);
      result.created.push(pattern);
    }
  }

  return result;
}
