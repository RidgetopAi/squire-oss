'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

export type PanelAccent = 'primary' | 'gold' | 'purple' | 'success' | 'warning';

interface DashboardPanelProps {
  title: string;
  icon?: ReactNode;
  accent?: PanelAccent;
  className?: string;
  children: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  headerAction?: ReactNode;
  onHeaderClick?: () => void;
  expandable?: boolean;
}

// Accent color mappings
const accentStyles: Record<PanelAccent, {
  border: string;
  text: string;
  glow: string;
  bg: string;
}> = {
  primary: {
    border: 'border-primary/30',
    text: 'text-primary',
    glow: 'glow-primary',
    bg: 'bg-primary/10',
  },
  gold: {
    border: 'border-accent-gold/30',
    text: 'text-accent-gold',
    glow: 'glow-gold',
    bg: 'bg-accent-gold/10',
  },
  purple: {
    border: 'border-accent-purple/30',
    text: 'text-accent-purple',
    glow: '',
    bg: 'bg-accent-purple/10',
  },
  success: {
    border: 'border-success/30',
    text: 'text-success',
    glow: '',
    bg: 'bg-success/10',
  },
  warning: {
    border: 'border-warning/30',
    text: 'text-warning',
    glow: '',
    bg: 'bg-warning/10',
  },
};

export function DashboardPanel({
  title,
  icon,
  accent = 'primary',
  className = '',
  children,
  isLoading = false,
  isEmpty = false,
  emptyMessage = 'No data available',
  emptyIcon,
  headerAction,
  onHeaderClick,
  expandable = false,
}: DashboardPanelProps) {
  const styles = accentStyles[accent];
  const isClickable = expandable && onHeaderClick;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`
        glass rounded-xl overflow-hidden
        flex flex-col
        ${className}
      `}
    >
      {/* Panel Header */}
      <div
        onClick={isClickable ? onHeaderClick : undefined}
        className={`
          px-5 py-4 border-b border-glass-border
          flex items-center justify-between
          ${isClickable ? 'cursor-pointer hover:bg-background-tertiary/50 transition-colors group' : ''}
        `}
      >
        <div className="flex items-center gap-3">
          {icon && (
            <div className={`
              w-8 h-8 rounded-lg flex items-center justify-center
              ${styles.bg} ${styles.border} border
              ${isClickable ? 'group-hover:scale-105 transition-transform' : ''}
            `}>
              <span className={styles.text}>{icon}</span>
            </div>
          )}
          <h3 className="font-semibold text-foreground">{title}</h3>
          {isClickable && (
            <span className="text-xs text-foreground-muted opacity-0 group-hover:opacity-100 transition-opacity ml-1">
              tap to expand
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {headerAction && (
            <div className="flex items-center">
              {headerAction}
            </div>
          )}
          {isClickable && (
            <svg
              className="w-4 h-4 text-foreground-muted group-hover:text-foreground transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          )}
        </div>
      </div>

      {/* Panel Content */}
      <div className="flex-1 p-5 overflow-auto">
        {isLoading ? (
          <LoadingSkeleton />
        ) : isEmpty ? (
          <EmptyState message={emptyMessage} icon={emptyIcon} accent={accent} />
        ) : (
          children
        )}
      </div>
    </motion.div>
  );
}

// Loading skeleton component
function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 bg-background-tertiary rounded w-3/4" />
      <div className="h-4 bg-background-tertiary rounded w-1/2" />
      <div className="h-4 bg-background-tertiary rounded w-5/6" />
      <div className="h-4 bg-background-tertiary rounded w-2/3" />
    </div>
  );
}

// Empty state component
function EmptyState({
  message,
  icon,
  accent,
}: {
  message: string;
  icon?: ReactNode;
  accent: PanelAccent;
}) {
  const styles = accentStyles[accent];

  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-8">
      {icon && (
        <div className={`
          w-12 h-12 rounded-full flex items-center justify-center mb-3
          ${styles.bg} ${styles.border} border
        `}>
          <span className={`text-xl ${styles.text}`}>{icon}</span>
        </div>
      )}
      <p className="text-foreground-muted text-sm">{message}</p>
    </div>
  );
}

// Stats Card component for the header row
interface StatsCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  accent?: PanelAccent;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
}

export function StatsCard({
  label,
  value,
  icon,
  accent = 'primary',
  trend,
}: StatsCardProps) {
  const styles = accentStyles[accent];

  const trendColors = {
    up: 'text-success',
    down: 'text-error',
    neutral: 'text-foreground-muted',
  };

  const trendIcons = {
    up: '↑',
    down: '↓',
    neutral: '→',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`
        glass rounded-lg p-4
        border ${styles.border}
        hover:${styles.glow || ''}
        transition-all duration-300
      `}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-foreground-muted text-xs uppercase tracking-wide mb-1">
            {label}
          </p>
          <p className={`text-2xl font-bold ${styles.text}`}>
            {value}
          </p>
        </div>
        {icon && (
          <div className={`
            w-10 h-10 rounded-lg flex items-center justify-center
            ${styles.bg}
          `}>
            <span className={styles.text}>{icon}</span>
          </div>
        )}
      </div>
      {trend && (
        <div className={`mt-2 text-xs ${trendColors[trend.direction]}`}>
          {trendIcons[trend.direction]} {Math.abs(trend.value)}%
          <span className="text-foreground-muted ml-1">vs last week</span>
        </div>
      )}
    </motion.div>
  );
}

export default DashboardPanel;
