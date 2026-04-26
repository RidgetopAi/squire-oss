/**
 * State Snapshots Service (Memory Upgrade Phase 3)
 *
 * Generates periodic snapshots of the user's emotional/motivational state.
 * Detects concern signals by comparing current and previous snapshots.
 */

import { pool } from '../../db/pool.js';
import { completeText } from '../../providers/llm.js';
import { inferAffectFromRecent, type AffectSignals } from './affect.js';

// =============================================================================
// TYPES
// =============================================================================

export interface StateSnapshot {
  id: string;
  period_start: Date;
  period_end: Date;
  period_type: 'daily' | 'weekly';
  stress_level: number | null;
  energy_level: number | null;
  motivation_level: number | null;
  emotional_tone: string | null;
  dominant_pressures: string[];
  dominant_energizers: string[];
  open_loops_summary: string | null;
  open_loop_count: number;
  memories_analyzed: number;
  threads_active: number;
  narrative_summary: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface ConcernSignal {
  id: string;
  signal_type: string;
  description: string;
  severity: 'mild' | 'moderate' | 'significant';
  snapshot_id: string | null;
  thread_ids: string[];
  acknowledged_at: Date | null;
  resolved_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// =============================================================================
// SNAPSHOT GENERATION
// =============================================================================

/**
 * Generate a daily state snapshot.
 * Infers affect from last 24h of memories + threads, counts open loops,
 * generates a narrative summary.
 */
export async function generateDailySnapshot(): Promise<StateSnapshot> {
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setHours(0, 0, 0, 0);
  const periodEnd = new Date(now);
  periodEnd.setHours(23, 59, 59, 999); // Clamp to end-of-day to prevent duplicate snapshots

  // Infer affect from recent data
  const affect = await inferAffectFromRecent(24);

  // Count open loops (active threads + pending commitments)
  const loopCountResult = await pool.query<{ threads: string; commitments: string }>(
    `SELECT
       (SELECT COUNT(*) FROM continuity_threads WHERE status = 'active') as threads,
       (SELECT COUNT(*) FROM commitments WHERE status IN ('pending', 'in_progress')) as commitments`
  );
  const threadsActive = parseInt(loopCountResult.rows[0]?.threads ?? '0', 10);
  const commitmentsActive = parseInt(loopCountResult.rows[0]?.commitments ?? '0', 10);
  const openLoopCount = threadsActive + commitmentsActive;

  // Count active memories (recently accessed or high strength/salience)
  const memCountResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM memories
     WHERE (last_accessed_at > NOW() - INTERVAL '7 days' OR current_strength > 0.3 OR salience_score > 5.0)
       AND (conversation_mode IS NULL OR conversation_mode != 'meta_ai')`
  );
  const memoriesAnalyzed = parseInt(memCountResult.rows[0]?.count ?? '0', 10);

  // Generate narrative summary
  const narrative = await generateNarrativeSummary(affect, openLoopCount, threadsActive);

  // Build open loops summary
  const openLoopsSummary = openLoopCount > 0
    ? `${threadsActive} active threads, ${commitmentsActive} pending commitments`
    : null;

  // Insert snapshot (use upsert to handle re-runs)
  const result = await pool.query<StateSnapshot>(
    `INSERT INTO state_snapshots (
      period_start, period_end, period_type,
      stress_level, energy_level, motivation_level,
      emotional_tone, dominant_pressures, dominant_energizers,
      open_loops_summary, open_loop_count, memories_analyzed,
      threads_active, narrative_summary
    ) VALUES ($1, $2, 'daily', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (period_start, period_end, period_type)
    DO UPDATE SET
      stress_level = EXCLUDED.stress_level,
      energy_level = EXCLUDED.energy_level,
      motivation_level = EXCLUDED.motivation_level,
      emotional_tone = EXCLUDED.emotional_tone,
      dominant_pressures = EXCLUDED.dominant_pressures,
      dominant_energizers = EXCLUDED.dominant_energizers,
      open_loops_summary = EXCLUDED.open_loops_summary,
      open_loop_count = EXCLUDED.open_loop_count,
      memories_analyzed = EXCLUDED.memories_analyzed,
      threads_active = EXCLUDED.threads_active,
      narrative_summary = EXCLUDED.narrative_summary
    RETURNING *`,
    [
      periodStart, periodEnd,
      affect.stress, affect.energy, affect.motivation,
      affect.emotional_tone, affect.pressures, affect.energizers,
      openLoopsSummary, openLoopCount, memoriesAnalyzed,
      threadsActive, narrative,
    ]
  );

  console.log(`[StateSnapshots] Daily snapshot created: stress=${affect.stress}, energy=${affect.energy}, tone="${affect.emotional_tone}"`);
  return result.rows[0]!;
}

/**
 * Generate a weekly snapshot by aggregating daily snapshots.
 */
export async function generateWeeklySnapshot(): Promise<StateSnapshot> {
  const now = new Date();
  const periodEnd = new Date(now);
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - 7);

  // Aggregate daily snapshots
  const dailyResult = await pool.query<{
    avg_stress: string | null;
    avg_energy: string | null;
    avg_motivation: string | null;
    count: string;
  }>(
    `SELECT
       AVG(stress_level)::numeric(3,1) as avg_stress,
       AVG(energy_level)::numeric(3,1) as avg_energy,
       AVG(motivation_level)::numeric(3,1) as avg_motivation,
       COUNT(*) as count
     FROM state_snapshots
     WHERE period_type = 'daily'
       AND period_end >= $1 AND period_end <= $2`,
    [periodStart, periodEnd]
  );

  const agg = dailyResult.rows[0];
  const stress = agg?.avg_stress ? Math.round(parseFloat(agg.avg_stress)) : null;
  const energy = agg?.avg_energy ? Math.round(parseFloat(agg.avg_energy)) : null;
  const motivation = agg?.avg_motivation ? Math.round(parseFloat(agg.avg_motivation)) : null;

  // Get current affect for tone
  const affect = await inferAffectFromRecent(168); // 7 days

  const narrative = await generateNarrativeSummary(
    { ...affect, stress, energy, motivation },
    0, 0, 'weekly'
  );

  const result = await pool.query<StateSnapshot>(
    `INSERT INTO state_snapshots (
      period_start, period_end, period_type,
      stress_level, energy_level, motivation_level,
      emotional_tone, dominant_pressures, dominant_energizers,
      narrative_summary
    ) VALUES ($1, $2, 'weekly', $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (period_start, period_end, period_type)
    DO UPDATE SET
      stress_level = EXCLUDED.stress_level,
      energy_level = EXCLUDED.energy_level,
      motivation_level = EXCLUDED.motivation_level,
      emotional_tone = EXCLUDED.emotional_tone,
      dominant_pressures = EXCLUDED.dominant_pressures,
      dominant_energizers = EXCLUDED.dominant_energizers,
      narrative_summary = EXCLUDED.narrative_summary
    RETURNING *`,
    [
      periodStart, periodEnd,
      stress, energy, motivation,
      affect.emotional_tone, affect.pressures, affect.energizers,
      narrative,
    ]
  );

  return result.rows[0]!;
}

/**
 * Get the most recent snapshot of a given type.
 */
export async function getCurrentSnapshot(
  periodType: 'daily' | 'weekly' = 'daily'
): Promise<StateSnapshot | null> {
  const result = await pool.query<StateSnapshot>(
    `SELECT * FROM state_snapshots
     WHERE period_type = $1
     ORDER BY period_end DESC
     LIMIT 1`,
    [periodType]
  );
  return result.rows[0] ?? null;
}

// =============================================================================
// CONCERN SIGNALS
// =============================================================================

/**
 * Detect concern signals by comparing current snapshot to previous.
 */
export async function detectConcernSignals(
  current: StateSnapshot,
  previous: StateSnapshot | null
): Promise<ConcernSignal[]> {
  const signals: ConcernSignal[] = [];

  // Stress spike: current stress >= 7 and either no previous or jumped 2+ points
  if (current.stress_level && current.stress_level >= 7) {
    const jump = previous?.stress_level ? current.stress_level - previous.stress_level : 0;
    if (jump >= 2 || current.stress_level >= 8) {
      const severity = current.stress_level >= 9 ? 'significant' : current.stress_level >= 8 ? 'moderate' : 'mild';
      const signal = await createConcernSignal({
        signal_type: 'stress_spike',
        description: jump >= 2
          ? `Stress jumped from ${previous?.stress_level} to ${current.stress_level} in one day`
          : `High stress level: ${current.stress_level}/10`,
        severity,
        snapshot_id: current.id,
      });
      signals.push(signal);
    }
  }

  // Energy drop: current energy <= 3 and dropped 2+ points
  if (current.energy_level && current.energy_level <= 3) {
    const drop = previous?.energy_level ? previous.energy_level - current.energy_level : 0;
    if (drop >= 2 || current.energy_level <= 2) {
      const signal = await createConcernSignal({
        signal_type: 'energy_drop',
        description: drop >= 2
          ? `Energy dropped from ${previous?.energy_level} to ${current.energy_level}`
          : `Low energy: ${current.energy_level}/10`,
        severity: current.energy_level <= 2 ? 'moderate' : 'mild',
        snapshot_id: current.id,
      });
      signals.push(signal);
    }
  }

  // Overcommitment: too many open loops
  if (current.open_loop_count >= 10) {
    const severity = current.open_loop_count >= 15 ? 'significant' : 'moderate';
    const signal = await createConcernSignal({
      signal_type: 'overcommitment',
      description: `${current.open_loop_count} open loops (threads + commitments)`,
      severity,
      snapshot_id: current.id,
    });
    signals.push(signal);
  }

  // Positive momentum: stress <= 3 and motivation >= 7
  if (current.stress_level && current.stress_level <= 3 &&
      current.motivation_level && current.motivation_level >= 7) {
    const signal = await createConcernSignal({
      signal_type: 'positive_momentum',
      description: `Low stress (${current.stress_level}) with high motivation (${current.motivation_level})`,
      severity: 'mild',
      snapshot_id: current.id,
    });
    signals.push(signal);
  }

  return signals;
}

async function createConcernSignal(input: {
  signal_type: string;
  description: string;
  severity: 'mild' | 'moderate' | 'significant';
  snapshot_id?: string;
  thread_ids?: string[];
}): Promise<ConcernSignal> {
  const result = await pool.query<ConcernSignal>(
    `INSERT INTO concern_signals (signal_type, description, severity, snapshot_id, thread_ids)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.signal_type,
      input.description,
      input.severity,
      input.snapshot_id ?? null,
      input.thread_ids ?? [],
    ]
  );
  return result.rows[0]!;
}

// =============================================================================
// NARRATIVE GENERATION
// =============================================================================

async function generateNarrativeSummary(
  affect: AffectSignals,
  openLoopCount: number,
  threadsActive: number,
  periodType: string = 'daily'
): Promise<string> {
  try {
    const context = [
      `Period: ${periodType}`,
      affect.stress !== null ? `Stress: ${affect.stress}/10` : null,
      affect.energy !== null ? `Energy: ${affect.energy}/10` : null,
      affect.motivation !== null ? `Motivation: ${affect.motivation}/10` : null,
      `Tone: ${affect.emotional_tone}`,
      affect.pressures.length > 0 ? `Pressures: ${affect.pressures.join(', ')}` : null,
      affect.energizers.length > 0 ? `Energizers: ${affect.energizers.join(', ')}` : null,
      openLoopCount > 0 ? `Open loops: ${openLoopCount}` : null,
      threadsActive > 0 ? `Active threads: ${threadsActive}` : null,
    ].filter(Boolean).join('\n');

    const response = await completeText(
      context,
      `Write a 2-3 sentence narrative summary of how this person seems to be doing. Write as if you know them well. Use "they" pronouns. Be warm but honest. No bullet points, just flowing prose. Return ONLY the narrative text.`,
      { temperature: 0.6, maxTokens: 150 }
    );

    return response.trim();
  } catch (error) {
    console.error('[StateSnapshots] Narrative generation failed:', error);
    return `Emotional tone: ${affect.emotional_tone}.`;
  }
}

// =============================================================================
// CONSOLIDATION INTEGRATION
// =============================================================================

/**
 * Process state snapshot during consolidation.
 * Generates daily snapshot and detects concern signals.
 */
export async function processStateSnapshot(): Promise<{
  snapshotCreated: boolean;
  concernsDetected: number;
}> {
  try {
    // Get previous snapshot for comparison
    const previous = await getCurrentSnapshot('daily');

    // Generate new daily snapshot
    const snapshot = await generateDailySnapshot();

    // Detect concern signals
    const concerns = await detectConcernSignals(snapshot, previous);

    if (concerns.length > 0) {
      console.log(`[StateSnapshots] Detected ${concerns.length} concern signal(s): ${concerns.map(c => c.signal_type).join(', ')}`);
    }

    return {
      snapshotCreated: true,
      concernsDetected: concerns.length,
    };
  } catch (error) {
    console.error('[StateSnapshots] Snapshot processing failed:', error);
    return { snapshotCreated: false, concernsDetected: 0 };
  }
}

/**
 * Get the latest snapshot narrative for context injection.
 */
export async function getLatestSnapshotNarrative(): Promise<string | null> {
  const snapshot = await getCurrentSnapshot('daily');
  return snapshot?.narrative_summary ?? null;
}

/**
 * Get unacknowledged concern signals for internal awareness.
 */
export async function getUnacknowledgedConcerns(): Promise<ConcernSignal[]> {
  const result = await pool.query<ConcernSignal>(
    `SELECT * FROM concern_signals
     WHERE acknowledged_at IS NULL
       AND resolved_at IS NULL
       AND created_at > NOW() - INTERVAL '7 days'
     ORDER BY
       CASE severity WHEN 'significant' THEN 0 WHEN 'moderate' THEN 1 ELSE 2 END,
       created_at DESC
     LIMIT 5`
  );
  return result.rows;
}
