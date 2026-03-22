'use client';

import { motion } from 'framer-motion';
import { useNewInsights } from '@/lib/hooks/useInsights';
import type { Insight, InsightType } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/formatting';

// Insight type metadata for display
const typeMeta: Record<InsightType, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}> = {
  connection: {
    label: 'Connection',
    icon: '🔗',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  contradiction: {
    label: 'Contradiction',
    icon: '⚠️',
    color: 'text-warning',
    bgColor: 'bg-warning/10',
  },
  opportunity: {
    label: 'Opportunity',
    icon: '✨',
    color: 'text-success',
    bgColor: 'bg-success/10',
  },
  warning: {
    label: 'Warning',
    icon: '🚨',
    color: 'text-error',
    bgColor: 'bg-error/10',
  },
  realization: {
    label: 'Realization',
    icon: '💡',
    color: 'text-accent-gold',
    bgColor: 'bg-accent-gold/10',
  },
};

// Priority styles
const priorityStyles: Record<string, { color: string; label: string }> = {
  critical: { color: 'text-error', label: 'Critical' },
  high: { color: 'text-warning', label: 'High' },
  medium: { color: 'text-info', label: 'Medium' },
  low: { color: 'text-foreground-muted', label: 'Low' },
};

interface InsightsPanelProps {
  onInsightClick?: (insight: Insight) => void;
  limit?: number;
}

export function InsightsPanel({ onInsightClick, limit = 6 }: InsightsPanelProps) {
  const { data: insights, isLoading, error } = useNewInsights(limit);

  if (isLoading) {
    return <InsightsLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-error text-sm">
        Failed to load insights
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-8">
        <div className="w-12 h-12 rounded-full bg-warning/10 border border-warning/30 flex items-center justify-center mb-3">
          <span className="text-xl">💡</span>
        </div>
        <p className="text-foreground-muted text-sm">
          No new insights. AI-generated realizations will appear as patterns emerge.
        </p>
      </div>
    );
  }

  // Sort by priority (critical first) then recency
  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  const sortedInsights = [...insights].sort((a, b) => {
    const aPriority = priorityOrder.indexOf(a.priority);
    const bPriority = priorityOrder.indexOf(b.priority);
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="space-y-2">
      {sortedInsights.map((insight, index) => (
        <InsightItem
          key={insight.id}
          insight={insight}
          index={index}
          onClick={() => onInsightClick?.(insight)}
        />
      ))}
    </div>
  );
}

interface InsightItemProps {
  insight: Insight;
  index: number;
  onClick?: () => void;
}

function InsightItem({ insight, index, onClick }: InsightItemProps) {
  const type = typeMeta[insight.type] || typeMeta.realization;
  const priority = priorityStyles[insight.priority] || priorityStyles.medium;

  const isUrgent = insight.priority === 'critical' || insight.priority === 'high';

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      onClick={onClick}
      className={`
        w-full text-left p-3 rounded-lg
        bg-background-tertiary/50 border
        ${isUrgent ? 'border-warning/50' : 'border-glass-border'}
        hover:bg-background-tertiary hover:border-warning/30
        transition-all duration-200
        group
      `}
    >
      {/* Header Row */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`
          w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-xs
          ${type.bgColor}
        `}>
          {type.icon}
        </span>
        <span className={`text-xs font-medium ${type.color}`}>
          {type.label}
        </span>
        <span className={`text-xs ml-auto ${priority.color}`}>
          {priority.label}
        </span>
      </div>

      {/* Content */}
      <p className="text-sm text-foreground leading-snug line-clamp-2 mb-1.5">
        {insight.content}
      </p>

      {/* Meta Row */}
      <div className="flex items-center gap-2 text-xs text-foreground-muted">
        <span>{insight.source_memories?.length || 0} sources</span>
        <span className="text-foreground-muted/50">•</span>
        <span>{formatRelativeTime(insight.created_at)}</span>
        {insight.status === 'new' && (
          <>
            <span className="text-foreground-muted/50">•</span>
            <span className="text-primary">New</span>
          </>
        )}
      </div>
    </motion.button>
  );
}

function InsightsLoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="p-3 rounded-lg bg-background-tertiary/50 border border-glass-border animate-pulse"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded bg-background-tertiary flex-shrink-0" />
            <div className="h-3 w-16 bg-background-tertiary rounded" />
            <div className="h-3 w-12 bg-background-tertiary rounded ml-auto" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 bg-background-tertiary rounded w-full" />
            <div className="h-3 bg-background-tertiary rounded w-3/4" />
          </div>
          <div className="h-2 bg-background-tertiary rounded w-1/3 mt-2" />
        </div>
      ))}
    </div>
  );
}

export default InsightsPanel;
