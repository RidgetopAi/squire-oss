/**
 * Trends Service (Memory Upgrade Phase 5)
 *
 * Generates periodic trend summaries by aggregating state snapshots.
 * Notices drift patterns like "more stressed this month" or "project momentum stalling."
 */

import { pool } from '../../db/pool.js';
import { completeText } from '../../providers/llm.js';

// =============================================================================
// TYPES
// =============================================================================

export type TrendPeriodType = '7day' | '30day' | '90day';

export interface TrendSummary {
  id: string;
  period_type: TrendPeriodType;
  period_end: Date;
  stress_trend: number | null;    // -1=improving, 0=stable, 1=worsening
  energy_trend: number | null;
  motivation_trend: number | null;
  avg_stress: number | null;
  avg_energy: number | null;
  avg_motivation: number | null;
  threads_opened: number;
  threads_resolved: number;
  threads_stagnant: number;
  narrative: string | null;
  domain_breakdown: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// =============================================================================
// TREND GENERATION
// =============================================================================

/**
 * Generate a trend summary for a given period.
 * Aggregates state snapshots, compares with previous period, generates narrative.
 */
export async function generateTrendSummary(
  periodType: TrendPeriodType
): Promise<TrendSummary> {
  const now = new Date();
  const days = periodType === '7day' ? 7 : periodType === '30day' ? 30 : 90;
  const periodEnd = new Date(now);
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - days);

  // Previous period for comparison
  const prevStart = new Date(periodStart);
  prevStart.setDate(prevStart.getDate() - days);

  // Aggregate current period snapshots
  const currentAgg = await pool.query<{
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

  // Aggregate previous period for comparison
  const prevAgg = await pool.query<{
    avg_stress: string | null;
    avg_energy: string | null;
    avg_motivation: string | null;
  }>(
    `SELECT
       AVG(stress_level)::numeric(3,1) as avg_stress,
       AVG(energy_level)::numeric(3,1) as avg_energy,
       AVG(motivation_level)::numeric(3,1) as avg_motivation
     FROM state_snapshots
     WHERE period_type = 'daily'
       AND period_end >= $1 AND period_end < $2`,
    [prevStart, periodStart]
  );

  const curr = currentAgg.rows[0];
  const prev = prevAgg.rows[0];

  const avgStress = curr?.avg_stress ? parseFloat(curr.avg_stress) : null;
  const avgEnergy = curr?.avg_energy ? parseFloat(curr.avg_energy) : null;
  const avgMotivation = curr?.avg_motivation ? parseFloat(curr.avg_motivation) : null;

  const prevStress = prev?.avg_stress ? parseFloat(prev.avg_stress) : null;
  const prevEnergy = prev?.avg_energy ? parseFloat(prev.avg_energy) : null;
  const prevMotivation = prev?.avg_motivation ? parseFloat(prev.avg_motivation) : null;

  // Calculate trends: -1=improving, 0=stable, 1=worsening
  const stressTrend = computeTrend(avgStress, prevStress, true);  // higher stress = worse
  const energyTrend = computeTrend(avgEnergy, prevEnergy, false);  // higher energy = better
  const motivationTrend = computeTrend(avgMotivation, prevMotivation, false);

  // Thread activity in this period
  const threadActivity = await pool.query<{
    opened: string;
    resolved: string;
    stagnant: string;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM continuity_threads WHERE created_at >= $1 AND created_at <= $2) as opened,
       (SELECT COUNT(*) FROM continuity_threads WHERE resolved_at >= $1 AND resolved_at <= $2) as resolved,
       (SELECT COUNT(*) FROM continuity_threads
        WHERE status = 'active' AND last_discussed_at < $1) as stagnant`,
    [periodStart, periodEnd]
  );

  const activity = threadActivity.rows[0];
  const threadsOpened = parseInt(activity?.opened ?? '0', 10);
  const threadsResolved = parseInt(activity?.resolved ?? '0', 10);
  const threadsStagnant = parseInt(activity?.stagnant ?? '0', 10);

  // Generate narrative
  const narrative = await generateTrendNarrative(
    periodType, avgStress, avgEnergy, avgMotivation,
    stressTrend, energyTrend, motivationTrend,
    threadsOpened, threadsResolved, threadsStagnant
  );

  // Upsert trend summary
  const result = await pool.query<TrendSummary>(
    `INSERT INTO trend_summaries (
      period_type, period_end,
      stress_trend, energy_trend, motivation_trend,
      avg_stress, avg_energy, avg_motivation,
      threads_opened, threads_resolved, threads_stagnant,
      narrative
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (period_type, period_end)
    DO UPDATE SET
      stress_trend = EXCLUDED.stress_trend,
      energy_trend = EXCLUDED.energy_trend,
      motivation_trend = EXCLUDED.motivation_trend,
      avg_stress = EXCLUDED.avg_stress,
      avg_energy = EXCLUDED.avg_energy,
      avg_motivation = EXCLUDED.avg_motivation,
      threads_opened = EXCLUDED.threads_opened,
      threads_resolved = EXCLUDED.threads_resolved,
      threads_stagnant = EXCLUDED.threads_stagnant,
      narrative = EXCLUDED.narrative
    RETURNING *`,
    [
      periodType, periodEnd,
      stressTrend, energyTrend, motivationTrend,
      avgStress, avgEnergy, avgMotivation,
      threadsOpened, threadsResolved, threadsStagnant,
      narrative,
    ]
  );

  console.log(`[Trends] ${periodType} summary: stress=${avgStress?.toFixed(1)}, energy=${avgEnergy?.toFixed(1)}, motivation=${avgMotivation?.toFixed(1)}`);
  return result.rows[0]!;
}

/**
 * Get the most recent trend summary of a given type.
 */
export async function getLatestTrend(
  periodType: TrendPeriodType
): Promise<TrendSummary | null> {
  const result = await pool.query<TrendSummary>(
    `SELECT * FROM trend_summaries
     WHERE period_type = $1
     ORDER BY period_end DESC
     LIMIT 1`,
    [periodType]
  );
  return result.rows[0] ?? null;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Compute trend direction.
 * Returns -1 (improving), 0 (stable), or 1 (worsening).
 * @param inverted true if higher values are worse (e.g., stress)
 */
function computeTrend(
  current: number | null,
  previous: number | null,
  inverted: boolean
): number | null {
  if (current === null || previous === null) return null;
  const delta = current - previous;
  const threshold = 0.5; // Need at least 0.5 point change to count

  if (Math.abs(delta) < threshold) return 0; // stable

  if (inverted) {
    return delta > 0 ? 1 : -1; // higher stress = worsening
  } else {
    return delta > 0 ? -1 : 1; // higher energy = improving (note: returns -1 for improvement)
  }
}

async function generateTrendNarrative(
  periodType: TrendPeriodType,
  avgStress: number | null,
  avgEnergy: number | null,
  avgMotivation: number | null,
  stressTrend: number | null,
  energyTrend: number | null,
  motivationTrend: number | null,
  threadsOpened: number,
  threadsResolved: number,
  threadsStagnant: number
): Promise<string> {
  try {
    const trendLabel = (t: number | null) =>
      t === null ? 'unknown' : t === -1 ? 'improving' : t === 0 ? 'stable' : 'worsening';

    const context = [
      `Period: ${periodType}`,
      avgStress !== null ? `Avg stress: ${avgStress.toFixed(1)}/10 (${trendLabel(stressTrend)})` : null,
      avgEnergy !== null ? `Avg energy: ${avgEnergy.toFixed(1)}/10 (${trendLabel(energyTrend)})` : null,
      avgMotivation !== null ? `Avg motivation: ${avgMotivation.toFixed(1)}/10 (${trendLabel(motivationTrend)})` : null,
      `Threads: ${threadsOpened} opened, ${threadsResolved} resolved, ${threadsStagnant} stagnant`,
    ].filter(Boolean).join('\n');

    const response = await completeText(
      context,
      `Write a 2-3 sentence trend narrative about how this person has been doing over the ${periodType} period. Note any significant changes or patterns. Use "they" pronouns. Be warm and observational, not clinical. Return ONLY the narrative text.`,
      { temperature: 0.6, maxTokens: 150 }
    );

    return response.trim();
  } catch (error) {
    console.error('[Trends] Narrative generation failed:', error);
    return `Trend period: ${periodType}.`;
  }
}

// =============================================================================
// CONSOLIDATION INTEGRATION
// =============================================================================

/**
 * Process trends during consolidation.
 * Generates appropriate trend summaries based on current day/date.
 */
export async function processTrendsForConsolidation(): Promise<{
  trendsGenerated: string[];
}> {
  const trendsGenerated: string[] = [];
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sunday
  const dayOfMonth = now.getDate();

  // Always generate 7-day on Sundays
  if (dayOfWeek === 0) {
    try {
      await generateTrendSummary('7day');
      trendsGenerated.push('7day');
    } catch (error) {
      console.error('[Trends] 7-day summary failed:', error);
    }
  }

  // Generate 30-day on the 1st of the month
  if (dayOfMonth === 1) {
    try {
      await generateTrendSummary('30day');
      trendsGenerated.push('30day');
    } catch (error) {
      console.error('[Trends] 30-day summary failed:', error);
    }
  }

  // Generate 90-day quarterly (Jan 1, Apr 1, Jul 1, Oct 1)
  const month = now.getMonth();
  if (dayOfMonth === 1 && [0, 3, 6, 9].includes(month)) {
    try {
      await generateTrendSummary('90day');
      trendsGenerated.push('90day');
    } catch (error) {
      console.error('[Trends] 90-day summary failed:', error);
    }
  }

  if (trendsGenerated.length > 0) {
    console.log(`[Trends] Generated: ${trendsGenerated.join(', ')}`);
  }

  return { trendsGenerated };
}
