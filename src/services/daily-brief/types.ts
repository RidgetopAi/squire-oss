/**
 * Daily Brief Module System Types
 *
 * Each module renders an HTML section for the daily brief email.
 * Modules are designed to be independent and extensible.
 */

export interface BriefModule {
  /** Display title for this module section */
  title: string;

  /** Render the module and return the result */
  render(): Promise<ModuleResult>;
}

export interface ModuleResult {
  /** Display title for the rendered section */
  title: string;

  /** HTML content for this section (inline styles only) */
  html: string;

  /** If false, module shows a "no data yet" placeholder */
  hasData: boolean;

  /** Urgent items to surface at top of email */
  alerts?: string[];
}

/**
 * Database row types for Memory Health queries
 */

export interface ThreadRow {
  title: string;
  thread_type: string;
  status: string;
  importance: number;
  emotional_weight: number;
  current_state_summary: string | null;
  last_discussed_at: Date | null;
  next_followup_question: string | null;
  followup_after: Date | null;
}

export interface StateSnapshotRow {
  period_end: Date;
  stress_level: number | null;
  energy_level: number | null;
  motivation_level: number | null;
  emotional_tone: string | null;
  narrative_summary: string | null;
  dominant_pressures: string[] | null;
  dominant_energizers: string[] | null;
}

export interface TrendSummaryRow {
  period_type: string;
  period_end: Date;
  stress_trend: string | null;
  energy_trend: string | null;
  motivation_trend: string | null;
  avg_stress: number | null;
  avg_energy: number | null;
  avg_motivation: number | null;
  narrative: string | null;
  threads_opened: number | null;
  threads_resolved: number | null;
  threads_stagnant: number | null;
}

export interface CheckpointStats {
  continuityThreads: {
    total: number;
    active: number;
    resolved: number;
    dormant: number;
    lastUpdated: Date | null;
  };
  stateSnapshots: {
    total: number;
    latestSnapshot: Date | null;
    last7Days: number;
  };
  trendSummaries: {
    total: number;
    latest: Date | null;
  };
  beliefs: {
    total: number;
    lastUpdated: Date | null;
  };
  continuityEvents: {
    total: number;
    latest: Date | null;
  };
}

export interface SystemHealthStats {
  totalMemories: number;
  last7Days: number;
  last24Hours: number;
  recentEvents: number;
  latestEvent: Date | null;
}
