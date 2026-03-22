/**
 * Memory Health Module for Daily Brief
 *
 * Queries PostgreSQL to generate a comprehensive report on:
 * - Checkpoint status (continuity tables health)
 * - Active threads (the heart of Squire's memory)
 * - State snapshots (stress/energy/motivation over time)
 * - Trend intelligence (7/30/90 day trends)
 * - System health (memory volume, consolidation activity)
 */

import { pool } from '../../../db/pool.js';
import type {
  BriefModule,
  ModuleResult,
  ThreadRow,
  StateSnapshotRow,
  TrendSummaryRow,
  CheckpointStats,
  SystemHealthStats,
} from '../types.js';

// Color palette
const COLORS = {
  headerBg: '#1a1a2e',
  accent: '#4f8ef7',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  text: '#1f2937',
  muted: '#6b7280',
  cardBg: '#f9fafb',
  white: '#ffffff',
  border: '#e5e7eb',
};

/**
 * Helper to format dates nicely
 */
function formatDate(date: Date | null): string {
  if (!date) return 'Never';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${Math.round(diffHours)}h ago`;
  if (diffDays < 7) return `${Math.round(diffDays)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Helper to format dates with time
 */
function formatDateTime(date: Date | null): string {
  if (!date) return 'Never';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Get status indicator based on freshness
 */
function getStatusIndicator(
  hasData: boolean,
  lastActivity: Date | null,
  staleThresholdHours = 48
): { icon: string; color: string; status: string } {
  if (!hasData) {
    return { icon: '✗', color: COLORS.danger, status: 'Empty' };
  }

  if (!lastActivity) {
    return { icon: '⚠', color: COLORS.warning, status: 'No activity' };
  }

  const hoursAgo = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);

  if (hoursAgo < staleThresholdHours) {
    return { icon: '✓', color: COLORS.success, status: 'Active' };
  }

  return { icon: '⚠', color: COLORS.warning, status: 'Stale' };
}

/**
 * Get trend arrow
 */
function getTrendArrow(trend: string | null): { arrow: string; color: string } {
  if (!trend) return { arrow: '—', color: COLORS.muted };

  const normalized = trend.toLowerCase();
  if (normalized.includes('improv') || normalized.includes('up') || normalized.includes('increas')) {
    return { arrow: '↑', color: COLORS.success };
  }
  if (normalized.includes('declin') || normalized.includes('down') || normalized.includes('decreas') || normalized.includes('worsen')) {
    return { arrow: '↓', color: COLORS.danger };
  }
  return { arrow: '→', color: COLORS.muted };
}

/**
 * Query checkpoint statistics from all continuity tables
 */
async function getCheckpointStats(): Promise<CheckpointStats> {
  const [threadsResult, snapshotsResult, trendsResult, beliefsResult, eventsResult] =
    await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
          COUNT(*) FILTER (WHERE status = 'dormant') as dormant,
          MAX(updated_at) as last_updated
        FROM continuity_threads
      `),
      pool.query(`
        SELECT
          COUNT(*) as total,
          MAX(period_end) as latest_snapshot,
          COUNT(*) FILTER (WHERE period_end > NOW() - INTERVAL '7 days') as last_7_days
        FROM state_snapshots
      `),
      pool.query(`
        SELECT COUNT(*) as total, MAX(period_end) as latest
        FROM trend_summaries
      `),
      pool.query(`
        SELECT COUNT(*) as total, MAX(updated_at) as last_updated
        FROM beliefs
        WHERE belief_type IN ('support_preference','trigger_sensitivity','protective_priority','vulnerability_theme')
      `),
      pool.query(`
        SELECT COUNT(*) as total, MAX(created_at) as latest
        FROM continuity_events
      `),
    ]);

  const threads = threadsResult.rows[0];
  const snapshots = snapshotsResult.rows[0];
  const trends = trendsResult.rows[0];
  const beliefs = beliefsResult.rows[0];
  const events = eventsResult.rows[0];

  return {
    continuityThreads: {
      total: parseInt(threads.total) || 0,
      active: parseInt(threads.active) || 0,
      resolved: parseInt(threads.resolved) || 0,
      dormant: parseInt(threads.dormant) || 0,
      lastUpdated: threads.last_updated ? new Date(threads.last_updated) : null,
    },
    stateSnapshots: {
      total: parseInt(snapshots.total) || 0,
      latestSnapshot: snapshots.latest_snapshot ? new Date(snapshots.latest_snapshot) : null,
      last7Days: parseInt(snapshots.last_7_days) || 0,
    },
    trendSummaries: {
      total: parseInt(trends.total) || 0,
      latest: trends.latest ? new Date(trends.latest) : null,
    },
    beliefs: {
      total: parseInt(beliefs.total) || 0,
      lastUpdated: beliefs.last_updated ? new Date(beliefs.last_updated) : null,
    },
    continuityEvents: {
      total: parseInt(events.total) || 0,
      latest: events.latest ? new Date(events.latest) : null,
    },
  };
}

/**
 * Query active threads
 */
async function getActiveThreads(): Promise<ThreadRow[]> {
  const result = await pool.query<ThreadRow>(`
    SELECT title, thread_type, status, importance, emotional_weight,
           current_state_summary, last_discussed_at, next_followup_question,
           followup_after
    FROM continuity_threads
    WHERE status IN ('active', 'watching')
    ORDER BY importance DESC, emotional_weight DESC
    LIMIT 10
  `);
  return result.rows;
}

/**
 * Query recent state snapshots
 */
async function getStateSnapshots(): Promise<StateSnapshotRow[]> {
  const result = await pool.query<StateSnapshotRow>(`
    SELECT period_end, stress_level, energy_level, motivation_level,
           emotional_tone, narrative_summary, dominant_pressures, dominant_energizers
    FROM state_snapshots
    WHERE period_type = 'daily'
    ORDER BY period_end DESC
    LIMIT 7
  `);
  return result.rows;
}

/**
 * Query trend summaries
 */
async function getTrendSummaries(): Promise<TrendSummaryRow[]> {
  const result = await pool.query<TrendSummaryRow>(`
    SELECT period_type, period_end, stress_trend, energy_trend, motivation_trend,
           avg_stress, avg_energy, avg_motivation, narrative,
           threads_opened, threads_resolved, threads_stagnant
    FROM trend_summaries
    ORDER BY period_end DESC, period_type ASC
    LIMIT 6
  `);
  return result.rows;
}

/**
 * Query system health stats
 */
async function getSystemHealth(): Promise<SystemHealthStats> {
  const [memoriesResult, eventsResult] = await Promise.all([
    pool.query(`
      SELECT COUNT(*) as total_memories,
             COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7_days,
             COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24_hours
      FROM memories
    `),
    pool.query(`
      SELECT COUNT(*) as total, MAX(created_at) as latest
      FROM continuity_events
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `),
  ]);

  const memories = memoriesResult.rows[0];
  const events = eventsResult.rows[0];

  return {
    totalMemories: parseInt(memories.total_memories) || 0,
    last7Days: parseInt(memories.last_7_days) || 0,
    last24Hours: parseInt(memories.last_24_hours) || 0,
    recentEvents: parseInt(events.total) || 0,
    latestEvent: events.latest ? new Date(events.latest) : null,
  };
}

/**
 * Generate sparkline SVG for state metrics
 */
function generateSparklineSvg(snapshots: StateSnapshotRow[]): string {
  if (snapshots.length === 0) {
    return `
      <div style="text-align: center; padding: 20px; color: ${COLORS.muted};">
        No state snapshots yet — this chart will show stress, energy, and motivation trends over the past week.
      </div>
    `;
  }

  // Reverse to get chronological order
  const data = [...snapshots].reverse();
  const width = 400;
  const height = 80;
  const padding = { top: 10, right: 10, bottom: 20, left: 30 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Get values (default to 5 if null)
  const stressValues = data.map((d) => d.stress_level ?? 5);
  const energyValues = data.map((d) => d.energy_level ?? 5);
  const motivationValues = data.map((d) => d.motivation_level ?? 5);

  const minVal = 1;
  const maxVal = 10;

  // Helper to generate path
  const generatePath = (values: number[]): string => {
    const points = values.map((v, i) => {
      const x = padding.left + (i / Math.max(values.length - 1, 1)) * chartWidth;
      const y = padding.top + chartHeight - ((v - minVal) / (maxVal - minVal)) * chartHeight;
      return `${x},${y}`;
    });
    return `M ${points.join(' L ')}`;
  };

  // Generate dots
  const generateDots = (values: number[], color: string): string => {
    return values
      .map((v, i) => {
        const x = padding.left + (i / Math.max(values.length - 1, 1)) * chartWidth;
        const y = padding.top + chartHeight - ((v - minVal) / (maxVal - minVal)) * chartHeight;
        return `<circle cx="${x}" cy="${y}" r="3" fill="${color}" />`;
      })
      .join('');
  };

  // Generate day labels
  const dayLabels = data
    .map((d, i) => {
      const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
      const dayName = new Date(d.period_end).toLocaleDateString('en-US', { weekday: 'short' });
      return `<text x="${x}" y="${height - 2}" text-anchor="middle" font-size="9" fill="${COLORS.muted}">${dayName}</text>`;
    })
    .join('');

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display: block; margin: 0 auto;">
      <!-- Grid lines -->
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}" stroke="${COLORS.border}" stroke-width="1"/>
      <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}" stroke="${COLORS.border}" stroke-width="1"/>

      <!-- Horizontal grid lines -->
      <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="${COLORS.border}" stroke-width="0.5" stroke-dasharray="2"/>
      <line x1="${padding.left}" y1="${padding.top + chartHeight / 2}" x2="${width - padding.right}" y2="${padding.top + chartHeight / 2}" stroke="${COLORS.border}" stroke-width="0.5" stroke-dasharray="2"/>

      <!-- Y-axis labels -->
      <text x="${padding.left - 5}" y="${padding.top + 4}" text-anchor="end" font-size="9" fill="${COLORS.muted}">10</text>
      <text x="${padding.left - 5}" y="${padding.top + chartHeight / 2 + 3}" text-anchor="end" font-size="9" fill="${COLORS.muted}">5</text>
      <text x="${padding.left - 5}" y="${padding.top + chartHeight + 3}" text-anchor="end" font-size="9" fill="${COLORS.muted}">1</text>

      <!-- Lines -->
      <path d="${generatePath(stressValues)}" fill="none" stroke="${COLORS.danger}" stroke-width="2" opacity="0.8"/>
      <path d="${generatePath(energyValues)}" fill="none" stroke="${COLORS.success}" stroke-width="2" opacity="0.8"/>
      <path d="${generatePath(motivationValues)}" fill="none" stroke="${COLORS.accent}" stroke-width="2" opacity="0.8"/>

      <!-- Dots -->
      ${generateDots(stressValues, COLORS.danger)}
      ${generateDots(energyValues, COLORS.success)}
      ${generateDots(motivationValues, COLORS.accent)}

      <!-- Day labels -->
      ${dayLabels}
    </svg>

    <div style="display: flex; justify-content: center; gap: 20px; margin-top: 8px; font-size: 11px;">
      <span><span style="color: ${COLORS.danger};">●</span> Stress</span>
      <span><span style="color: ${COLORS.success};">●</span> Energy</span>
      <span><span style="color: ${COLORS.accent};">●</span> Motivation</span>
    </div>
  `;
}

/**
 * Render Section A: Checkpoint Status
 */
function renderCheckpointStatus(stats: CheckpointStats): string {
  const rows = [
    {
      name: 'Continuity Threads',
      count: stats.continuityThreads.total,
      detail: `${stats.continuityThreads.active} active, ${stats.continuityThreads.resolved} resolved`,
      lastActivity: stats.continuityThreads.lastUpdated,
    },
    {
      name: 'State Snapshots',
      count: stats.stateSnapshots.total,
      detail: `${stats.stateSnapshots.last7Days} in last 7 days`,
      lastActivity: stats.stateSnapshots.latestSnapshot,
    },
    {
      name: 'Trend Summaries',
      count: stats.trendSummaries.total,
      detail: '',
      lastActivity: stats.trendSummaries.latest,
    },
    {
      name: 'Support Beliefs',
      count: stats.beliefs.total,
      detail: 'preferences, sensitivities, priorities',
      lastActivity: stats.beliefs.lastUpdated,
    },
    {
      name: 'Continuity Events',
      count: stats.continuityEvents.total,
      detail: '',
      lastActivity: stats.continuityEvents.latest,
    },
  ];

  const tableRows = rows
    .map((row) => {
      const status = getStatusIndicator(row.count > 0, row.lastActivity);
      return `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid ${COLORS.border};">
            <span style="color: ${status.color}; font-weight: bold; margin-right: 8px;">${status.icon}</span>
            ${row.name}
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid ${COLORS.border}; text-align: center; font-weight: 600;">
            ${row.count}
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.muted}; font-size: 13px;">
            ${row.detail}
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.muted}; font-size: 13px;">
            ${formatDate(row.lastActivity)}
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div style="background: ${COLORS.white}; border-radius: 8px; overflow: hidden; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: ${COLORS.cardBg}; padding: 12px 16px; border-bottom: 1px solid ${COLORS.border};">
        <h3 style="margin: 0; font-size: 16px; color: ${COLORS.text};">📊 Checkpoint Status</h3>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background: ${COLORS.cardBg};">
            <th style="padding: 8px 12px; text-align: left; font-weight: 600; color: ${COLORS.muted}; font-size: 12px; text-transform: uppercase;">Table</th>
            <th style="padding: 8px 12px; text-align: center; font-weight: 600; color: ${COLORS.muted}; font-size: 12px; text-transform: uppercase;">Count</th>
            <th style="padding: 8px 12px; text-align: left; font-weight: 600; color: ${COLORS.muted}; font-size: 12px; text-transform: uppercase;">Detail</th>
            <th style="padding: 8px 12px; text-align: left; font-weight: 600; color: ${COLORS.muted}; font-size: 12px; text-transform: uppercase;">Last Activity</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Render Section B: Active Threads
 */
function renderActiveThreads(threads: ThreadRow[]): string {
  if (threads.length === 0) {
    return `
      <div style="background: ${COLORS.white}; border-radius: 8px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
        <div style="background: ${COLORS.cardBg}; padding: 12px 16px; margin: -24px -24px 16px -24px; border-bottom: 1px solid ${COLORS.border};">
          <h3 style="margin: 0; font-size: 16px; color: ${COLORS.text};">🧵 Active Threads</h3>
        </div>
        <p style="color: ${COLORS.muted}; margin: 0;">
          No active threads yet — these are ongoing topics and conversations Squire tracks for continuity.
        </p>
      </div>
    `;
  }

  const threadCards = threads
    .map((thread) => {
      const importanceWidth = Math.min((thread.importance / 10) * 100, 100);
      const emotionalWidth = Math.min((thread.emotional_weight / 10) * 100, 100);

      // Thread type badge colors
      const typeColors: Record<string, string> = {
        emotional: '#ec4899',
        practical: '#3b82f6',
        relational: '#8b5cf6',
        creative: '#f59e0b',
        health: '#22c55e',
        work: '#6366f1',
      };
      const badgeColor = typeColors[thread.thread_type] || COLORS.muted;

      return `
        <div style="background: ${COLORS.white}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div>
              <span style="display: inline-block; background: ${badgeColor}; color: white; font-size: 10px; padding: 2px 8px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 8px;">
                ${thread.thread_type}
              </span>
              <span style="display: inline-block; background: ${thread.status === 'active' ? COLORS.success : COLORS.warning}20; color: ${thread.status === 'active' ? COLORS.success : COLORS.warning}; font-size: 10px; padding: 2px 8px; border-radius: 12px;">
                ${thread.status}
              </span>
            </div>
            <span style="color: ${COLORS.muted}; font-size: 12px;">${formatDate(thread.last_discussed_at)}</span>
          </div>

          <h4 style="margin: 0 0 8px 0; font-size: 15px; color: ${COLORS.text};">${thread.title}</h4>

          ${thread.current_state_summary ? `<p style="margin: 0 0 12px 0; color: ${COLORS.muted}; font-size: 13px; line-height: 1.5;">${thread.current_state_summary}</p>` : ''}

          <div style="display: flex; gap: 24px; margin-bottom: 8px;">
            <div style="flex: 1;">
              <div style="font-size: 11px; color: ${COLORS.muted}; margin-bottom: 4px;">Importance</div>
              <div style="background: ${COLORS.cardBg}; border-radius: 4px; height: 8px; overflow: hidden;">
                <div style="background: ${COLORS.accent}; height: 100%; width: ${importanceWidth}%;"></div>
              </div>
            </div>
            <div style="flex: 1;">
              <div style="font-size: 11px; color: ${COLORS.muted}; margin-bottom: 4px;">Emotional Weight</div>
              <div style="background: ${COLORS.cardBg}; border-radius: 4px; height: 8px; overflow: hidden;">
                <div style="background: #ec4899; height: 100%; width: ${emotionalWidth}%;"></div>
              </div>
            </div>
          </div>

          ${thread.next_followup_question ? `
            <div style="background: ${COLORS.accent}10; border-left: 3px solid ${COLORS.accent}; padding: 8px 12px; margin-top: 12px; border-radius: 0 4px 4px 0;">
              <div style="font-size: 11px; color: ${COLORS.accent}; font-weight: 600; margin-bottom: 4px;">Follow-up Question</div>
              <div style="font-size: 13px; color: ${COLORS.text};">${thread.next_followup_question}</div>
            </div>
          ` : ''}
        </div>
      `;
    })
    .join('');

  return `
    <div style="margin-bottom: 24px;">
      <div style="background: ${COLORS.cardBg}; padding: 12px 16px; border-radius: 8px 8px 0 0; border: 1px solid ${COLORS.border}; border-bottom: none;">
        <h3 style="margin: 0; font-size: 16px; color: ${COLORS.text};">🧵 Active Threads</h3>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: ${COLORS.muted};">Ongoing conversations and topics Squire is tracking</p>
      </div>
      <div style="background: ${COLORS.cardBg}; padding: 16px; border-radius: 0 0 8px 8px; border: 1px solid ${COLORS.border}; border-top: none;">
        ${threadCards}
      </div>
    </div>
  `;
}

/**
 * Render Section C: State This Week
 */
function renderStateSnapshots(snapshots: StateSnapshotRow[]): string {
  const latestSnapshot = snapshots[0];

  const sparkline = generateSparklineSvg(snapshots);

  const latestSection = latestSnapshot
    ? `
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid ${COLORS.border};">
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          ${latestSnapshot.emotional_tone ? `
            <div style="flex: 1; min-width: 200px;">
              <div style="font-size: 11px; color: ${COLORS.muted}; text-transform: uppercase; margin-bottom: 4px;">Emotional Tone</div>
              <div style="font-size: 14px; color: ${COLORS.text};">${latestSnapshot.emotional_tone}</div>
            </div>
          ` : ''}
          ${latestSnapshot.dominant_pressures && latestSnapshot.dominant_pressures.length > 0 ? `
            <div style="flex: 1; min-width: 200px;">
              <div style="font-size: 11px; color: ${COLORS.muted}; text-transform: uppercase; margin-bottom: 4px;">Current Pressures</div>
              <div style="font-size: 13px; color: ${COLORS.text};">${latestSnapshot.dominant_pressures.join(', ')}</div>
            </div>
          ` : ''}
          ${latestSnapshot.dominant_energizers && latestSnapshot.dominant_energizers.length > 0 ? `
            <div style="flex: 1; min-width: 200px;">
              <div style="font-size: 11px; color: ${COLORS.muted}; text-transform: uppercase; margin-bottom: 4px;">Current Energizers</div>
              <div style="font-size: 13px; color: ${COLORS.text};">${latestSnapshot.dominant_energizers.join(', ')}</div>
            </div>
          ` : ''}
        </div>
        ${latestSnapshot.narrative_summary ? `
          <div style="margin-top: 12px;">
            <div style="font-size: 11px; color: ${COLORS.muted}; text-transform: uppercase; margin-bottom: 4px;">Latest Narrative</div>
            <div style="font-size: 13px; color: ${COLORS.text}; line-height: 1.5;">${latestSnapshot.narrative_summary}</div>
          </div>
        ` : ''}
      </div>
    `
    : '';

  return `
    <div style="background: ${COLORS.white}; border-radius: 8px; overflow: hidden; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: ${COLORS.cardBg}; padding: 12px 16px; border-bottom: 1px solid ${COLORS.border};">
        <h3 style="margin: 0; font-size: 16px; color: ${COLORS.text};">📈 State This Week</h3>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: ${COLORS.muted};">Stress, energy, and motivation levels over the past 7 days</p>
      </div>
      <div style="padding: 16px;">
        ${sparkline}
        ${latestSection}
      </div>
    </div>
  `;
}

/**
 * Render Section D: Trend Intelligence
 */
function renderTrendSummaries(trends: TrendSummaryRow[]): string {
  if (trends.length === 0) {
    return `
      <div style="background: ${COLORS.white}; border-radius: 8px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
        <div style="background: ${COLORS.cardBg}; padding: 12px 16px; margin: -24px -24px 16px -24px; border-bottom: 1px solid ${COLORS.border};">
          <h3 style="margin: 0; font-size: 16px; color: ${COLORS.text};">📊 Trend Intelligence</h3>
        </div>
        <p style="color: ${COLORS.muted}; margin: 0;">
          No trend data yet — trends will show 7-day, 30-day, and 90-day patterns as data accumulates.
        </p>
      </div>
    `;
  }

  // Group by period type
  const byPeriod: Record<string, TrendSummaryRow> = {};
  for (const trend of trends) {
    if (!byPeriod[trend.period_type]) {
      byPeriod[trend.period_type] = trend;
    }
  }

  const periodLabels: Record<string, string> = {
    '7d': '7 Day',
    '30d': '30 Day',
    '90d': '90 Day',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
  };

  const trendCards = Object.entries(byPeriod)
    .map(([periodType, trend]) => {
      const stressTrend = getTrendArrow(trend.stress_trend);
      const energyTrend = getTrendArrow(trend.energy_trend);
      const motivationTrend = getTrendArrow(trend.motivation_trend);

      return `
        <div style="flex: 1; min-width: 200px; background: ${COLORS.cardBg}; border-radius: 8px; padding: 16px; border: 1px solid ${COLORS.border};">
          <div style="font-size: 14px; font-weight: 600; color: ${COLORS.text}; margin-bottom: 12px;">
            ${periodLabels[periodType] || periodType}
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; color: ${COLORS.muted};">Stress</span>
              <span style="font-size: 16px; color: ${stressTrend.color}; font-weight: bold;">${stressTrend.arrow}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; color: ${COLORS.muted};">Energy</span>
              <span style="font-size: 16px; color: ${energyTrend.color}; font-weight: bold;">${energyTrend.arrow}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; color: ${COLORS.muted};">Motivation</span>
              <span style="font-size: 16px; color: ${motivationTrend.color}; font-weight: bold;">${motivationTrend.arrow}</span>
            </div>
          </div>

          <div style="border-top: 1px solid ${COLORS.border}; padding-top: 12px; display: flex; gap: 12px; font-size: 11px;">
            <div>
              <span style="color: ${COLORS.success};">+${trend.threads_opened ?? 0}</span>
              <span style="color: ${COLORS.muted};"> opened</span>
            </div>
            <div>
              <span style="color: ${COLORS.accent};">✓${trend.threads_resolved ?? 0}</span>
              <span style="color: ${COLORS.muted};"> resolved</span>
            </div>
            ${(trend.threads_stagnant ?? 0) > 0 ? `
              <div>
                <span style="color: ${COLORS.warning};">⚠${trend.threads_stagnant}</span>
                <span style="color: ${COLORS.muted};"> stagnant</span>
              </div>
            ` : ''}
          </div>

          ${trend.narrative ? `
            <div style="margin-top: 12px; font-size: 12px; color: ${COLORS.text}; line-height: 1.4;">
              ${trend.narrative.substring(0, 150)}${trend.narrative.length > 150 ? '...' : ''}
            </div>
          ` : ''}
        </div>
      `;
    })
    .join('');

  return `
    <div style="margin-bottom: 24px;">
      <div style="background: ${COLORS.cardBg}; padding: 12px 16px; border-radius: 8px 8px 0 0; border: 1px solid ${COLORS.border}; border-bottom: none;">
        <h3 style="margin: 0; font-size: 16px; color: ${COLORS.text};">📊 Trend Intelligence</h3>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: ${COLORS.muted};">Patterns across different time periods</p>
      </div>
      <div style="background: ${COLORS.white}; padding: 16px; border-radius: 0 0 8px 8px; border: 1px solid ${COLORS.border}; border-top: none;">
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          ${trendCards}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Section E: System Health
 */
function renderSystemHealth(health: SystemHealthStats): string {
  return `
    <div style="background: ${COLORS.white}; border-radius: 8px; overflow: hidden; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: ${COLORS.cardBg}; padding: 12px 16px; border-bottom: 1px solid ${COLORS.border};">
        <h3 style="margin: 0; font-size: 16px; color: ${COLORS.text};">🔧 System Health</h3>
      </div>
      <div style="padding: 16px;">
        <div style="display: flex; gap: 24px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 140px; text-align: center; padding: 12px; background: ${COLORS.cardBg}; border-radius: 8px;">
            <div style="font-size: 28px; font-weight: bold; color: ${COLORS.text};">${health.totalMemories.toLocaleString()}</div>
            <div style="font-size: 12px; color: ${COLORS.muted};">Total Memories</div>
          </div>
          <div style="flex: 1; min-width: 140px; text-align: center; padding: 12px; background: ${COLORS.cardBg}; border-radius: 8px;">
            <div style="font-size: 28px; font-weight: bold; color: ${COLORS.accent};">${health.last7Days}</div>
            <div style="font-size: 12px; color: ${COLORS.muted};">Last 7 Days</div>
          </div>
          <div style="flex: 1; min-width: 140px; text-align: center; padding: 12px; background: ${COLORS.cardBg}; border-radius: 8px;">
            <div style="font-size: 28px; font-weight: bold; color: ${COLORS.success};">${health.last24Hours}</div>
            <div style="font-size: 12px; color: ${COLORS.muted};">Last 24 Hours</div>
          </div>
          <div style="flex: 1; min-width: 140px; text-align: center; padding: 12px; background: ${COLORS.cardBg}; border-radius: 8px;">
            <div style="font-size: 28px; font-weight: bold; color: ${health.recentEvents > 0 ? COLORS.success : COLORS.muted};">${health.recentEvents}</div>
            <div style="font-size: 12px; color: ${COLORS.muted};">Events (24h)</div>
          </div>
        </div>
        ${health.latestEvent ? `
          <div style="margin-top: 12px; font-size: 12px; color: ${COLORS.muted}; text-align: center;">
            Last consolidation event: ${formatDateTime(health.latestEvent)}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Memory Health Module Implementation
 */
export const memoryHealthModule: BriefModule = {
  title: 'Memory Health',

  async render(): Promise<ModuleResult> {
    const alerts: string[] = [];

    try {
      // Fetch all data in parallel
      const [checkpointStats, activeThreads, stateSnapshots, trendSummaries, systemHealth] =
        await Promise.all([
          getCheckpointStats(),
          getActiveThreads(),
          getStateSnapshots(),
          getTrendSummaries(),
          getSystemHealth(),
        ]);

      // Check for alerts
      if (checkpointStats.continuityThreads.total === 0) {
        alerts.push('No continuity threads tracked yet');
      }

      if (checkpointStats.stateSnapshots.total === 0) {
        alerts.push('No state snapshots recorded');
      }

      const staleThresholdHours = 72;
      if (
        checkpointStats.continuityThreads.lastUpdated &&
        Date.now() - checkpointStats.continuityThreads.lastUpdated.getTime() > staleThresholdHours * 60 * 60 * 1000
      ) {
        alerts.push(`Continuity threads not updated in ${Math.round((Date.now() - checkpointStats.continuityThreads.lastUpdated.getTime()) / (1000 * 60 * 60))}+ hours`);
      }

      // Determine if we have meaningful data
      const hasData =
        checkpointStats.continuityThreads.total > 0 ||
        checkpointStats.stateSnapshots.total > 0 ||
        systemHealth.totalMemories > 0;

      // Render all sections
      const html = `
        ${renderCheckpointStatus(checkpointStats)}
        ${renderActiveThreads(activeThreads)}
        ${renderStateSnapshots(stateSnapshots)}
        ${renderTrendSummaries(trendSummaries)}
        ${renderSystemHealth(systemHealth)}
      `;

      return {
        title: 'Memory Health',
        html,
        hasData,
        alerts: alerts.length > 0 ? alerts : undefined,
      };
    } catch (error) {
      console.error('[MemoryHealth] Error rendering module:', error);

      return {
        title: 'Memory Health',
        html: `
          <div style="background: ${COLORS.danger}10; border: 1px solid ${COLORS.danger}; border-radius: 8px; padding: 16px; color: ${COLORS.danger};">
            <strong>Error loading memory health data:</strong><br>
            ${error instanceof Error ? error.message : 'Unknown error'}
          </div>
        `,
        hasData: false,
        alerts: ['Failed to load memory health data'],
      };
    }
  },
};
