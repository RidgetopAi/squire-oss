'use client';

import { motion } from 'framer-motion';
import { useRecentHighSalienceMemories } from '@/lib/hooks/useMemories';
import type { Memory, MemorySource } from '@/lib/types';
import { formatRelativeTime, formatSalience } from '@/lib/utils/formatting';

// Source metadata for display
const sourceMeta: Record<MemorySource, {
  icon: string;
  color: string;
  bgColor: string;
}> = {
  chat: {
    icon: '💬',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  conversation: {
    icon: '💬',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  observation: {
    icon: '👁',
    color: 'text-accent-purple',
    bgColor: 'bg-accent-purple/10',
  },
  document: {
    icon: '📄',
    color: 'text-info',
    bgColor: 'bg-info/10',
  },
  import: {
    icon: '📥',
    color: 'text-accent-gold',
    bgColor: 'bg-accent-gold/10',
  },
  system: {
    icon: '⚙️',
    color: 'text-foreground-muted',
    bgColor: 'bg-foreground-muted/10',
  },
};

interface TodayPanelProps {
  onMemoryClick?: (memory: Memory) => void;
  limit?: number;
}

export function TodayPanel({ onMemoryClick, limit = 6 }: TodayPanelProps) {
  const { data: memories, isLoading, error } = useRecentHighSalienceMemories(limit);

  if (isLoading) {
    return <TodayLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-error text-sm">
        Failed to load memories
      </div>
    );
  }

  if (!memories || memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-8">
        <div className="w-12 h-12 rounded-full bg-accent-gold/10 border border-accent-gold/30 flex items-center justify-center mb-3">
          <span className="text-xl">✨</span>
        </div>
        <p className="text-foreground-muted text-sm">
          No memories yet. Start a conversation to create memories.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {memories.map((memory, index) => (
        <MemoryItem
          key={memory.id}
          memory={memory}
          index={index}
          onClick={() => onMemoryClick?.(memory)}
        />
      ))}
    </div>
  );
}

interface MemoryItemProps {
  memory: Memory;
  index: number;
  onClick?: () => void;
}

function MemoryItem({ memory, index, onClick }: MemoryItemProps) {
  const source = sourceMeta[memory.source] || sourceMeta.system;

  // Truncate content for preview
  const maxLength = 80;
  const truncatedContent = memory.content.length > maxLength
    ? memory.content.substring(0, maxLength) + '...'
    : memory.content;

  // Salience as visual indicator
  const salienceLevel = Math.round(memory.salience * 10);
  const isHighSalience = salienceLevel >= 7;

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
        group
      `}
    >
      {/* Content Row */}
      <div className="flex items-start gap-2">
        {/* Source Icon */}
        <span className={`
          w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-xs
          ${source.bgColor}
        `}>
          {source.icon}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground leading-snug line-clamp-2">
            {truncatedContent}
          </p>

          {/* Meta Row */}
          <div className="flex items-center gap-2 mt-1.5 text-xs text-foreground-muted">
            <span>{formatRelativeTime(memory.created_at)}</span>
            <span className="text-foreground-muted/50">•</span>
            <span className={isHighSalience ? 'text-accent-gold' : ''}>
              {formatSalience(memory.salience)}
            </span>
          </div>
        </div>

        {/* High Salience Indicator */}
        {isHighSalience && (
          <span className="w-2 h-2 rounded-full bg-accent-gold flex-shrink-0 mt-1.5" />
        )}
      </div>
    </motion.button>
  );
}

function TodayLoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="p-3 rounded-lg bg-background-tertiary/50 border border-glass-border animate-pulse"
        >
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-background-tertiary flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-background-tertiary rounded w-full" />
              <div className="h-3 bg-background-tertiary rounded w-2/3" />
              <div className="h-2 bg-background-tertiary rounded w-1/3 mt-1" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default TodayPanel;
