/**
 * Continuity Service (Memory Upgrade Phase 2)
 *
 * First-class threads that persist across sessions, carry emotional weight,
 * and generate follow-up questions. Replaces scratchpad-based tracking
 * from Phase 1 with structured thread management.
 */

import { pool } from '../db/pool.js';
import { completeText } from '../providers/llm.js';
import type { StateTransitionSignal } from './chat/chatExtraction.js';

// =============================================================================
// TYPES
// =============================================================================

export type ContinuityThreadType =
  | 'project' | 'work_pressure' | 'family' | 'health'
  | 'relationship' | 'identity' | 'emotional_load' | 'logistics' | 'goal';

export type ContinuityThreadStatus = 'active' | 'watching' | 'resolved' | 'dormant' | 'archived';

export type ContinuityEventType =
  | 'created' | 'state_change' | 'update' | 'followup_asked'
  | 'followup_answered' | 'escalation' | 'de_escalation' | 'resolved' | 'dormant';

export interface ContinuityThread {
  id: string;
  title: string;
  thread_type: ContinuityThreadType;
  status: ContinuityThreadStatus;
  importance: number;
  emotional_weight: number;
  current_state_summary: string | null;
  last_state_transition: string | null;
  next_followup_question: string | null;
  followup_after: Date | null;
  last_discussed_at: Date | null;
  related_memory_ids: string[];
  related_entity_ids: string[];
  related_commitment_ids: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

export interface ContinuityEvent {
  id: string;
  thread_id: string;
  event_type: ContinuityEventType;
  description: string;
  memory_id: string | null;
  session_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface CreateThreadInput {
  title: string;
  thread_type: ContinuityThreadType;
  importance?: number;
  emotional_weight?: number;
  current_state_summary?: string;
  last_state_transition?: string;
  next_followup_question?: string;
  followup_after?: Date;
  related_memory_ids?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateThreadInput {
  title?: string;
  status?: ContinuityThreadStatus;
  importance?: number;
  emotional_weight?: number;
  current_state_summary?: string;
  last_state_transition?: string;
  next_followup_question?: string;
  followup_after?: Date | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface AddEventInput {
  thread_id: string;
  event_type: ContinuityEventType;
  description: string;
  memory_id?: string;
  session_id?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// THREAD CRUD
// =============================================================================

export async function createThread(input: CreateThreadInput): Promise<ContinuityThread> {
  const result = await pool.query<ContinuityThread>(
    `INSERT INTO continuity_threads (
      title, thread_type, importance, emotional_weight,
      current_state_summary, last_state_transition,
      next_followup_question, followup_after,
      related_memory_ids, tags, metadata, last_discussed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    RETURNING *`,
    [
      input.title,
      input.thread_type,
      input.importance ?? 5,
      input.emotional_weight ?? 3,
      input.current_state_summary ?? null,
      input.last_state_transition ?? null,
      input.next_followup_question ?? null,
      input.followup_after ?? null,
      input.related_memory_ids ?? [],
      input.tags ?? [],
      JSON.stringify(input.metadata ?? {}),
    ]
  );

  const thread = result.rows[0]!;

  // Log creation event
  await addEvent({
    thread_id: thread.id,
    event_type: 'created',
    description: `Thread created: ${input.title}`,
  });

  return thread;
}

export async function updateThread(
  id: string,
  updates: UpdateThreadInput
): Promise<ContinuityThread | null> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`);
    params.push(updates.title);
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    params.push(updates.status);
    if (updates.status === 'resolved') {
      setClauses.push('resolved_at = NOW()');
    }
  }
  if (updates.importance !== undefined) {
    setClauses.push(`importance = $${paramIndex++}`);
    params.push(updates.importance);
  }
  if (updates.emotional_weight !== undefined) {
    setClauses.push(`emotional_weight = $${paramIndex++}`);
    params.push(updates.emotional_weight);
  }
  if (updates.current_state_summary !== undefined) {
    setClauses.push(`current_state_summary = $${paramIndex++}`);
    params.push(updates.current_state_summary);
  }
  if (updates.last_state_transition !== undefined) {
    setClauses.push(`last_state_transition = $${paramIndex++}`);
    params.push(updates.last_state_transition);
  }
  if (updates.next_followup_question !== undefined) {
    setClauses.push(`next_followup_question = $${paramIndex++}`);
    params.push(updates.next_followup_question);
  }
  if (updates.followup_after !== undefined) {
    setClauses.push(`followup_after = $${paramIndex++}`);
    params.push(updates.followup_after);
  }
  if (updates.tags !== undefined) {
    setClauses.push(`tags = $${paramIndex++}`);
    params.push(updates.tags);
  }
  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = metadata || $${paramIndex++}::jsonb`);
    params.push(JSON.stringify(updates.metadata));
  }

  params.push(id);
  const result = await pool.query<ContinuityThread>(
    `UPDATE continuity_threads SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  );

  return result.rows[0] ?? null;
}

export async function addEvent(input: AddEventInput): Promise<ContinuityEvent> {
  const result = await pool.query<ContinuityEvent>(
    `INSERT INTO continuity_events (thread_id, event_type, description, memory_id, session_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.thread_id,
      input.event_type,
      input.description,
      input.memory_id ?? null,
      input.session_id ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
  return result.rows[0]!;
}

// =============================================================================
// QUERIES
// =============================================================================

export async function getActiveThreads(options?: {
  limit?: number;
  thread_type?: ContinuityThreadType;
  status?: ContinuityThreadStatus;
}): Promise<ContinuityThread[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  const status = options?.status ?? 'active';
  conditions.push(`status = $${paramIndex++}`);
  params.push(status);

  if (options?.thread_type) {
    conditions.push(`thread_type = $${paramIndex++}`);
    params.push(options.thread_type);
  }

  const limit = options?.limit ?? 20;
  params.push(limit);

  const result = await pool.query<ContinuityThread>(
    `SELECT * FROM continuity_threads
     WHERE ${conditions.join(' AND ')}
     ORDER BY importance DESC, emotional_weight DESC, last_discussed_at DESC NULLS LAST
     LIMIT $${paramIndex}`,
    params
  );

  return result.rows;
}

export async function getDueFollowups(): Promise<ContinuityThread[]> {
  const result = await pool.query<ContinuityThread>(
    `SELECT * FROM continuity_threads
     WHERE status = 'active'
       AND next_followup_question IS NOT NULL
       AND followup_after IS NOT NULL
       AND followup_after <= NOW()
     ORDER BY importance DESC, followup_after ASC
     LIMIT 5`
  );
  return result.rows;
}

export async function getThreadsForContext(limit = 8): Promise<ContinuityThread[]> {
  const result = await pool.query<ContinuityThread>(
    `SELECT * FROM continuity_threads
     WHERE status IN ('active', 'watching')
     ORDER BY importance DESC, emotional_weight DESC, last_discussed_at DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function resolveThread(
  id: string,
  summary?: string
): Promise<ContinuityThread | null> {
  const thread = await updateThread(id, {
    status: 'resolved',
    current_state_summary: summary,
    last_state_transition: 'resolved',
  });

  if (thread) {
    await addEvent({
      thread_id: id,
      event_type: 'resolved',
      description: summary ?? 'Thread resolved',
    });
  }

  return thread;
}

export async function markDormant(id: string): Promise<ContinuityThread | null> {
  const thread = await updateThread(id, { status: 'dormant' });
  if (thread) {
    await addEvent({
      thread_id: id,
      event_type: 'dormant',
      description: 'Thread marked dormant due to inactivity',
    });
  }
  return thread;
}

// =============================================================================
// STATE TRANSITION INTEGRATION
// =============================================================================

const THREAD_CLASSIFICATION_PROMPT = `Classify this subject into a continuity thread. Return JSON only.

Thread types: project, work_pressure, family, health, relationship, identity, emotional_load, logistics, goal

{
  "thread_type": "one of the types above",
  "importance": 1-10,
  "emotional_weight": 0-10,
  "next_followup_question": "a natural question to ask next time, or null",
  "followup_delay_hours": 24-168
}

Guidelines:
- importance: 8-10 for health, family crises, major deadlines. 5-7 for normal projects. 1-4 for minor logistics.
- emotional_weight: How emotionally charged this is. 0 = neutral task, 10 = deeply personal.
- followup_question: Something caring and specific, not generic. null if not needed.
- followup_delay_hours: When to ask. 24h for urgent, 72h for normal, 168h for low-priority.`;

async function classifyNewThread(
  subject: string,
  context: string
): Promise<{
  thread_type: ContinuityThreadType;
  importance: number;
  emotional_weight: number;
  next_followup_question: string | null;
  followup_delay_hours: number;
}> {
  const defaults = {
    thread_type: 'project' as ContinuityThreadType,
    importance: 5,
    emotional_weight: 3,
    next_followup_question: null,
    followup_delay_hours: 72,
  };

  try {
    const response = await completeText(
      `Subject: "${subject}"\nContext: "${context}"`,
      THREAD_CLASSIFICATION_PROMPT,
      { temperature: 0.2, maxTokens: 200 }
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return defaults;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const validTypes: ContinuityThreadType[] = [
      'project', 'work_pressure', 'family', 'health',
      'relationship', 'identity', 'emotional_load', 'logistics', 'goal',
    ];

    return {
      thread_type: validTypes.includes(parsed.thread_type as ContinuityThreadType)
        ? (parsed.thread_type as ContinuityThreadType)
        : defaults.thread_type,
      importance: Math.min(10, Math.max(1, Number(parsed.importance) || defaults.importance)),
      emotional_weight: Math.min(10, Math.max(0, Number(parsed.emotional_weight) || defaults.emotional_weight)),
      next_followup_question: typeof parsed.next_followup_question === 'string'
        ? parsed.next_followup_question
        : defaults.next_followup_question,
      followup_delay_hours: Math.min(168, Math.max(24, Number(parsed.followup_delay_hours) || defaults.followup_delay_hours)),
    };
  } catch (error) {
    console.error('[Continuity] Thread classification failed:', error);
    return defaults;
  }
}

/**
 * Find existing thread matching a subject, or create a new one.
 * Called from chat extraction when state transitions are detected.
 */
export async function findOrCreateThreadFromTransition(
  signal: StateTransitionSignal,
  memoryId: string
): Promise<ContinuityThread> {
  // Search for existing thread by title similarity
  const existing = await pool.query<ContinuityThread>(
    `SELECT * FROM continuity_threads
     WHERE status IN ('active', 'watching', 'dormant')
       AND LOWER(title) LIKE LOWER($1)
     ORDER BY
       CASE WHEN status = 'active' THEN 0
            WHEN status = 'watching' THEN 1
            ELSE 2 END,
       updated_at DESC
     LIMIT 1`,
    [`%${signal.subject.toLowerCase()}%`]
  );

  if (existing.rows[0]) {
    const thread = existing.rows[0];

    // Map state transitions to thread updates
    const transitionToStatus: Record<string, ContinuityThreadStatus | undefined> = {
      completed: 'resolved',
      abandoned: 'resolved',
      blocked: 'active',
      deferred: 'watching',
      started: 'active',
      planned: 'active',
    };

    const newStatus = transitionToStatus[signal.transition];

    const updates: UpdateThreadInput = {
      last_state_transition: signal.transition,
      current_state_summary: `${signal.transition}: ${signal.subject}`,
    };

    if (newStatus && newStatus !== thread.status) {
      updates.status = newStatus;
    }

    // Reactivate dormant threads
    if (thread.status === 'dormant' && signal.transition !== 'completed' && signal.transition !== 'abandoned') {
      updates.status = 'active';
    }

    // Add memory to related list
    if (memoryId) {
      await pool.query(
        `UPDATE continuity_threads
         SET related_memory_ids = array_append(related_memory_ids, $1::uuid),
             last_discussed_at = NOW()
         WHERE id = $2`,
        [memoryId, thread.id]
      );
    }

    const updated = await updateThread(thread.id, updates);

    await addEvent({
      thread_id: thread.id,
      event_type: 'state_change',
      description: `State transition: ${signal.transition}`,
      memory_id: memoryId || undefined,
    });

    return updated ?? thread;
  }

  // No existing thread — classify and create new
  const classification = await classifyNewThread(signal.subject, signal.transition);

  const followupAfter = classification.next_followup_question
    ? new Date(Date.now() + classification.followup_delay_hours * 3600000)
    : undefined;

  const thread = await createThread({
    title: signal.subject,
    thread_type: classification.thread_type,
    importance: classification.importance,
    emotional_weight: classification.emotional_weight,
    current_state_summary: `${signal.transition}: ${signal.subject}`,
    last_state_transition: signal.transition,
    next_followup_question: classification.next_followup_question ?? undefined,
    followup_after: followupAfter,
    related_memory_ids: memoryId ? [memoryId] : [],
  });

  console.log(`[Continuity] Created thread "${signal.subject}" (${classification.thread_type}, importance: ${classification.importance})`);
  return thread;
}

// =============================================================================
// CONSOLIDATION
// =============================================================================

/**
 * Process threads during consolidation:
 * 1. Mark dormant after 14 days inactive
 * 2. Generate follow-up questions for threads missing them
 */
export async function processThreadsForConsolidation(): Promise<{
  threadsDormant: number;
  followupsGenerated: number;
}> {
  let threadsDormant = 0;
  let followupsGenerated = 0;

  // 1. Mark threads dormant if no discussion in 14 days
  const dormantResult = await pool.query(
    `UPDATE continuity_threads
     SET status = 'dormant', updated_at = NOW()
     WHERE status = 'active'
       AND last_discussed_at < NOW() - INTERVAL '14 days'
     RETURNING id`
  );
  threadsDormant = dormantResult.rowCount ?? 0;

  // Log dormant events
  for (const row of dormantResult.rows) {
    await addEvent({
      thread_id: row.id,
      event_type: 'dormant',
      description: 'Auto-dormant: no discussion in 14 days',
    });
  }

  if (threadsDormant > 0) {
    console.log(`[Continuity] Marked ${threadsDormant} thread(s) dormant`);
  }

  // 2. Generate follow-up questions for active threads that don't have one
  const needFollowup = await pool.query<ContinuityThread>(
    `SELECT * FROM continuity_threads
     WHERE status = 'active'
       AND next_followup_question IS NULL
       AND importance >= 5
     ORDER BY importance DESC
     LIMIT 5`
  );

  for (const thread of needFollowup.rows) {
    try {
      const response = await completeText(
        `Thread: "${thread.title}" (${thread.thread_type})\nState: ${thread.current_state_summary ?? 'active'}\nImportance: ${thread.importance}/10`,
        `Generate a single caring, specific follow-up question for this ongoing thread. The question should show genuine interest and help the person reflect on progress or feelings. Return ONLY the question text, nothing else.`,
        { temperature: 0.7, maxTokens: 100 }
      );

      const question = response.trim().replace(/^["']|["']$/g, '');
      if (question.length > 10 && question.length < 200) {
        await updateThread(thread.id, {
          next_followup_question: question,
          followup_after: new Date(Date.now() + 72 * 3600000), // 72h
        });
        followupsGenerated++;
      }
    } catch (error) {
      console.error(`[Continuity] Failed to generate followup for thread ${thread.id}:`, error);
    }
  }

  if (followupsGenerated > 0) {
    console.log(`[Continuity] Generated ${followupsGenerated} follow-up question(s)`);
  }

  return { threadsDormant, followupsGenerated };
}
