'use client';

import { motion } from 'framer-motion';
import { useBeliefs } from '@/lib/hooks/useBeliefs';
import { usePatterns } from '@/lib/hooks/usePatterns';
import { useInsights } from '@/lib/hooks/useInsights';
import type { Belief, BeliefCategory, Pattern, PatternType, Insight, InsightType } from '@/lib/types';
import { formatRelativeTime, formatConfidence } from '@/lib/utils/formatting';

// ============================================
// BELIEFS EXPANDED LIST
// ============================================

const beliefCategoryMeta: Record<BeliefCategory, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}> = {
  value: { label: 'Value', icon: '💎', color: 'text-accent-purple', bgColor: 'bg-accent-purple/10' },
  preference: { label: 'Preference', icon: '⭐', color: 'text-accent-gold', bgColor: 'bg-accent-gold/10' },
  habit: { label: 'Habit', icon: '🔄', color: 'text-info', bgColor: 'bg-info/10' },
  opinion: { label: 'Opinion', icon: '💭', color: 'text-primary', bgColor: 'bg-primary/10' },
  fact: { label: 'Fact', icon: '📌', color: 'text-success', bgColor: 'bg-success/10' },
  goal: { label: 'Goal', icon: '🎯', color: 'text-accent-gold', bgColor: 'bg-accent-gold/10' },
  identity: { label: 'Identity', icon: '🪪', color: 'text-primary', bgColor: 'bg-primary/10' },
};

interface ExpandedBeliefsListProps {
  onBeliefClick?: (belief: Belief) => void;
}

export function ExpandedBeliefsList({ onBeliefClick }: ExpandedBeliefsListProps) {
  const { data: beliefs, isLoading, error } = useBeliefs({ status: 'active', limit: 50 });

  if (isLoading) {
    return <ExpandedListSkeleton />;
  }

  if (error) {
    return <div className="text-error text-sm text-center py-8">Failed to load beliefs</div>;
  }

  if (!beliefs || beliefs.length === 0) {
    return (
      <div className="text-center py-8 text-foreground-muted">
        No beliefs detected yet. Keep chatting to build your belief profile.
      </div>
    );
  }

  const sortedBeliefs = [...beliefs].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="space-y-2">
      {sortedBeliefs.map((belief, index) => {
        const category = beliefCategoryMeta[belief.category] || beliefCategoryMeta.opinion;
        const confidencePercent = Math.round(belief.confidence * 100);

        return (
          <motion.button
            key={belief.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.02 }}
            onClick={() => onBeliefClick?.(belief)}
            className="w-full text-left p-3 rounded-lg bg-background-tertiary/50 border border-glass-border hover:bg-background-tertiary hover:border-accent-gold/30 transition-all duration-200 relative overflow-hidden"
          >
            <div
              className="absolute inset-0 bg-accent-gold/5 transition-all duration-300"
              style={{ width: `${confidencePercent}%` }}
            />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-xs ${category.bgColor}`}>
                  {category.icon}
                </span>
                <span className={`text-xs font-medium ${category.color}`}>{category.label}</span>
                <span className="text-xs text-foreground-muted ml-auto">{formatConfidence(belief.confidence)}</span>
              </div>
              <p className="text-sm text-foreground leading-snug mb-1.5">{belief.statement}</p>
              <div className="flex items-center gap-2 text-xs text-foreground-muted">
                <span>{belief.evidence_count} evidence</span>
                <span className="text-foreground-muted/50">•</span>
                <span>{formatRelativeTime(belief.last_reinforced)}</span>
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ============================================
// PATTERNS EXPANDED LIST
// ============================================

const patternTypeMeta: Record<PatternType, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}> = {
  behavioral: { label: 'Behavioral', icon: '🔄', color: 'text-accent-purple', bgColor: 'bg-accent-purple/10' },
  temporal: { label: 'Temporal', icon: '⏰', color: 'text-info', bgColor: 'bg-info/10' },
  emotional: { label: 'Emotional', icon: '💫', color: 'text-emotion-joy', bgColor: 'bg-emotion-joy/10' },
  social: { label: 'Social', icon: '👥', color: 'text-primary', bgColor: 'bg-primary/10' },
  cognitive: { label: 'Cognitive', icon: '🧠', color: 'text-accent-gold', bgColor: 'bg-accent-gold/10' },
};

interface ExpandedPatternsListProps {
  onPatternClick?: (pattern: Pattern) => void;
}

export function ExpandedPatternsList({ onPatternClick }: ExpandedPatternsListProps) {
  const { data: patterns, isLoading, error } = usePatterns({ limit: 50 });

  if (isLoading) {
    return <ExpandedListSkeleton />;
  }

  if (error) {
    return <div className="text-error text-sm text-center py-8">Failed to load patterns</div>;
  }

  if (!patterns || patterns.length === 0) {
    return (
      <div className="text-center py-8 text-foreground-muted">
        No patterns detected yet. Patterns emerge over time as you share more.
      </div>
    );
  }

  const sortedPatterns = [...patterns].sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    return b.confidence - a.confidence;
  });

  return (
    <div className="space-y-2">
      {sortedPatterns.map((pattern, index) => {
        const type = patternTypeMeta[pattern.type] || patternTypeMeta.behavioral;
        const frequencyLabel = pattern.frequency === 1 ? 'Once' : `${pattern.frequency}× observed`;

        return (
          <motion.button
            key={pattern.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.02 }}
            onClick={() => onPatternClick?.(pattern)}
            className="w-full text-left p-3 rounded-lg bg-background-tertiary/50 border border-glass-border hover:bg-background-tertiary hover:border-accent-purple/30 transition-all duration-200"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-xs ${type.bgColor}`}>
                {type.icon}
              </span>
              <span className={`text-xs font-medium ${type.color}`}>{type.label}</span>
              <span className="text-xs text-foreground-muted ml-auto">{formatConfidence(pattern.confidence)}</span>
            </div>
            <p className="text-sm text-foreground leading-snug mb-1.5">{pattern.description}</p>
            <div className="flex items-center gap-2 text-xs text-foreground-muted">
              <span>{frequencyLabel}</span>
              <span className="text-foreground-muted/50">•</span>
              <span>{formatRelativeTime(pattern.last_detected)}</span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ============================================
// INSIGHTS EXPANDED LIST
// ============================================

const insightTypeMeta: Record<InsightType, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}> = {
  connection: { label: 'Connection', icon: '🔗', color: 'text-primary', bgColor: 'bg-primary/10' },
  contradiction: { label: 'Contradiction', icon: '⚠️', color: 'text-warning', bgColor: 'bg-warning/10' },
  opportunity: { label: 'Opportunity', icon: '✨', color: 'text-success', bgColor: 'bg-success/10' },
  warning: { label: 'Warning', icon: '🚨', color: 'text-error', bgColor: 'bg-error/10' },
  realization: { label: 'Realization', icon: '💡', color: 'text-accent-gold', bgColor: 'bg-accent-gold/10' },
};

const priorityStyles: Record<string, { color: string; label: string }> = {
  critical: { color: 'text-error', label: 'Critical' },
  high: { color: 'text-warning', label: 'High' },
  medium: { color: 'text-info', label: 'Medium' },
  low: { color: 'text-foreground-muted', label: 'Low' },
};

interface ExpandedInsightsListProps {
  onInsightClick?: (insight: Insight) => void;
}

export function ExpandedInsightsList({ onInsightClick }: ExpandedInsightsListProps) {
  const { data: insights, isLoading, error } = useInsights({ limit: 50 });

  if (isLoading) {
    return <ExpandedListSkeleton />;
  }

  if (error) {
    return <div className="text-error text-sm text-center py-8">Failed to load insights</div>;
  }

  if (!insights || insights.length === 0) {
    return (
      <div className="text-center py-8 text-foreground-muted">
        No insights yet. AI-generated realizations will appear as patterns emerge.
      </div>
    );
  }

  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  const sortedInsights = [...insights].sort((a, b) => {
    const aPriority = priorityOrder.indexOf(a.priority);
    const bPriority = priorityOrder.indexOf(b.priority);
    if (aPriority !== bPriority) return aPriority - bPriority;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="space-y-2">
      {sortedInsights.map((insight, index) => {
        const type = insightTypeMeta[insight.type] || insightTypeMeta.realization;
        const priority = priorityStyles[insight.priority] || priorityStyles.medium;
        const isUrgent = insight.priority === 'critical' || insight.priority === 'high';

        return (
          <motion.button
            key={insight.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.02 }}
            onClick={() => onInsightClick?.(insight)}
            className={`w-full text-left p-3 rounded-lg bg-background-tertiary/50 border ${isUrgent ? 'border-warning/50' : 'border-glass-border'} hover:bg-background-tertiary hover:border-warning/30 transition-all duration-200`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-xs ${type.bgColor}`}>
                {type.icon}
              </span>
              <span className={`text-xs font-medium ${type.color}`}>{type.label}</span>
              <span className={`text-xs ml-auto ${priority.color}`}>{priority.label}</span>
            </div>
            <p className="text-sm text-foreground leading-snug mb-1.5">{insight.content}</p>
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
      })}
    </div>
  );
}

// ============================================
// SHARED COMPONENTS
// ============================================

function ExpandedListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5, 6].map((i) => (
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
