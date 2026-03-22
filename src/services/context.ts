/**
 * Context Service (Slice 3)
 *
 * Production-quality context injection with:
 * - Context profiles (general, work, personal, creative)
 * - Full scoring function: salience × relevance × recency × strength
 * - Token budgeting with percentage caps
 * - Disclosure logging for audit trail
 */

import { pool } from '../db/pool.js';
import { config } from '../config/index.js';
import { generateEmbedding } from '../providers/embeddings.js';
import { EntityType } from './entities.js';
import { getNonEmptySummaries, generateSummary, type LivingSummary, type SummaryCategory } from './summaries.js';
import { searchNotes, getPinnedNotes } from './notes.js';
import { searchLists } from './lists.js';
import { searchForContext } from './documents/search.js';
import { enhancedRecall } from './enhancedRecall.js';
import { listEntries as listScratchpadEntries } from './scratchpad.js';
import { getThreadsForContext, getDueFollowups } from './continuity.js';
import { getLatestSnapshotNarrative, getUnacknowledgedConcerns } from './stateSnapshots.js';
import { getLatestTrend } from './trends.js';
// expressionFilter.ts is no longer called at runtime — safety is pre-computed
// by expressionEvaluator.ts (local Ollama model) during consolidation.

// === TYPES ===

export interface ContextProfile {
  id: string;
  name: string;
  description: string | null;
  include_sources: string[];
  min_salience: number;
  min_strength: number;
  recency_weight: number;
  lookback_days: number;
  max_tokens: number;
  format: 'markdown' | 'json' | 'plain';
  scoring_weights: ScoringWeights;
  budget_caps: BudgetCaps;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ScoringWeights {
  salience: number;
  relevance: number;
  recency: number;
  strength: number;
}

export interface BudgetCaps {
  high_salience: number;
  relevant: number;
  recent: number;
}

export interface ScoredMemory {
  id: string;
  content: string;
  created_at: Date;
  salience_score: number;
  current_strength: number;
  similarity?: number;
  recency_score: number;
  final_score: number;
  token_estimate: number;
  category: 'high_salience' | 'relevant' | 'recent';
}

export interface EntitySummary {
  id: string;
  name: string;
  type: EntityType;
  mention_count: number;
}

export interface SummarySnapshot {
  category: string;
  content: string;
  version: number;
  memory_count: number;
}

export interface NoteSnapshot {
  id: string;
  title: string | null;
  content: string;
  category: string | null;
  entity_name: string | null;
  similarity?: number;
}

export interface ListSnapshot {
  id: string;
  name: string;
  description: string | null;
  list_type: string;
  entity_name: string | null;
  similarity?: number;
}

export interface DocumentSnapshot {
  id: string;
  chunkId: string;
  documentName: string;
  content: string;
  pageNumber?: number;
  sectionTitle?: string;
  similarity: number;
  tokenCount: number;
}

export interface ContextPackage {
  generated_at: string;
  profile: string;
  query?: string;
  memories: ScoredMemory[];
  entities: EntitySummary[];
  summaries: SummarySnapshot[];
  notes: NoteSnapshot[];
  lists: ListSnapshot[];
  documents: DocumentSnapshot[];
  token_count: number;
  disclosure_id: string;
  markdown: string;
  json: object;
}

export interface GenerateContextOptions {
  profile?: string;
  query?: string;
  maxTokens?: number;
  conversationId?: string;
  includeDocuments?: boolean;
  maxDocumentTokens?: number;
}

// === PROFILE FUNCTIONS ===

/**
 * Get a context profile by name
 */
async function getProfile(name: string): Promise<ContextProfile | null> {
  const result = await pool.query(
    'SELECT * FROM context_profiles WHERE name = $1',
    [name]
  );
  return (result.rows[0] as ContextProfile) ?? null;
}

/**
 * Get the default context profile
 */
async function getDefaultProfile(): Promise<ContextProfile> {
  const result = await pool.query(
    'SELECT * FROM context_profiles WHERE is_default = TRUE LIMIT 1'
  );
  if (!result.rows[0]) {
    throw new Error('No default profile found');
  }
  return result.rows[0] as ContextProfile;
}

/**
 * List all context profiles
 */
export async function listProfiles(): Promise<ContextProfile[]> {
  const result = await pool.query(
    'SELECT * FROM context_profiles ORDER BY is_default DESC, name ASC'
  );
  return result.rows as ContextProfile[];
}

// === SCORING FUNCTIONS ===

/**
 * Calculate recency score (exponential decay)
 * Score decreases as memory gets older
 */
/**
 * Estimate tokens for a piece of text
 * Rough estimate: ~4 characters per token for English
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// === TOKEN BUDGETING ===

/**
 * Apply token budget to memories
 * Returns memories that fit within the budget, prioritized by category
 */
function applyTokenBudget(
  memories: ScoredMemory[],
  maxTokens: number,
  budgetCaps: BudgetCaps
): ScoredMemory[] {
  const budgets = {
    high_salience: Math.floor(maxTokens * budgetCaps.high_salience),
    relevant: Math.floor(maxTokens * budgetCaps.relevant),
    recent: Math.floor(maxTokens * budgetCaps.recent),
  };

  const used = { high_salience: 0, relevant: 0, recent: 0 };
  const selected: ScoredMemory[] = [];

  // Sort by final score within each category
  const byCategory = {
    high_salience: memories
      .filter((m) => m.category === 'high_salience')
      .sort((a, b) => b.final_score - a.final_score),
    relevant: memories
      .filter((m) => m.category === 'relevant')
      .sort((a, b) => b.final_score - a.final_score),
    recent: memories
      .filter((m) => m.category === 'recent')
      .sort((a, b) => b.final_score - a.final_score),
  };

  // Fill each category up to its budget
  for (const category of ['high_salience', 'relevant', 'recent'] as const) {
    for (const memory of byCategory[category]) {
      if (used[category] + memory.token_estimate <= budgets[category]) {
        selected.push(memory);
        used[category] += memory.token_estimate;
      }
    }
  }

  // Sort final selection by score
  return selected.sort((a, b) => b.final_score - a.final_score);
}

// === DISCLOSURE LOGGING ===

/**
 * Log what was disclosed to the AI
 */
async function logDisclosure(
  profileName: string,
  query: string | undefined,
  memoryIds: string[],
  tokenCount: number,
  format: string,
  scoringWeights: ScoringWeights,
  conversationId?: string
): Promise<string> {
  const result = await pool.query(
    `INSERT INTO disclosure_log (
      conversation_id, profile_used, query_text,
      disclosed_memory_ids, disclosed_memory_count,
      scoring_weights, token_count, format
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [
      conversationId,
      profileName,
      query,
      memoryIds,
      memoryIds.length,
      JSON.stringify(scoringWeights),
      tokenCount,
      format,
    ]
  );
  return result.rows[0]?.id as string;
}

// === ENTITY FUNCTIONS ===

/**
 * Get entities mentioned in a set of memories
 * Returns unique entities with total mention counts
 */
async function getEntitiesForMemories(memoryIds: string[]): Promise<EntitySummary[]> {
  if (memoryIds.length === 0) return [];

  const result = await pool.query(
    `SELECT e.id, e.name, e.entity_type as type, COUNT(em.id) as mention_count
     FROM entities e
     JOIN entity_mentions em ON em.entity_id = e.id
     WHERE em.memory_id = ANY($1)
       AND e.is_merged = FALSE
     GROUP BY e.id, e.name, e.entity_type
     ORDER BY mention_count DESC, e.name ASC
     LIMIT 20`,
    [memoryIds]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type as EntityType,
    mention_count: parseInt(row.mention_count, 10),
  }));
}

/**
 * Fetch memories by ID (for multi-channel retrieval)
 * Returns memories with NULL similarity (same as no-query path)
 */
// === FORMATTING ===


// === LIVE SCHEDULE ===

/**
 * Freshness threshold for living summaries (in hours).
 * If a summary is older than this, it will be regenerated before serving.
 */
const SUMMARY_TTL_HOURS = 12;

/**
 * Check and refresh stale summaries.
 * Returns the refreshed summaries.
 */
async function ensureFreshSummaries(summaries: LivingSummary[]): Promise<LivingSummary[]> {
  const now = Date.now();
  const ttlMs = SUMMARY_TTL_HOURS * 60 * 60 * 1000;
  const refreshed: LivingSummary[] = [];

  for (const s of summaries) {
    const age = now - new Date(s.last_updated_at).getTime();
    if (age > ttlMs) {
      try {
        console.log(`[Context] Summary "${s.category}" is ${Math.round(age / 3600000)}h old (TTL: ${SUMMARY_TTL_HOURS}h), refreshing...`);
        const result = await generateSummary(s.category as SummaryCategory, true);
        refreshed.push(result.summary);
      } catch (err) {
        console.error(`[Context] Failed to refresh ${s.category}, using stale:`, err);
        refreshed.push(s); // Fall back to stale version
      }
    } else {
      refreshed.push(s);
    }
  }

  return refreshed;
}

export interface ScheduleItem {
  title: string;
  startTime: Date;
  endTime: Date | null;
  allDay: boolean;
  source: 'calendar' | 'reminder' | 'commitment';
  status?: string;
}

/**
 * Fetch live schedule data from Google Calendar events, reminders, and dated commitments.
 * Returns items for the next 7 days, sorted by start time.
 *
 * @param maxItems - Maximum number of items to return (default: null = no limit)
 */
async function fetchLiveSchedule(maxItems: number | null = null): Promise<ScheduleItem[]> {
  const items: ScheduleItem[] = [];

  // Calculate limits per source
  // Default: 20 calendar + 10 reminders + 10 commitments = 40 total
  // If maxItems specified, distribute proportionally
  const calLimit = maxItems ? Math.ceil(maxItems * 0.5) : 20;
  const remLimit = maxItems ? Math.ceil(maxItems * 0.25) : 10;
  const comLimit = maxItems ? Math.ceil(maxItems * 0.25) : 10;

  // Fetch Google Calendar events for next 7 days
  try {
    const calResult = await pool.query(`
      SELECT summary, start_time, end_time, all_day, status
      FROM google_events
      WHERE start_time >= NOW() - INTERVAL '1 day'
        AND start_time <= NOW() + INTERVAL '7 days'
        AND status != 'cancelled'
      ORDER BY start_time ASC
      LIMIT $1
    `, [calLimit]);

    for (const row of calResult.rows) {
      items.push({
        title: row.summary || 'Untitled event',
        startTime: new Date(row.start_time),
        endTime: row.end_time ? new Date(row.end_time) : null,
        allDay: row.all_day ?? false,
        source: 'calendar',
        status: row.status,
      });
    }
  } catch (err) {
    console.error('[Context] Failed to fetch calendar events:', err);
  }

  // Fetch pending reminders for next 7 days
  try {
    const remResult = await pool.query(`
      SELECT title, scheduled_for, status
      FROM reminders
      WHERE status = 'pending'
        AND scheduled_for >= NOW() - INTERVAL '1 hour'
        AND scheduled_for <= NOW() + INTERVAL '7 days'
      ORDER BY scheduled_for ASC
      LIMIT $1
    `, [remLimit]);

    for (const row of remResult.rows) {
      items.push({
        title: row.title || 'Reminder',
        startTime: new Date(row.scheduled_for),
        endTime: null,
        allDay: false,
        source: 'reminder',
        status: row.status,
      });
    }
  } catch (err) {
    console.error('[Context] Failed to fetch reminders:', err);
  }

  // Fetch commitments with due dates in next 7 days
  try {
    const comResult = await pool.query(`
      SELECT title, due_at, status, all_day
      FROM commitments
      WHERE status IN ('open', 'in_progress')
        AND due_at IS NOT NULL
        AND due_at >= NOW() - INTERVAL '1 day'
        AND due_at <= NOW() + INTERVAL '7 days'
      ORDER BY due_at ASC
      LIMIT $1
    `, [comLimit]);

    for (const row of comResult.rows) {
      items.push({
        title: row.title || 'Commitment',
        startTime: new Date(row.due_at),
        endTime: null,
        allDay: row.all_day ?? false,
        source: 'commitment',
        status: row.status,
      });
    }
  } catch (err) {
    console.error('[Context] Failed to fetch commitments:', err);
  }

  // Sort by start time
  items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // Apply final limit if specified
  if (maxItems && items.length > maxItems) {
    return items.slice(0, maxItems);
  }

  return items;
}

/**
 * Format live schedule items as markdown for context injection.
 * Groups by day (Today, Tomorrow, day-of-week) for natural conversation.
 */
function formatScheduleMarkdown(items: ScheduleItem[]): string {
  if (items.length === 0) return '';

  const lines: string[] = [];
  lines.push('# Schedule & Upcoming');
  lines.push('');
  lines.push('*This is live data — use it to ground your awareness of their day.*');
  lines.push('');

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-US', { timeZone: 'America/New_York' });

  // Group by day
  const byDay = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const itemDateStr = item.startTime.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    const existing = byDay.get(itemDateStr) || [];
    existing.push(item);
    byDay.set(itemDateStr, existing);
  }

  for (const [dateStr, dayItems] of byDay) {
    // Format day header
    let dayLabel: string;
    if (dateStr === todayStr) {
      dayLabel = 'Today (' + now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' }) + ')';
    } else if (dateStr === tomorrowStr) {
      dayLabel = 'Tomorrow (' + tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' }) + ')';
    } else {
      const d = dayItems[0]!.startTime;
      dayLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
    }

    lines.push(`**${dayLabel}**`);
    for (const item of dayItems) {
      const sourceTag = item.source === 'calendar' ? '' : ` [${item.source}]`;
      // Check if event is in the past
      const isPast = item.endTime ? new Date(item.endTime).getTime() < now.getTime() : item.startTime.getTime() < now.getTime() - 3600000;

      if (item.allDay) {
        const prefix = isPast ? '~~' : '';
        const suffix = isPast ? '~~ *(done)*' : '';
        lines.push(`- ${prefix}${item.title}${sourceTag} (all day)${suffix}`);
      } else {
        const timeStr = item.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
        const prefix = isPast ? '~~' : '';
        const suffix = isPast ? '~~ *(done)*' : '';
        lines.push(`- ${prefix}${timeStr} — ${item.title}${sourceTag}${suffix}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Fetch continuity preamble for context injection (Memory Upgrade Phase 2)
 *
 * Uses first-class continuity threads (Phase 2) with scratchpad fallback (Phase 1).
 * Returns formatted markdown sections for active threads and follow-ups.
 */
async function fetchContinuityPreamble(): Promise<string> {
  try {
    // Phase 2: Try structured continuity threads first
    const threads = await getThreadsForContext(8);
    const followups = await getDueFollowups();

    if (threads.length === 0 && followups.length === 0) {
      // Phase 1 fallback: check scratchpad continuity entries
      return await fetchScratchpadContinuity();
    }

    const lines: string[] = [];
    lines.push('# Active Threads');
    lines.push('');
    lines.push('*Ongoing things in their life — check in naturally when relevant.*');
    lines.push('');

    for (const thread of threads) {
      const emotionalTag = thread.emotional_weight >= 7 ? ' [emotionally significant]' : '';
      const stateTag = thread.last_state_transition ? ` (${thread.last_state_transition})` : '';
      lines.push(`- **${thread.title}**${stateTag}${emotionalTag}`);
      if (thread.current_state_summary) {
        lines.push(`  ${thread.current_state_summary}`);
      }
    }

    if (followups.length > 0) {
      lines.push('');
      lines.push('**Follow-up Questions** *(ask naturally, don\'t force)*');
      for (const f of followups) {
        lines.push(`- ${f.next_followup_question} *(re: ${f.title})*`);
      }
    }

    lines.push('');
    return lines.join('\n');
  } catch (error) {
    console.error('[Context] Failed to fetch continuity preamble:', error);
    return '';
  }
}

/**
 * Fetch current state context for context injection (Memory Upgrade Phase 3)
 *
 * Returns the latest snapshot narrative and any unacknowledged concern signals.
 */
async function fetchStateContext(): Promise<string> {
  try {
    const narrative = await getLatestSnapshotNarrative();
    const concerns = await getUnacknowledgedConcerns();
    const weeklyTrend = await getLatestTrend('7day');

    if (!narrative && concerns.length === 0 && !weeklyTrend) return '';

    const lines: string[] = [];

    if (narrative) {
      lines.push('# Current State');
      lines.push('');
      lines.push('*How they seem to be doing lately:*');
      lines.push(narrative);
      lines.push('');
    }

    // Include weekly trend if it shows significant change
    if (weeklyTrend?.narrative) {
      const hasSignificantChange =
        weeklyTrend.stress_trend !== 0 ||
        weeklyTrend.energy_trend !== 0 ||
        weeklyTrend.motivation_trend !== 0;

      if (hasSignificantChange) {
        lines.push('**Week-over-week:**');
        lines.push(weeklyTrend.narrative);
        lines.push('');
      }
    }

    // Inject concern signals as internal awareness (guides tone, not content)
    if (concerns.length > 0) {
      const significantConcerns = concerns.filter(c => c.severity !== 'mild');
      if (significantConcerns.length > 0) {
        lines.push('**[Internal awareness — do not mention directly]**');
        for (const c of significantConcerns) {
          lines.push(`- ${c.signal_type}: ${c.description} (${c.severity})`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  } catch (error) {
    console.error('[Context] Failed to fetch state context:', error);
    return '';
  }
}

/**
 * Fetch support guidance from beliefs for context injection (Memory Upgrade Phase 4)
 *
 * Queries support-related beliefs and formats as system-level guidance
 * that shapes Squire's tone and approach.
 */
async function fetchSupportGuidance(): Promise<string> {
  try {
    const result = await pool.query<{
      content: string;
      belief_type: string;
      confidence: number;
    }>(
      `SELECT content, belief_type, confidence FROM beliefs
       WHERE belief_type IN ('support_preference', 'trigger_sensitivity', 'protective_priority', 'vulnerability_theme')
         AND status = 'active'
         AND confidence >= 0.6
       ORDER BY confidence DESC
       LIMIT 12`
    );

    if (result.rows.length === 0) return '';

    const byType: Record<string, string[]> = {};
    for (const row of result.rows) {
      if (!byType[row.belief_type]) byType[row.belief_type] = [];
      byType[row.belief_type]!.push(row.content);
    }

    const lines: string[] = [];
    lines.push('# How to Support This Person');
    lines.push('');
    lines.push('*[Internal guidance — shapes your tone, not your content]*');
    lines.push('');

    if (byType.support_preference) {
      lines.push('**Support Preferences**');
      for (const b of byType.support_preference) lines.push(`- ${b}`);
      lines.push('');
    }
    if (byType.trigger_sensitivity) {
      lines.push('**Sensitivities**');
      for (const b of byType.trigger_sensitivity) lines.push(`- ${b}`);
      lines.push('');
    }
    if (byType.protective_priority) {
      lines.push('**Non-Negotiables**');
      for (const b of byType.protective_priority) lines.push(`- ${b}`);
      lines.push('');
    }
    if (byType.vulnerability_theme) {
      lines.push('**Underlying Themes**');
      for (const b of byType.vulnerability_theme) lines.push(`- ${b}`);
      lines.push('');
    }

    return lines.join('\n');
  } catch (error) {
    console.error('[Context] Failed to fetch support guidance:', error);
    return '';
  }
}

/**
 * Phase 1 fallback: scratchpad-based continuity entries
 */
async function fetchScratchpadContinuity(): Promise<string> {
  try {
    const activeEntries = await listScratchpadEntries({
      entry_type: 'thread',
      include_resolved: false,
      include_expired: false,
      limit: 10,
    });

    const continuityThreads = activeEntries.filter(
      (e) => e.metadata && (e.metadata as Record<string, unknown>).continuity === true
    );

    const recentObservations = await pool.query<{
      content: string;
      metadata: Record<string, unknown>;
      created_at: Date;
    }>(
      `SELECT content, metadata, created_at FROM scratchpad
       WHERE entry_type = 'observation'
         AND metadata->>'continuity' = 'true'
         AND metadata->>'transition' IN ('completed', 'abandoned')
         AND created_at > NOW() - INTERVAL '48 hours'
       ORDER BY created_at DESC
       LIMIT 5`
    );

    if (continuityThreads.length === 0 && recentObservations.rows.length === 0) {
      return '';
    }

    const lines: string[] = [];
    lines.push('# Continuity');
    lines.push('');

    const inProgress = continuityThreads.filter((t) => {
      const m = t.metadata as Record<string, unknown>;
      return m.transition === 'started' || m.transition === 'planned';
    });
    if (inProgress.length > 0) {
      lines.push('**In Progress**');
      for (const t of inProgress) {
        const m = t.metadata as Record<string, unknown>;
        lines.push(`- ${m.subject} (${m.transition})`);
      }
      lines.push('');
    }

    const blocked = continuityThreads.filter((t) => {
      const m = t.metadata as Record<string, unknown>;
      return m.transition === 'blocked' || m.transition === 'deferred';
    });
    if (blocked.length > 0) {
      lines.push('**Blocked / On Hold**');
      for (const t of blocked) {
        const m = t.metadata as Record<string, unknown>;
        lines.push(`- ${m.subject} (${m.transition})`);
      }
      lines.push('');
    }

    if (recentObservations.rows.length > 0) {
      lines.push('**Recently Completed**');
      for (const obs of recentObservations.rows) {
        const m = obs.metadata;
        lines.push(`- ${m.subject} (${m.transition})`);
      }
      lines.push('');
    }

    return lines.join('\n');
  } catch (error) {
    console.error('[Context] Scratchpad continuity fallback failed:', error);
    return '';
  }
}

/**
 * Format memories as markdown
 *
 * Design philosophy: Present context as genuine knowledge, not database output.
 * - No scores, similarity percentages, or technical metadata
 * - Clean, readable format that feels like natural recall
 * - Summaries first (who they are), then relevant specifics
 */
function formatMarkdown(
  memories: ScoredMemory[],
  entities: EntitySummary[],
  summaries: SummarySnapshot[],
  _profile: ContextProfile,
  _query?: string
): string {
  const lines: string[] = [];

  // Living Summaries - present as knowledge about the person
  if (summaries.length > 0) {
    lines.push('# What You Know About Them');
    lines.push('');
    for (const s of summaries) {
      const title = s.category.charAt(0).toUpperCase() + s.category.slice(1);
      lines.push(`**${title}**: ${s.content}`);
      lines.push('');
    }
  }

  // Combine all memories, already sorted by relevance
  const allMemories = [...memories];

  if (allMemories.length > 0) {
    lines.push('# Relevant Context');
    lines.push('');
    const now = new Date();
    for (const m of allMemories) {
      // Include date so the model can reason about temporal relevance
      const age = Math.floor((now.getTime() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const dateStr = new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const ageLabel = age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age}d ago`;
      lines.push(`- [${dateStr}, ${ageLabel}] ${m.content}`);
    }
    lines.push('');
  }

  // Key people and things they've mentioned
  if (entities.length > 0) {
    const byType: Record<string, EntitySummary[]> = {};
    for (const e of entities) {
      const arr = byType[e.type] ?? [];
      arr.push(e);
      byType[e.type] = arr;
    }

    const parts: string[] = [];
    const typeOrder = ['person', 'project', 'organization', 'place', 'concept'];
    for (const type of typeOrder) {
      const typeEntities = byType[type];
      if (typeEntities && typeEntities.length > 0) {
        const names = typeEntities.map((e) => e.name).join(', ');
        parts.push(`${type}s: ${names}`);
      }
    }

    if (parts.length > 0) {
      lines.push(`**People & things mentioned**: ${parts.join(' | ')}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format notes for markdown context
 */
function formatNotesMarkdown(notes: NoteSnapshot[]): string {
  if (notes.length === 0) return '';

  const lines: string[] = [];
  lines.push('## Relevant Notes');
  lines.push('');

  for (const note of notes) {
    const title = note.title ?? 'Untitled Note';
    const entityInfo = note.entity_name ? ` (${note.entity_name})` : '';
    const similarity = note.similarity ? ` [${(note.similarity * 100).toFixed(0)}% match]` : '';
    lines.push(`### ${title}${entityInfo}${similarity}`);
    lines.push(note.content);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format lists for markdown context
 */
function formatListsMarkdown(lists: ListSnapshot[]): string {
  if (lists.length === 0) return '';

  const lines: string[] = [];
  lines.push('## Relevant Lists');
  lines.push('');

  for (const list of lists) {
    const entityInfo = list.entity_name ? ` (${list.entity_name})` : '';
    const similarity = list.similarity ? ` [${(list.similarity * 100).toFixed(0)}% match]` : '';
    lines.push(`- **${list.name}**${entityInfo}${similarity}: ${list.description ?? list.list_type}`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Format documents for markdown context
 *
 * Design: Include clear source citations the LLM can reference.
 * Format: [Source: DocName, Page X] for easy attribution.
 */
function formatDocumentsMarkdown(documents: DocumentSnapshot[]): string {
  if (documents.length === 0) return '';

  const lines: string[] = [];
  lines.push('## Relevant Documents');
  lines.push('');
  lines.push('*When using information from these documents, cite the source.*');
  lines.push('');

  // Group by document name for cleaner output
  const byDocument = new Map<string, DocumentSnapshot[]>();
  for (const doc of documents) {
    const existing = byDocument.get(doc.documentName) ?? [];
    existing.push(doc);
    byDocument.set(doc.documentName, existing);
  }

  let sourceIndex = 1;
  for (const [docName, chunks] of byDocument) {
    lines.push(`### ${docName}`);
    lines.push('');
    for (const chunk of chunks) {
      // Build citation reference
      const pageRef = chunk.pageNumber ? `p.${chunk.pageNumber}` : null;
      const sectionRef = chunk.sectionTitle ?? null;
      const locationParts = [pageRef, sectionRef].filter(Boolean);
      const location = locationParts.length > 0 ? locationParts.join(', ') : `chunk ${sourceIndex}`;

      // Format: [DOC-1: filename, p.5] Content...
      const citation = `[DOC-${sourceIndex}: ${docName}${location ? ', ' + location : ''}]`;
      lines.push(`${citation}`);
      lines.push(chunk.content);
      lines.push('');
      sourceIndex++;
    }
  }

  return lines.join('\n');
}

/**
 * Format memories as JSON
 */
function formatJson(
  memories: ScoredMemory[],
  entities: EntitySummary[],
  summaries: SummarySnapshot[],
  notes: NoteSnapshot[],
  lists: ListSnapshot[],
  documents: DocumentSnapshot[],
  profile: ContextProfile,
  query?: string
): object {
  return {
    profile: profile.name,
    generated_at: new Date().toISOString(),
    query,
    scoring_weights: profile.scoring_weights,
    summaries: summaries.map((s) => ({
      category: s.category,
      content: s.content,
      version: s.version,
      memory_count: s.memory_count,
    })),
    entities: entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      mention_count: e.mention_count,
    })),
    memories: memories.map((m) => ({
      id: m.id,
      content: m.content,
      created_at: m.created_at,
      category: m.category,
      scores: {
        salience: m.salience_score,
        strength: m.current_strength,
        recency: m.recency_score,
        similarity: m.similarity,
        final: m.final_score,
      },
      token_estimate: m.token_estimate,
    })),
    notes: notes.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      category: n.category,
      entity_name: n.entity_name,
      similarity: n.similarity,
    })),
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      list_type: l.list_type,
      entity_name: l.entity_name,
      similarity: l.similarity,
    })),
    documents: documents.map((d) => ({
      id: d.id,
      chunkId: d.chunkId,
      documentName: d.documentName,
      content: d.content,
      pageNumber: d.pageNumber,
      sectionTitle: d.sectionTitle,
      similarity: d.similarity,
      tokenCount: d.tokenCount,
    })),
  };
}

// === MAIN FUNCTION ===

/**
 * Generate context package for AI consumption
 *
 * This is the primary entry point for context injection.
 * It retrieves memories, scores them, applies token budgets,
 * formats output, and logs the disclosure.
 */
export async function generateContext(
  options: GenerateContextOptions = {}
): Promise<ContextPackage> {
  const { query, maxTokens, conversationId, includeDocuments = true, maxDocumentTokens = 2000 } = options;

  // Get profile
  let profile: ContextProfile;
  if (options.profile) {
    const found = await getProfile(options.profile);
    if (!found) {
      throw new Error(`Profile not found: ${options.profile}`);
    }
    profile = found;
  } else {
    profile = await getDefaultProfile();
  }

  const effectiveMaxTokens = maxTokens ?? profile.max_tokens;
  const weights = profile.scoring_weights as ScoringWeights;
  const budgetCaps = profile.budget_caps as BudgetCaps;

  // === ENHANCED RECALL ===
  // Generate query embedding once — used by Enhanced Recall (hybrid retrieval)
  // and downstream by notes/lists/docs search
  let queryEmbedding: number[] | null = null;
  if (query) {
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (err) {
      console.error('[Context] Embedding generation failed, continuing without:', err);
    }
  }

  let scoredMemories: ScoredMemory[] = [];

  if (query) {
    try {
      const recallResult = await enhancedRecall(query, {
        minSalience: profile.min_salience,
        minStrength: profile.min_strength,
        lookbackDays: profile.lookback_days,
        queryEmbedding: queryEmbedding ?? undefined,
      });

      const s = recallResult.stats;
      console.log(`[Context] Enhanced Recall: ${s.candidateCount} memories, ` +
        `${s.entityMatchCount} entity matches, ${s.embeddingCandidates} embedding candidates, ` +
        `${s.graphPropagationCount} propagations, ` +
        `reranker=${s.rerankerUsed ? `${s.rerankerCalls} calls` : 'off'}` +
        `${s.rerankerFallback ? ' (FALLBACK)' : ''}, ${s.elapsedMs}ms`);

      // Map MemoryCandidate[] to ScoredMemory[] for downstream compatibility
      scoredMemories = recallResult.memories.map((mem, idx) => {
        // Category by percentile rank in result set
        const rank = idx / Math.max(recallResult.memories.length, 1);
        let category: 'high_salience' | 'relevant' | 'recent';
        if (rank < 0.2 || mem.salience_score >= 8.0) {
          category = 'high_salience';
        } else if (rank < 0.6 || mem.salience_score >= 6.0) {
          category = 'relevant';
        } else {
          category = 'recent';
        }

        return {
          id: mem.id,
          content: mem.content,
          created_at: mem.created_at,
          salience_score: mem.salience_score,
          current_strength: mem.current_strength,
          similarity: undefined,
          recency_score: 0,
          final_score: mem.totalScore,
          token_estimate: estimateTokens(mem.content),
          category,
        };
      });
    } catch (err) {
      console.error('[Context] Enhanced Recall error, falling back to empty:', err);
    }
  }

  // Apply token budgeting
  const budgetedMemories = applyTokenBudget(
    scoredMemories,
    effectiveMaxTokens,
    budgetCaps
  );

  // Expression safety is now pre-computed by expressionEvaluator (local Ollama model)
  // and filtered at SQL level: AND (expression_safe IS NULL OR expression_safe = TRUE)
  const filteredMemories = budgetedMemories;

  // Calculate total tokens (from filtered memories)
  const totalTokens = filteredMemories.reduce((sum, m) => sum + m.token_estimate, 0);
  const memoryIds = filteredMemories.map((m) => m.id);

  // Fetch limits (signal detector removed — Enhanced Recall handles memory relevance)
  const notesLimit = 5;
  const listsLimit = 5;
  const docsLimit = 10;
  const scheduleLimit: number | null = null; // no cap on schedule

  // Parallel fetch: all independent data sources at once
  const [
    entities,
    livingSummaries,
    pinnedNotes,
    relevantNotes,
    relevantLists,
    docResults,
    disclosureId,
    liveSchedule,
  ] = await Promise.all([
    getEntitiesForMemories(memoryIds),
    getNonEmptySummaries(), // Always fetched (exempt)
    getPinnedNotes(),
    query
      ? searchNotes(query, { limit: notesLimit, threshold: config.search.notesThreshold }).catch((error) => {
          console.error('[Context] Error fetching notes:', error);
          return [] as Awaited<ReturnType<typeof searchNotes>>;
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof searchNotes>>),
    query
      ? searchLists(query, listsLimit).catch((error) => {
          console.error('[Context] Error fetching lists:', error);
          return [] as Awaited<ReturnType<typeof searchLists>>;
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof searchLists>>),
    (includeDocuments && query)
      ? searchForContext(query, {
          maxTokens: maxDocumentTokens,
          threshold: config.search.contextThreshold,
          limit: docsLimit,
        }).catch((error) => {
          console.error('[Context] Error fetching documents:', error);
          return { chunks: [] as { sourceId: string; documentName: string; content: string; pageNumber?: number; sectionTitle?: string; similarity: number; tokenCount: number }[] };
        })
      : Promise.resolve({ chunks: [] as { sourceId: string; documentName: string; content: string; pageNumber?: number; sectionTitle?: string; similarity: number; tokenCount: number }[] }),
    logDisclosure(profile.name, query, memoryIds, totalTokens, profile.format, weights, conversationId),
    fetchLiveSchedule(scheduleLimit),
  ]);

  // Fix C: Freshness gate — refresh stale summaries before serving
  const freshSummaries = await ensureFreshSummaries(livingSummaries);

  // Map living summaries
  const summaries: SummarySnapshot[] = freshSummaries.map((s: LivingSummary) => ({
    category: s.category,
    content: s.content,
    version: s.version,
    memory_count: s.memory_count,
  }));

  // Merge pinned + relevant notes (deduplicated)
  const notes: NoteSnapshot[] = pinnedNotes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    category: note.category,
    entity_name: null,
  }));
  for (const note of relevantNotes) {
    if (!notes.some(n => n.id === note.id)) {
      notes.push({
        id: note.id,
        title: note.title,
        content: note.content,
        category: note.category,
        entity_name: null,
        similarity: note.similarity,
      });
    }
  }

  // Map lists
  const lists: ListSnapshot[] = relevantLists.map((list) => ({
    id: list.id,
    name: list.name,
    description: list.description,
    list_type: list.list_type,
    entity_name: null,
    similarity: list.similarity,
  }));

  // Map documents
  const documents: DocumentSnapshot[] = docResults.chunks.map((chunk) => ({
    id: chunk.sourceId.split(':')[0] ?? chunk.sourceId,
    chunkId: chunk.sourceId,
    documentName: chunk.documentName,
    content: chunk.content,
    pageNumber: chunk.pageNumber,
    sectionTitle: chunk.sectionTitle,
    similarity: chunk.similarity,
    tokenCount: chunk.tokenCount,
  }));

  // Format output — schedule → continuity → state → support → summaries/memories → notes/lists/docs
  const scheduleMarkdown = formatScheduleMarkdown(liveSchedule);
  const continuityPreamble = await fetchContinuityPreamble();
  const stateContext = await fetchStateContext();
  const supportGuidance = await fetchSupportGuidance();
  let markdown = '';
  if (scheduleMarkdown) {
    markdown += scheduleMarkdown + '\n';
  }
  if (continuityPreamble) {
    markdown += continuityPreamble + '\n';
  }
  if (stateContext) {
    markdown += stateContext + '\n';
  }
  if (supportGuidance) {
    markdown += supportGuidance + '\n';
  }
  markdown += formatMarkdown(filteredMemories, entities, summaries, profile, query);

  if (notes.length > 0) {
    markdown += '\n' + formatNotesMarkdown(notes);
  }
  if (lists.length > 0) {
    markdown += '\n' + formatListsMarkdown(lists);
  }
  if (documents.length > 0) {
    markdown += '\n' + formatDocumentsMarkdown(documents);
  }
  const json = formatJson(filteredMemories, entities, summaries, notes, lists, documents, profile, query);

  return {
    generated_at: new Date().toISOString(),
    profile: profile.name,
    query,
    memories: filteredMemories,
    entities,
    summaries,
    notes,
    lists,
    documents,
    token_count: totalTokens,
    disclosure_id: disclosureId,
    markdown,
    json,
  };
}

/**
 * Get disclosure log entries
 */
export async function getDisclosureLog(
  limit = 20,
  conversationId?: string
): Promise<object[]> {
  let query = 'SELECT * FROM disclosure_log';
  const params: (string | number)[] = [];

  if (conversationId) {
    query += ' WHERE conversation_id = $1';
    params.push(conversationId);
    query += ' ORDER BY created_at DESC LIMIT $2';
    params.push(limit);
  } else {
    query += ' ORDER BY created_at DESC LIMIT $1';
    params.push(limit);
  }

  const result = await pool.query(query, params);
  return result.rows;
}
