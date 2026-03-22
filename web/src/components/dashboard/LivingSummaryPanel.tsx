'use client';

import { motion } from 'framer-motion';
import { useSummaries } from '@/lib/hooks/useSummaries';
import type { LivingSummary, SummaryCategory } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/formatting';

// Category metadata for display
const categoryMeta: Record<SummaryCategory, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  personality: {
    label: 'Personality',
    icon: '🧠',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
  },
  goals: {
    label: 'Goals',
    icon: '🎯',
    color: 'text-accent-gold',
    bgColor: 'bg-accent-gold/10',
    borderColor: 'border-accent-gold/30',
  },
  relationships: {
    label: 'Relationships',
    icon: '👥',
    color: 'text-accent-purple',
    bgColor: 'bg-accent-purple/10',
    borderColor: 'border-accent-purple/30',
  },
  projects: {
    label: 'Projects',
    icon: '💼',
    color: 'text-info',
    bgColor: 'bg-info/10',
    borderColor: 'border-info/30',
  },
  interests: {
    label: 'Interests',
    icon: '✨',
    color: 'text-emotion-joy',
    bgColor: 'bg-emotion-joy/10',
    borderColor: 'border-emotion-joy/30',
  },
  wellbeing: {
    label: 'Wellbeing',
    icon: '❤️',
    color: 'text-success',
    bgColor: 'bg-success/10',
    borderColor: 'border-success/30',
  },
  commitments: {
    label: 'Commitments',
    icon: '📋',
    color: 'text-warning',
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/30',
  },
};

// Priority order for displaying summaries
const categoryOrder: SummaryCategory[] = [
  'personality',
  'goals',
  'relationships',
  'projects',
  'interests',
  'wellbeing',
  'commitments',
];

interface LivingSummaryPanelProps {
  onSummaryClick?: (summary: LivingSummary) => void;
}

export function LivingSummaryPanel({ onSummaryClick }: LivingSummaryPanelProps) {
  const { data: summaries, isLoading, error } = useSummaries(true);

  if (isLoading) {
    return <SummaryLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-error text-sm">
        Failed to load summaries
      </div>
    );
  }

  if (!summaries || summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-8">
        <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-3">
          <span className="text-xl">📝</span>
        </div>
        <p className="text-foreground-muted text-sm">
          No summaries yet. Start chatting to build your profile.
        </p>
      </div>
    );
  }

  // Sort summaries by category order
  const sortedSummaries = [...summaries].sort((a, b) => {
    return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {sortedSummaries.map((summary, index) => (
        <SummaryCard
          key={summary.id}
          summary={summary}
          index={index}
          onClick={() => onSummaryClick?.(summary)}
        />
      ))}
    </div>
  );
}

interface SummaryCardProps {
  summary: LivingSummary;
  index: number;
  onClick?: () => void;
}

// Default fallback for unknown categories
const defaultMeta = {
  label: 'Other',
  icon: '📝',
  color: 'text-foreground-muted',
  bgColor: 'bg-foreground-muted/10',
  borderColor: 'border-foreground-muted/30',
};

function SummaryCard({ summary, index, onClick }: SummaryCardProps) {
  const meta = categoryMeta[summary.category] || defaultMeta;

  // Truncate content for preview
  const maxLength = 120;
  const truncatedContent = summary.content.length > maxLength
    ? summary.content.substring(0, maxLength) + '...'
    : summary.content;

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      onClick={onClick}
      className={`
        w-full text-left p-4 rounded-lg
        bg-background-tertiary/50 border ${meta.borderColor}
        hover:bg-background-tertiary hover:border-opacity-50
        transition-all duration-200
        group
      `}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`
          w-7 h-7 rounded-md flex items-center justify-center text-sm
          ${meta.bgColor}
        `}>
          {meta.icon}
        </span>
        <span className={`font-medium text-sm ${meta.color}`}>
          {meta.label}
        </span>
        <span className="text-xs text-foreground-muted ml-auto">
          v{summary.version}
        </span>
      </div>

      {/* Content Preview */}
      <p className="text-sm text-foreground leading-relaxed line-clamp-2 mb-2">
        {truncatedContent}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-foreground-muted">
        <span>{summary.memory_count} memories</span>
        <span>{formatRelativeTime(summary.last_updated)}</span>
      </div>
    </motion.button>
  );
}

function SummaryLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="p-4 rounded-lg bg-background-tertiary/50 border border-glass-border animate-pulse"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-md bg-background-tertiary" />
            <div className="h-4 w-20 bg-background-tertiary rounded" />
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-background-tertiary rounded w-full" />
            <div className="h-3 bg-background-tertiary rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default LivingSummaryPanel;
