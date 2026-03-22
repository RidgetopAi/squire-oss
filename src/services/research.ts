/**
 * Active Research Service (Slice 7D)
 *
 * Proactively identifies knowledge gaps and generates smart questions.
 * This is about what we DON'T know - the negative space in the knowledge graph.
 */

import { pool } from '../db/pool.js';
import { completeText } from '../providers/llm.js';

// === TYPES: GAPS ===

export const GAP_TYPES = [
  'entity',       // missing facts about a person/project/place
  'relationship', // don't know how two entities relate
  'timeline',     // missing when something happened
  'outcome',      // know something started but not how it ended
  'context',      // have facts but lack why/how explanation
  'commitment',   // open-ended promise without resolution
  'preference',   // don't know user's preference on something
  'history',      // missing backstory or past events
] as const;

export type GapType = (typeof GAP_TYPES)[number];

export const GAP_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type GapPriority = (typeof GAP_PRIORITIES)[number];

export const GAP_STATUSES = ['open', 'partially_filled', 'filled', 'dismissed'] as const;
export type GapStatus = (typeof GAP_STATUSES)[number];

export interface KnowledgeGap {
  id: string;
  content: string;
  gap_type: GapType;
  related_entity_id: string | null;
  secondary_entity_id: string | null;
  priority: GapPriority;
  severity: number;
  status: GapStatus;
  partially_filled_at: Date | null;
  filled_at: Date | null;
  dismissed_reason: string | null;
  detected_by_model: string | null;
  detection_prompt_version: string | null;
  detection_context: string | null;
  times_surfaced: number;
  last_surfaced_at: Date;
  created_at: Date;
  updated_at: Date;
}

// === TYPES: QUESTIONS ===

export const QUESTION_TYPES = [
  'clarification', // "What did you mean by X?"
  'follow_up',     // "How did [event] go?"
  'exploration',   // "Tell me more about [topic]"
  'verification',  // "Is it still true that X?"
  'deepening',     // "What made you feel that way?"
  'connection',    // "How does X relate to Y?"
  'outcome',       // "What happened with X?"
  'preference',    // "Would you prefer X or Y?"
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const TIMING_HINTS = [
  'immediately',     // ask right away
  'next_session',    // ask at start of next conversation
  'when_relevant',   // ask when topic comes up naturally
  'periodic',        // ask periodically to verify
  'before_deadline', // ask before a commitment deadline
] as const;

export type TimingHint = (typeof TIMING_HINTS)[number];

export const QUESTION_STATUSES = ['pending', 'asked', 'answered', 'dismissed', 'expired'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export interface ResearchQuestion {
  id: string;
  content: string;
  question_type: QuestionType;
  gap_id: string | null;
  related_entity_id: string | null;
  priority: GapPriority;
  timing_hint: TimingHint | null;
  status: QuestionStatus;
  asked_at: Date | null;
  answered_at: Date | null;
  answer: string | null;
  answer_memory_id: string | null;
  usefulness_score: number | null;
  generated_by_model: string | null;
  generation_prompt_version: string | null;
  expires_at: Date | null;
  expired_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

// === TYPES: SOURCES ===

const GAP_SOURCE_TYPES = ['memory', 'belief', 'pattern', 'entity', 'insight'] as const;
export type GapSourceType = (typeof GAP_SOURCE_TYPES)[number];

const QUESTION_SOURCE_TYPES = ['memory', 'belief', 'pattern', 'entity', 'insight', 'gap'] as const;
export type QuestionSourceType = (typeof QUESTION_SOURCE_TYPES)[number];

export interface GapSource {
  id: string;
  gap_id: string;
  source_type: GapSourceType;
  source_id: string;
  revelation_type: 'indicates' | 'primary' | 'context' | 'deepens';
  explanation: string | null;
  added_at: Date;
}

export interface QuestionSource {
  id: string;
  question_id: string;
  source_type: QuestionSourceType;
  source_id: string;
  relation_type: 'prompted' | 'context' | 'about';
  explanation: string | null;
  added_at: Date;
}

// === EXTRACTED TYPES (from LLM) ===

export interface ExtractedGap {
  content: string;
  gap_type: GapType;
  priority: GapPriority;
  severity: number;
  related_entity_name?: string;
  secondary_entity_name?: string;
  sources: Array<{
    type: GapSourceType;
    id: string;
    revelation: 'indicates' | 'primary' | 'context' | 'deepens';
    explanation?: string;
  }>;
  reason: string;
}

export interface ExtractedQuestion {
  content: string;
  question_type: QuestionType;
  priority: GapPriority;
  timing_hint?: TimingHint;
  for_gap_content?: string; // matches to gap.content
  related_entity_name?: string;
  sources: Array<{
    type: QuestionSourceType;
    id: string;
    relation: 'prompted' | 'context' | 'about';
    explanation?: string;
  }>;
  reason: string;
}

// === GAP DETECTION ===

interface GapDetectionContext {
  entities: Array<{ id: string; name: string; type: string; description: string | null; mention_count: number }>;
  beliefs: Array<{ id: string; content: string; type: string; confidence: number }>;
  patterns: Array<{ id: string; content: string; type: string }>;
  recentMemories: Array<{ id: string; content: string; created_at: Date }>;
  commitments: string; // living summary for commitments
}

/**
 * Detect knowledge gaps from analyzing entities, beliefs, patterns, and memories
 */
async function detectGaps(
  context: GapDetectionContext
): Promise<ExtractedGap[]> {
  if (context.entities.length === 0 && context.recentMemories.length === 0) {
    return [];
  }

  const systemPrompt = `You are a knowledge gap detector. Given a person's data, identify what is MISSING or UNKNOWN.

A knowledge gap is NOT what we know - it's what we DON'T know but SHOULD know.

Gap types:
- entity: Missing facts about a person/project/place ("We don't know Sarah's role")
- relationship: Don't know how two entities relate ("Unclear how Project X connects to Team Y")
- timeline: Missing when something happened ("When did the promotion happen?")
- outcome: Know something started but not how it ended ("The interview - what was the result?")
- context: Have facts but lack why/how ("Why was this decision made?")
- commitment: Open promise without resolution ("Promised to help with X - still pending?")
- preference: Don't know user's stance on something ("Unclear preference on remote vs office")
- history: Missing backstory ("How did you meet Sarah?")

Priority levels: low, medium, high, critical
Severity: 0.0 (minor) to 1.0 (critical gap)

Requirements:
1. Focus on ACTIONABLE gaps - things worth knowing
2. Avoid trivial gaps ("We don't know their shoe size")
3. Prioritize gaps about frequently mentioned entities
4. Look for incomplete stories (started but no ending)
5. Look for relationships without context

Return ONLY a JSON array. If no meaningful gaps, return: []

Format: [{
  "content": "description of the gap",
  "gap_type": "entity|relationship|timeline|outcome|context|commitment|preference|history",
  "priority": "low|medium|high|critical",
  "severity": 0.X,
  "related_entity_name": "optional entity name",
  "secondary_entity_name": "optional for relationship gaps",
  "sources": [
    {"type": "memory|belief|pattern|entity", "id": "uuid", "revelation": "indicates|primary|context|deepens", "explanation": "why this reveals the gap"}
  ],
  "reason": "why this gap matters"
}]`;

  // Build context string
  const entitiesStr = context.entities.length > 0
    ? `ENTITIES (people, projects, places):\n${context.entities.map((e) =>
        `- [${e.id}] ${e.name} (${e.type}, ${e.mention_count} mentions)${e.description ? `: ${e.description}` : ''}`
      ).join('\n')}`
    : 'ENTITIES: None extracted yet';

  const beliefsStr = context.beliefs.length > 0
    ? `BELIEFS:\n${context.beliefs.map((b) => `- [${b.id}] (${b.type}): "${b.content}"`).join('\n')}`
    : 'BELIEFS: None recorded';

  const patternsStr = context.patterns.length > 0
    ? `PATTERNS:\n${context.patterns.map((p) => `- [${p.id}] (${p.type}): "${p.content}"`).join('\n')}`
    : 'PATTERNS: None detected';

  const memoriesStr = context.recentMemories.length > 0
    ? `RECENT MEMORIES:\n${context.recentMemories.slice(0, 15).map((m) =>
        `- [${m.id}]: "${m.content.slice(0, 300)}${m.content.length > 300 ? '...' : ''}"`
      ).join('\n')}`
    : 'RECENT MEMORIES: None';

  const commitmentsStr = context.commitments
    ? `COMMITMENTS SUMMARY:\n${context.commitments}`
    : 'COMMITMENTS: No summary yet';

  const prompt = `Analyze this person's data and identify knowledge gaps - what DON'T we know that we SHOULD know?

${entitiesStr}

${beliefsStr}

${patternsStr}

${memoriesStr}

${commitmentsStr}

What's missing? What incomplete stories exist? What relationships lack context? Return JSON array only.`;

  try {
    const response = await completeText(prompt, systemPrompt, {
      temperature: 0.3,
      maxTokens: 2000,
    });

    const jsonStr = extractJsonArray(response);
    if (!jsonStr) return [];

    const extracted = JSON.parse(jsonStr) as Array<{
      content: string;
      gap_type: string;
      priority: string;
      severity: number;
      related_entity_name?: string;
      secondary_entity_name?: string;
      sources: Array<{
        type: string;
        id: string;
        revelation: string;
        explanation?: string;
      }>;
      reason?: string;
    }>;

    // Validate and filter
    return extracted
      .filter(
        (g) =>
          GAP_TYPES.includes(g.gap_type as GapType) &&
          GAP_PRIORITIES.includes(g.priority as GapPriority) &&
          g.content &&
          g.severity >= 0 && g.severity <= 1
      )
      .map((g) => ({
        content: g.content,
        gap_type: g.gap_type as GapType,
        priority: g.priority as GapPriority,
        severity: Math.min(1.0, Math.max(0.0, g.severity)),
        related_entity_name: g.related_entity_name,
        secondary_entity_name: g.secondary_entity_name,
        sources: (g.sources || [])
          .filter((s) => GAP_SOURCE_TYPES.includes(s.type as GapSourceType))
          .map((s) => ({
            type: s.type as GapSourceType,
            id: s.id,
            revelation: (['indicates', 'primary', 'context', 'deepens'].includes(s.revelation)
              ? s.revelation
              : 'indicates') as 'indicates' | 'primary' | 'context' | 'deepens',
            explanation: s.explanation,
          })),
        reason: g.reason || '',
      }));
  } catch (error) {
    console.error('Gap detection failed:', error);
    return [];
  }
}

// === QUESTION GENERATION ===

interface QuestionGenerationContext {
  gaps: Array<{ id: string; content: string; type: string; priority: string; severity: number }>;
  entities: Array<{ id: string; name: string; type: string }>;
  recentMemories: Array<{ id: string; content: string; created_at: Date }>;
  existingQuestions: Array<{ content: string; status: string }>;
}

/**
 * Generate smart questions to ask the user
 */
async function generateQuestions(
  context: QuestionGenerationContext
): Promise<ExtractedQuestion[]> {
  const systemPrompt = `You are a thoughtful question generator. Given knowledge gaps and context, generate smart questions to ask.

A good question:
- Is specific and answerable
- Addresses an important gap
- Is appropriately timed (not intrusive)
- Shows the system "cares" about understanding the user

Question types:
- clarification: "What did you mean by X?"
- follow_up: "How did the meeting with Sarah go?"
- exploration: "Tell me more about Project Alpha"
- verification: "Is it still true that X?"
- deepening: "What made you feel that way about X?"
- connection: "How does X relate to Y?"
- outcome: "What happened with the interview?"
- preference: "Do you prefer mornings or evenings for deep work?"

Timing hints:
- immediately: Ask right now (urgent or time-sensitive)
- next_session: Ask at start of next conversation
- when_relevant: Ask when the topic comes up naturally
- periodic: Ask periodically to verify (preferences, ongoing situations)
- before_deadline: Ask before a commitment deadline

Requirements:
1. Each question should address a specific gap or expand understanding
2. Don't generate duplicate or very similar questions
3. Prioritize questions about high-severity gaps
4. Be conversational, not interrogative
5. Maximum 5-7 questions per generation

Return ONLY a JSON array. If no good questions, return: []

Format: [{
  "content": "the question to ask",
  "question_type": "clarification|follow_up|exploration|verification|deepening|connection|outcome|preference",
  "priority": "low|medium|high|critical",
  "timing_hint": "immediately|next_session|when_relevant|periodic|before_deadline",
  "for_gap_content": "optional - content of the gap this addresses",
  "related_entity_name": "optional entity name",
  "sources": [
    {"type": "memory|belief|pattern|entity|insight|gap", "id": "uuid", "relation": "prompted|context|about", "explanation": "how this source relates"}
  ],
  "reason": "why this question matters"
}]`;

  // Build context string
  const gapsStr = context.gaps.length > 0
    ? `KNOWLEDGE GAPS TO ADDRESS:\n${context.gaps.map((g) =>
        `- [${g.id}] (${g.type}, ${g.priority}, severity: ${g.severity.toFixed(2)}): "${g.content}"`
      ).join('\n')}`
    : 'GAPS: None identified yet';

  const entitiesStr = context.entities.length > 0
    ? `KEY ENTITIES:\n${context.entities.map((e) => `- [${e.id}] ${e.name} (${e.type})`).join('\n')}`
    : 'ENTITIES: None';

  const memoriesStr = context.recentMemories.length > 0
    ? `RECENT MEMORIES:\n${context.recentMemories.slice(0, 10).map((m) =>
        `- [${m.id}]: "${m.content.slice(0, 200)}..."`
      ).join('\n')}`
    : 'RECENT MEMORIES: None';

  const existingStr = context.existingQuestions.length > 0
    ? `ALREADY ASKED/PENDING (do not duplicate):\n${context.existingQuestions.map((q) =>
        `- (${q.status}): "${q.content}"`
      ).join('\n')}`
    : 'EXISTING QUESTIONS: None';

  const prompt = `Generate thoughtful questions to ask this person to fill knowledge gaps and deepen understanding.

${gapsStr}

${entitiesStr}

${memoriesStr}

${existingStr}

What questions would help us understand them better? Return JSON array only.`;

  try {
    const response = await completeText(prompt, systemPrompt, {
      temperature: 0.4, // slightly higher for varied questions
      maxTokens: 2000,
    });

    const jsonStr = extractJsonArray(response);
    if (!jsonStr) return [];

    const extracted = JSON.parse(jsonStr) as Array<{
      content: string;
      question_type: string;
      priority: string;
      timing_hint?: string;
      for_gap_content?: string;
      related_entity_name?: string;
      sources: Array<{
        type: string;
        id: string;
        relation: string;
        explanation?: string;
      }>;
      reason?: string;
    }>;

    // Validate and filter
    return extracted
      .filter(
        (q) =>
          QUESTION_TYPES.includes(q.question_type as QuestionType) &&
          GAP_PRIORITIES.includes(q.priority as GapPriority) &&
          q.content
      )
      .map((q) => ({
        content: q.content,
        question_type: q.question_type as QuestionType,
        priority: q.priority as GapPriority,
        timing_hint: q.timing_hint && TIMING_HINTS.includes(q.timing_hint as TimingHint)
          ? q.timing_hint as TimingHint
          : undefined,
        for_gap_content: q.for_gap_content,
        related_entity_name: q.related_entity_name,
        sources: (q.sources || [])
          .filter((s) => QUESTION_SOURCE_TYPES.includes(s.type as QuestionSourceType))
          .map((s) => ({
            type: s.type as QuestionSourceType,
            id: s.id,
            relation: (['prompted', 'context', 'about'].includes(s.relation)
              ? s.relation
              : 'prompted') as 'prompted' | 'context' | 'about',
            explanation: s.explanation,
          })),
        reason: q.reason || '',
      }));
  } catch (error) {
    console.error('Question generation failed:', error);
    return [];
  }
}

// === GAP SIMILARITY ===

/**
 * Find existing gap that matches (to avoid duplicates)
 */
async function findSimilarGap(
  content: string,
  gapType: GapType
): Promise<KnowledgeGap | null> {
  const normalized = content.toLowerCase().trim();

  const result = await pool.query<KnowledgeGap>(
    `SELECT * FROM knowledge_gaps
     WHERE gap_type = $1
       AND status = 'open'
       AND LOWER(content) = $2
     LIMIT 1`,
    [gapType, normalized]
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  // TODO: Add embedding-based similarity search
  return null;
}

/**
 * Find existing question that matches (to avoid duplicates)
 */
async function findSimilarQuestion(
  content: string,
  questionType: QuestionType
): Promise<ResearchQuestion | null> {
  const normalized = content.toLowerCase().trim();

  const result = await pool.query<ResearchQuestion>(
    `SELECT * FROM research_questions
     WHERE question_type = $1
       AND status IN ('pending', 'asked')
       AND LOWER(content) = $2
     LIMIT 1`,
    [questionType, normalized]
  );

  return result.rows[0] || null;
}

// === GAP CRUD ===

/**
 * Create a new knowledge gap
 */
async function createGap(
  content: string,
  gapType: GapType,
  severity: number,
  priority: GapPriority = 'medium',
  relatedEntityId?: string,
  secondaryEntityId?: string,
  model?: string,
  detectionContext?: string
): Promise<KnowledgeGap> {
  const result = await pool.query<KnowledgeGap>(
    `INSERT INTO knowledge_gaps (
       content, gap_type, severity, priority,
       related_entity_id, secondary_entity_id,
       detected_by_model, detection_prompt_version, detection_context
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'v1', $8)
     RETURNING *`,
    [content, gapType, severity, priority, relatedEntityId || null, secondaryEntityId || null, model || null, detectionContext || null]
  );
  return result.rows[0]!;
}

/**
 * Get a gap by ID
 */
export async function getGap(id: string): Promise<KnowledgeGap | null> {
  const result = await pool.query<KnowledgeGap>(
    `SELECT * FROM knowledge_gaps WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Get all gaps with optional filters
 */
export async function getAllGaps(options?: {
  type?: GapType;
  status?: GapStatus;
  priority?: GapPriority;
  entityId?: string;
  minSeverity?: number;
  limit?: number;
}): Promise<KnowledgeGap[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramCount = 0;

  if (options?.type) {
    paramCount++;
    conditions.push(`gap_type = $${paramCount}`);
    params.push(options.type);
  }

  if (options?.status) {
    paramCount++;
    conditions.push(`status = $${paramCount}`);
    params.push(options.status);
  } else {
    conditions.push(`status = 'open'`);
  }

  if (options?.priority) {
    paramCount++;
    conditions.push(`priority = $${paramCount}`);
    params.push(options.priority);
  }

  if (options?.entityId) {
    paramCount++;
    conditions.push(`(related_entity_id = $${paramCount} OR secondary_entity_id = $${paramCount})`);
    params.push(options.entityId);
  }

  if (options?.minSeverity !== undefined) {
    paramCount++;
    conditions.push(`severity >= $${paramCount}`);
    params.push(options.minSeverity);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const limit = options?.limit || 100;
  paramCount++;
  params.push(limit);

  const result = await pool.query<KnowledgeGap>(
    `SELECT * FROM knowledge_gaps
     ${whereClause}
     ORDER BY
       CASE priority
         WHEN 'critical' THEN 1
         WHEN 'high' THEN 2
         WHEN 'medium' THEN 3
         WHEN 'low' THEN 4
       END,
       severity DESC,
       times_surfaced DESC
     LIMIT $${paramCount}`,
    params
  );
  return result.rows;
}

/**
 * Surface a gap (increment times_surfaced)
 */
async function surfaceGap(gapId: string): Promise<KnowledgeGap> {
  const result = await pool.query<KnowledgeGap>(
    `UPDATE knowledge_gaps
     SET times_surfaced = times_surfaced + 1,
         last_surfaced_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [gapId]
  );

  if (!result.rows[0]) {
    throw new Error(`Gap not found: ${gapId}`);
  }
  return result.rows[0];
}

/**
 * Partially fill a gap
 */
export async function partiallyFillGap(gapId: string): Promise<KnowledgeGap> {
  const result = await pool.query<KnowledgeGap>(
    `UPDATE knowledge_gaps
     SET status = 'partially_filled',
         partially_filled_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [gapId]
  );

  if (!result.rows[0]) {
    throw new Error(`Gap not found: ${gapId}`);
  }
  return result.rows[0];
}

/**
 * Fully fill a gap
 */
export async function fillGap(gapId: string): Promise<KnowledgeGap> {
  const result = await pool.query<KnowledgeGap>(
    `UPDATE knowledge_gaps
     SET status = 'filled',
         filled_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [gapId]
  );

  if (!result.rows[0]) {
    throw new Error(`Gap not found: ${gapId}`);
  }
  return result.rows[0];
}

/**
 * Dismiss a gap
 */
export async function dismissGap(gapId: string, reason?: string): Promise<KnowledgeGap> {
  const result = await pool.query<KnowledgeGap>(
    `UPDATE knowledge_gaps
     SET status = 'dismissed',
         dismissed_reason = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [gapId, reason || null]
  );

  if (!result.rows[0]) {
    throw new Error(`Gap not found: ${gapId}`);
  }
  return result.rows[0];
}

// === QUESTION CRUD ===

/**
 * Create a new research question
 */
async function createQuestion(
  content: string,
  questionType: QuestionType,
  priority: GapPriority = 'medium',
  gapId?: string,
  relatedEntityId?: string,
  timingHint?: TimingHint,
  expiresAt?: Date,
  model?: string
): Promise<ResearchQuestion> {
  const result = await pool.query<ResearchQuestion>(
    `INSERT INTO research_questions (
       content, question_type, priority,
       gap_id, related_entity_id, timing_hint, expires_at,
       generated_by_model, generation_prompt_version
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'v1')
     RETURNING *`,
    [content, questionType, priority, gapId || null, relatedEntityId || null, timingHint || null, expiresAt || null, model || null]
  );
  return result.rows[0]!;
}

/**
 * Get a question by ID
 */
export async function getQuestion(id: string): Promise<ResearchQuestion | null> {
  const result = await pool.query<ResearchQuestion>(
    `SELECT * FROM research_questions WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Get all questions with optional filters
 */
export async function getAllQuestions(options?: {
  type?: QuestionType;
  status?: QuestionStatus;
  priority?: GapPriority;
  gapId?: string;
  entityId?: string;
  timingHint?: TimingHint;
  limit?: number;
}): Promise<ResearchQuestion[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramCount = 0;

  if (options?.type) {
    paramCount++;
    conditions.push(`question_type = $${paramCount}`);
    params.push(options.type);
  }

  if (options?.status) {
    paramCount++;
    conditions.push(`status = $${paramCount}`);
    params.push(options.status);
  } else {
    conditions.push(`status = 'pending'`);
  }

  if (options?.priority) {
    paramCount++;
    conditions.push(`priority = $${paramCount}`);
    params.push(options.priority);
  }

  if (options?.gapId) {
    paramCount++;
    conditions.push(`gap_id = $${paramCount}`);
    params.push(options.gapId);
  }

  if (options?.entityId) {
    paramCount++;
    conditions.push(`related_entity_id = $${paramCount}`);
    params.push(options.entityId);
  }

  if (options?.timingHint) {
    paramCount++;
    conditions.push(`timing_hint = $${paramCount}`);
    params.push(options.timingHint);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const limit = options?.limit || 100;
  paramCount++;
  params.push(limit);

  const result = await pool.query<ResearchQuestion>(
    `SELECT * FROM research_questions
     ${whereClause}
     ORDER BY
       CASE priority
         WHEN 'critical' THEN 1
         WHEN 'high' THEN 2
         WHEN 'medium' THEN 3
         WHEN 'low' THEN 4
       END,
       created_at DESC
     LIMIT $${paramCount}`,
    params
  );
  return result.rows;
}

/**
 * Mark question as asked
 */
export async function askQuestion(questionId: string): Promise<ResearchQuestion> {
  const result = await pool.query<ResearchQuestion>(
    `UPDATE research_questions
     SET status = 'asked',
         asked_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [questionId]
  );

  if (!result.rows[0]) {
    throw new Error(`Question not found: ${questionId}`);
  }
  return result.rows[0];
}

/**
 * Record an answer to a question
 */
export async function answerQuestion(
  questionId: string,
  answer: string,
  answerMemoryId?: string,
  usefulnessScore?: number
): Promise<ResearchQuestion> {
  const result = await pool.query<ResearchQuestion>(
    `UPDATE research_questions
     SET status = 'answered',
         answered_at = NOW(),
         answer = $2,
         answer_memory_id = $3,
         usefulness_score = $4,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [questionId, answer, answerMemoryId || null, usefulnessScore || null]
  );

  if (!result.rows[0]) {
    throw new Error(`Question not found: ${questionId}`);
  }
  return result.rows[0];
}

/**
 * Dismiss a question
 */
export async function dismissQuestion(questionId: string): Promise<ResearchQuestion> {
  const result = await pool.query<ResearchQuestion>(
    `UPDATE research_questions
     SET status = 'dismissed',
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [questionId]
  );

  if (!result.rows[0]) {
    throw new Error(`Question not found: ${questionId}`);
  }
  return result.rows[0];
}

/**
 * Expire old questions
 */
async function expireOldQuestions(): Promise<number> {
  const result = await pool.query(
    `UPDATE research_questions
     SET status = 'expired',
         expired_reason = 'Past expiration date',
         updated_at = NOW()
     WHERE status = 'pending'
       AND expires_at IS NOT NULL
       AND expires_at < NOW()
     RETURNING id`
  );
  return result.rowCount || 0;
}

// === SOURCE MANAGEMENT ===

/**
 * Link a source to a gap
 */
async function linkGapSource(
  gapId: string,
  sourceType: GapSourceType,
  sourceId: string,
  revelationType: 'indicates' | 'primary' | 'context' | 'deepens' = 'indicates',
  explanation?: string
): Promise<GapSource> {
  const result = await pool.query<GapSource>(
    `INSERT INTO gap_sources (gap_id, source_type, source_id, revelation_type, explanation)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (gap_id, source_type, source_id)
     DO UPDATE SET revelation_type = $4, explanation = $5
     RETURNING *`,
    [gapId, sourceType, sourceId, revelationType, explanation || null]
  );
  return result.rows[0]!;
}

/**
 * Link a source to a question
 */
async function linkQuestionSource(
  questionId: string,
  sourceType: QuestionSourceType,
  sourceId: string,
  relationType: 'prompted' | 'context' | 'about' = 'prompted',
  explanation?: string
): Promise<QuestionSource> {
  const result = await pool.query<QuestionSource>(
    `INSERT INTO question_sources (question_id, source_type, source_id, relation_type, explanation)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (question_id, source_type, source_id)
     DO UPDATE SET relation_type = $4, explanation = $5
     RETURNING *`,
    [questionId, sourceType, sourceId, relationType, explanation || null]
  );
  return result.rows[0]!;
}

/**
 * Get sources for a gap
 */
export async function getGapSources(gapId: string): Promise<GapSource[]> {
  const result = await pool.query<GapSource>(
    `SELECT * FROM gap_sources WHERE gap_id = $1 ORDER BY added_at`,
    [gapId]
  );
  return result.rows;
}

/**
 * Get sources for a question
 */
export async function getQuestionSources(questionId: string): Promise<QuestionSource[]> {
  const result = await pool.query<QuestionSource>(
    `SELECT * FROM question_sources WHERE question_id = $1 ORDER BY added_at`,
    [questionId]
  );
  return result.rows;
}

// === STATISTICS ===

/**
 * Get gap statistics
 */
export async function getGapStats(): Promise<{
  total: number;
  open: number;
  partiallyFilled: number;
  filled: number;
  dismissed: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  avgSeverity: number;
}> {
  const result = await pool.query<{
    total: string;
    open: string;
    partially_filled: string;
    filled: string;
    dismissed: string;
    avg_severity: string;
  }>(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'open') as open,
      COUNT(*) FILTER (WHERE status = 'partially_filled') as partially_filled,
      COUNT(*) FILTER (WHERE status = 'filled') as filled,
      COUNT(*) FILTER (WHERE status = 'dismissed') as dismissed,
      AVG(severity) as avg_severity
    FROM knowledge_gaps
  `);

  const byTypeResult = await pool.query<{ gap_type: string; count: string }>(`
    SELECT gap_type, COUNT(*) as count
    FROM knowledge_gaps
    WHERE status = 'open'
    GROUP BY gap_type
  `);

  const byPriorityResult = await pool.query<{ priority: string; count: string }>(`
    SELECT priority, COUNT(*) as count
    FROM knowledge_gaps
    WHERE status = 'open'
    GROUP BY priority
  `);

  const row = result.rows[0]!;
  const byType: Record<string, number> = {};
  for (const r of byTypeResult.rows) {
    byType[r.gap_type] = parseInt(r.count, 10);
  }
  const byPriority: Record<string, number> = {};
  for (const r of byPriorityResult.rows) {
    byPriority[r.priority] = parseInt(r.count, 10);
  }

  return {
    total: parseInt(row.total, 10),
    open: parseInt(row.open, 10),
    partiallyFilled: parseInt(row.partially_filled, 10),
    filled: parseInt(row.filled, 10),
    dismissed: parseInt(row.dismissed, 10),
    byType,
    byPriority,
    avgSeverity: parseFloat(row.avg_severity) || 0,
  };
}

/**
 * Get question statistics
 */
export async function getQuestionStats(): Promise<{
  total: number;
  pending: number;
  asked: number;
  answered: number;
  dismissed: number;
  expired: number;
  byType: Record<string, number>;
  avgUsefulness: number;
}> {
  const result = await pool.query<{
    total: string;
    pending: string;
    asked: string;
    answered: string;
    dismissed: string;
    expired: string;
    avg_usefulness: string;
  }>(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'asked') as asked,
      COUNT(*) FILTER (WHERE status = 'answered') as answered,
      COUNT(*) FILTER (WHERE status = 'dismissed') as dismissed,
      COUNT(*) FILTER (WHERE status = 'expired') as expired,
      AVG(usefulness_score) FILTER (WHERE usefulness_score IS NOT NULL) as avg_usefulness
    FROM research_questions
  `);

  const byTypeResult = await pool.query<{ question_type: string; count: string }>(`
    SELECT question_type, COUNT(*) as count
    FROM research_questions
    WHERE status = 'pending'
    GROUP BY question_type
  `);

  const row = result.rows[0]!;
  const byType: Record<string, number> = {};
  for (const r of byTypeResult.rows) {
    byType[r.question_type] = parseInt(r.count, 10);
  }

  return {
    total: parseInt(row.total, 10),
    pending: parseInt(row.pending, 10),
    asked: parseInt(row.asked, 10),
    answered: parseInt(row.answered, 10),
    dismissed: parseInt(row.dismissed, 10),
    expired: parseInt(row.expired, 10),
    byType,
    avgUsefulness: parseFloat(row.avg_usefulness) || 0,
  };
}

// === HELPERS ===

/**
 * Extract JSON array from LLM response
 */
function extractJsonArray(response: string): string | null {
  const startIdx = response.indexOf('[');
  if (startIdx === -1) return null;

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

  if (endIdx === -1) return null;
  return response.substring(startIdx, endIdx + 1);
}

/**
 * Get gap type emoji
 */
export function getGapTypeEmoji(type: GapType): string {
  const emojis: Record<GapType, string> = {
    entity: '\u{1F464}',       // bust in silhouette
    relationship: '\u{1F517}', // link
    timeline: '\u{23F0}',      // alarm clock
    outcome: '\u{2753}',       // question mark
    context: '\u{1F4AC}',      // speech bubble
    commitment: '\u{1F91D}',   // handshake
    preference: '\u{2764}',    // heart
    history: '\u{1F4DC}',      // scroll
  };
  return emojis[type];
}

/**
 * Get question type emoji
 */
export function getQuestionTypeEmoji(type: QuestionType): string {
  const emojis: Record<QuestionType, string> = {
    clarification: '\u{1F50D}', // magnifying glass
    follow_up: '\u{27A1}',      // right arrow
    exploration: '\u{1F30D}',   // globe
    verification: '\u{2705}',   // check mark
    deepening: '\u{1F4AD}',     // thought balloon
    connection: '\u{1F500}',    // shuffle
    outcome: '\u{1F3C1}',       // checkered flag
    preference: '\u{2764}',     // heart
  };
  return emojis[type];
}

/**
 * Get timing hint description
 */
export function getTimingHintDescription(hint: TimingHint): string {
  const descriptions: Record<TimingHint, string> = {
    immediately: 'Ask right away',
    next_session: 'Ask at start of next conversation',
    when_relevant: 'Ask when topic comes up',
    periodic: 'Ask periodically',
    before_deadline: 'Ask before deadline',
  };
  return descriptions[hint];
}

// === HIGH-LEVEL INTEGRATION ===

export interface ResearchGenerationResult {
  gapsCreated: KnowledgeGap[];
  gapsSurfaced: KnowledgeGap[];
  questionsCreated: ResearchQuestion[];
  questionsExpired: number;
}

/**
 * Process active research during consolidation
 */
export async function processResearchForConsolidation(
  model?: string
): Promise<ResearchGenerationResult> {
  const result: ResearchGenerationResult = {
    gapsCreated: [],
    gapsSurfaced: [],
    questionsCreated: [],
    questionsExpired: 0,
  };

  // Gather gap detection context
  const entitiesResult = await pool.query<{
    id: string;
    name: string;
    entity_type: string;
    description: string | null;
    mention_count: number;
  }>(
    `SELECT id, name, entity_type, description, mention_count
     FROM entities
     WHERE is_merged = FALSE
     ORDER BY mention_count DESC
     LIMIT 30`
  );

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
  }>(
    `SELECT id, content, pattern_type
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
     LIMIT 20`
  );

  const commitmentsResult = await pool.query<{ content: string }>(
    `SELECT content FROM living_summaries WHERE category = 'commitments'`
  );

  const gapContext = {
    entities: entitiesResult.rows.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.entity_type,
      description: e.description,
      mention_count: e.mention_count,
    })),
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
    })),
    recentMemories: memoriesResult.rows,
    commitments: commitmentsResult.rows[0]?.content || '',
  };

  // Detect gaps
  const extractedGaps = await detectGaps(gapContext);

  for (const ext of extractedGaps) {
    // Check for existing similar gap
    const existing = await findSimilarGap(ext.content, ext.gap_type);

    if (existing) {
      // Surface existing gap
      const surfaced = await surfaceGap(existing.id);
      result.gapsSurfaced.push(surfaced);
    } else {
      // Resolve entity names to IDs
      let relatedEntityId: string | undefined;
      let secondaryEntityId: string | undefined;

      if (ext.related_entity_name) {
        const entityResult = await pool.query<{ id: string }>(
          `SELECT id FROM entities WHERE LOWER(name) = LOWER($1) LIMIT 1`,
          [ext.related_entity_name]
        );
        relatedEntityId = entityResult.rows[0]?.id;
      }

      if (ext.secondary_entity_name) {
        const entityResult = await pool.query<{ id: string }>(
          `SELECT id FROM entities WHERE LOWER(name) = LOWER($1) LIMIT 1`,
          [ext.secondary_entity_name]
        );
        secondaryEntityId = entityResult.rows[0]?.id;
      }

      // Create new gap
      const gap = await createGap(
        ext.content,
        ext.gap_type,
        ext.severity,
        ext.priority,
        relatedEntityId,
        secondaryEntityId,
        model,
        ext.reason
      );

      // Link sources
      for (const source of ext.sources) {
        try {
          await linkGapSource(gap.id, source.type, source.id, source.revelation, source.explanation);
        } catch {
          // Source ID might not be valid - skip
        }
      }

      result.gapsCreated.push(gap);
    }
  }

  // Get open gaps for question generation
  const openGaps = await getAllGaps({ status: 'open', limit: 20 });

  // Get existing questions to avoid duplicates
  const existingQuestions = await getAllQuestions({ limit: 50 });

  const questionContext = {
    gaps: openGaps.map((g) => ({
      id: g.id,
      content: g.content,
      type: g.gap_type,
      priority: g.priority,
      severity: g.severity,
    })),
    entities: entitiesResult.rows.slice(0, 15).map((e) => ({
      id: e.id,
      name: e.name,
      type: e.entity_type,
    })),
    recentMemories: memoriesResult.rows.slice(0, 10),
    existingQuestions: existingQuestions.map((q) => ({
      content: q.content,
      status: q.status,
    })),
  };

  // Generate questions
  const extractedQuestions = await generateQuestions(questionContext);

  for (const ext of extractedQuestions) {
    // Check for existing similar question
    const existing = await findSimilarQuestion(ext.content, ext.question_type);
    if (existing) continue;

    // Find gap ID if for_gap_content is provided
    let gapId: string | undefined;
    if (ext.for_gap_content) {
      const matchingGap = openGaps.find((g) =>
        g.content.toLowerCase().includes(ext.for_gap_content!.toLowerCase()) ||
        ext.for_gap_content!.toLowerCase().includes(g.content.toLowerCase())
      );
      gapId = matchingGap?.id;
    }

    // Resolve entity name to ID
    let relatedEntityId: string | undefined;
    if (ext.related_entity_name) {
      const entityResult = await pool.query<{ id: string }>(
        `SELECT id FROM entities WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [ext.related_entity_name]
      );
      relatedEntityId = entityResult.rows[0]?.id;
    }

    // Create question
    const question = await createQuestion(
      ext.content,
      ext.question_type,
      ext.priority,
      gapId,
      relatedEntityId,
      ext.timing_hint,
      undefined, // expires_at
      model
    );

    // Link sources
    for (const source of ext.sources) {
      try {
        await linkQuestionSource(question.id, source.type, source.id, source.relation, source.explanation);
      } catch {
        // Source ID might not be valid - skip
      }
    }

    result.questionsCreated.push(question);
  }

  // Expire old questions
  result.questionsExpired = await expireOldQuestions();

  return result;
}
