'use client';

import { motion } from 'framer-motion';
import { usePatterns } from '@/lib/hooks/usePatterns';
import type { Pattern, PatternType } from '@/lib/types';
import { formatRelativeTime, formatConfidence } from '@/lib/utils/formatting';

// Pattern type metadata for display
const typeMeta: Record<PatternType, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}> = {
  behavioral: {
    label: 'Behavioral',
    icon: '🔄',
    color: 'text-accent-purple',
    bgColor: 'bg-accent-purple/10',
  },
  temporal: {
    label: 'Temporal',
    icon: '⏰',
    color: 'text-info',
    bgColor: 'bg-info/10',
  },
  emotional: {
    label: 'Emotional',
    icon: '💫',
    color: 'text-emotion-joy',
    bgColor: 'bg-emotion-joy/10',
  },
  social: {
    label: 'Social',
    icon: '👥',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  cognitive: {
    label: 'Cognitive',
    icon: '🧠',
    color: 'text-accent-gold',
    bgColor: 'bg-accent-gold/10',
  },
};

interface PatternsPanelProps {
  onPatternClick?: (pattern: Pattern) => void;
  limit?: number;
}

export function PatternsPanel({ onPatternClick, limit = 6 }: PatternsPanelProps) {
  const { data: patterns, isLoading, error } = usePatterns({ limit });

  if (isLoading) {
    return <PatternsLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-error text-sm">
        Failed to load patterns
      </div>
    );
  }

  if (!patterns || patterns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-8">
        <div className="w-12 h-12 rounded-full bg-accent-purple/10 border border-accent-purple/30 flex items-center justify-center mb-3">
          <span className="text-xl">📊</span>
        </div>
        <p className="text-foreground-muted text-sm">
          No patterns detected yet. Patterns emerge over time as you share more.
        </p>
      </div>
    );
  }

  // Sort by frequency (highest first), then confidence
  const sortedPatterns = [...patterns].sort((a, b) => {
    if (b.frequency !== a.frequency) {
      return b.frequency - a.frequency;
    }
    return b.confidence - a.confidence;
  });

  return (
    <div className="space-y-2">
      {sortedPatterns.map((pattern, index) => (
        <PatternItem
          key={pattern.id}
          pattern={pattern}
          index={index}
          onClick={() => onPatternClick?.(pattern)}
        />
      ))}
    </div>
  );
}

interface PatternItemProps {
  pattern: Pattern;
  index: number;
  onClick?: () => void;
}

function PatternItem({ pattern, index, onClick }: PatternItemProps) {
  const type = typeMeta[pattern.type] || typeMeta.behavioral;

  // Format frequency display
  const frequencyLabel = pattern.frequency === 1
    ? 'Once'
    : `${pattern.frequency}× observed`;

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      onClick={onClick}
      className={`
        w-full text-left p-3 rounded-lg
        bg-background-tertiary/50 border border-glass-border
        hover:bg-background-tertiary hover:border-accent-purple/30
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
        <span className="text-xs text-foreground-muted ml-auto">
          {formatConfidence(pattern.confidence)}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-foreground leading-snug line-clamp-2 mb-1.5">
        {pattern.description}
      </p>

      {/* Meta Row */}
      <div className="flex items-center gap-2 text-xs text-foreground-muted">
        <span>{frequencyLabel}</span>
        <span className="text-foreground-muted/50">•</span>
        <span>{formatRelativeTime(pattern.last_detected)}</span>
      </div>
    </motion.button>
  );
}

function PatternsLoadingSkeleton() {
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

export default PatternsPanel;
