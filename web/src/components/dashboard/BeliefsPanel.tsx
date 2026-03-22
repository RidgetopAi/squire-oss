'use client';

import { motion } from 'framer-motion';
import { useBeliefs } from '@/lib/hooks/useBeliefs';
import type { Belief, BeliefCategory } from '@/lib/types';
import { formatRelativeTime, formatConfidence } from '@/lib/utils/formatting';

// Category metadata for display
const categoryMeta: Record<BeliefCategory, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}> = {
  value: {
    label: 'Value',
    icon: '💎',
    color: 'text-accent-purple',
    bgColor: 'bg-accent-purple/10',
  },
  preference: {
    label: 'Preference',
    icon: '⭐',
    color: 'text-accent-gold',
    bgColor: 'bg-accent-gold/10',
  },
  habit: {
    label: 'Habit',
    icon: '🔄',
    color: 'text-info',
    bgColor: 'bg-info/10',
  },
  opinion: {
    label: 'Opinion',
    icon: '💭',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  fact: {
    label: 'Fact',
    icon: '📌',
    color: 'text-success',
    bgColor: 'bg-success/10',
  },
  goal: {
    label: 'Goal',
    icon: '🎯',
    color: 'text-accent-gold',
    bgColor: 'bg-accent-gold/10',
  },
  identity: {
    label: 'Identity',
    icon: '🪪',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
};

// Status styles
const statusStyles: Record<string, { color: string; label: string }> = {
  active: { color: 'text-success', label: 'Active' },
  deprecated: { color: 'text-foreground-muted', label: 'Deprecated' },
  conflicted: { color: 'text-warning', label: 'Conflicted' },
};

interface BeliefsPanelProps {
  onBeliefClick?: (belief: Belief) => void;
  limit?: number;
}

export function BeliefsPanel({ onBeliefClick, limit = 6 }: BeliefsPanelProps) {
  const { data: beliefs, isLoading, error } = useBeliefs({
    status: 'active',
    limit,
  });

  if (isLoading) {
    return <BeliefsLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-error text-sm">
        Failed to load beliefs
      </div>
    );
  }

  if (!beliefs || beliefs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-8">
        <div className="w-12 h-12 rounded-full bg-accent-gold/10 border border-accent-gold/30 flex items-center justify-center mb-3">
          <span className="text-xl">💭</span>
        </div>
        <p className="text-foreground-muted text-sm">
          No beliefs detected yet. Keep chatting to build your belief profile.
        </p>
      </div>
    );
  }

  // Sort by confidence (highest first)
  const sortedBeliefs = [...beliefs].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="space-y-2">
      {sortedBeliefs.map((belief, index) => (
        <BeliefItem
          key={belief.id}
          belief={belief}
          index={index}
          onClick={() => onBeliefClick?.(belief)}
        />
      ))}
    </div>
  );
}

interface BeliefItemProps {
  belief: Belief;
  index: number;
  onClick?: () => void;
}

function BeliefItem({ belief, index, onClick }: BeliefItemProps) {
  const category = categoryMeta[belief.category] || categoryMeta.opinion;
  const status = statusStyles[belief.status] || statusStyles.active;

  // Confidence as visual bar width
  const confidencePercent = Math.round(belief.confidence * 100);

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      onClick={onClick}
      className={`
        w-full text-left p-3 rounded-lg
        bg-background-tertiary/50 border border-glass-border
        hover:bg-background-tertiary hover:border-accent-gold/30
        transition-all duration-200
        group relative overflow-hidden
      `}
    >
      {/* Confidence bar background */}
      <div
        className="absolute inset-0 bg-accent-gold/5 transition-all duration-300"
        style={{ width: `${confidencePercent}%` }}
      />

      {/* Content */}
      <div className="relative z-10">
        {/* Header Row */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`
            w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-xs
            ${category.bgColor}
          `}>
            {category.icon}
          </span>
          <span className={`text-xs font-medium ${category.color}`}>
            {category.label}
          </span>
          <span className={`text-xs ml-auto ${status.color}`}>
            {formatConfidence(belief.confidence)}
          </span>
        </div>

        {/* Statement */}
        <p className="text-sm text-foreground leading-snug line-clamp-2 mb-1.5">
          {belief.statement}
        </p>

        {/* Meta Row */}
        <div className="flex items-center gap-2 text-xs text-foreground-muted">
          <span>{belief.evidence_count} evidence</span>
          <span className="text-foreground-muted/50">•</span>
          <span>{formatRelativeTime(belief.last_reinforced)}</span>
        </div>
      </div>
    </motion.button>
  );
}

function BeliefsLoadingSkeleton() {
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

export default BeliefsPanel;
