'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { ScoredMemory, EntitySummary } from '@/lib/types';
import { getEntityIcon, getEntityTextClass } from '@/lib/utils/colors';
import { formatRelativeTime } from '@/lib/utils/formatting';
import { exportMemoryAsMarkdown, exportMemoryAsText } from '@/lib/utils/export';

interface MemoryCardProps {
  memory: ScoredMemory;
  entities?: EntitySummary[];
  onDismiss?: () => void;
  compact?: boolean;
}

export function MemoryCard({
  memory,
  entities = [],
  onDismiss,
  compact = false,
}: MemoryCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  // Export handlers
  const handleExportMarkdown = useCallback(() => {
    exportMemoryAsMarkdown(memory, entities);
  }, [memory, entities]);

  const handleExportText = useCallback(() => {
    exportMemoryAsText(memory);
  }, [memory]);

  // Calculate glow intensity based on salience (1-10 scale)
  const salienceLevel = Math.min(10, Math.max(1, Math.round(memory.salience_score)));
  const glowClass = `salience-glow-${salienceLevel}`;

  // Truncate content for front face
  const maxLength = compact ? 80 : 150;
  const truncatedContent =
    memory.content.length > maxLength
      ? memory.content.substring(0, maxLength) + '...'
      : memory.content;

  // Category badge styling
  const categoryColors = {
    high_salience: 'bg-accent-gold/20 text-accent-gold border-accent-gold/30',
    relevant: 'bg-primary/20 text-primary border-primary/30',
    recent: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30',
  };

  const categoryLabels = {
    high_salience: 'Important',
    relevant: 'Relevant',
    recent: 'Recent',
  };

  // Height expands when flipped to show full content
  const cardHeight = isFlipped ? 'h-72' : (compact ? 'h-32' : 'h-48');

  return (
    <div
      className={`
        relative w-full perspective-1000
        transition-all duration-500
        ${cardHeight}
      `}
    >
      <motion.div
        className="relative w-full h-full"
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Front Face */}
        <div
          className={`
            absolute inset-0 w-full h-full
            glass rounded-lg p-4 cursor-pointer
            transition-all duration-300
            hover:border-primary/50
            ${glowClass}
          `}
          style={{ backfaceVisibility: 'hidden' }}
          onClick={() => setIsFlipped(true)}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            {/* Category badge */}
            <span
              className={`
                text-xs px-2 py-0.5 rounded-full border
                ${categoryColors[memory.category]}
              `}
            >
              {categoryLabels[memory.category]}
            </span>

            {/* Dismiss button */}
            {onDismiss && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                className="text-foreground-muted hover:text-foreground transition-colors"
              >
                ✕
              </button>
            )}
          </div>

          {/* Content */}
          <p className="text-sm text-foreground leading-relaxed mb-3">
            {truncatedContent}
          </p>

          {/* Footer */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
            {/* Timestamp */}
            <span className="text-xs text-foreground-muted">
              {formatRelativeTime(memory.created_at)}
            </span>

            {/* Salience meter */}
            <SalienceMeter score={memory.salience_score} />
          </div>

          {/* Flip hint */}
          <div className="absolute bottom-4 right-4">
            <span className="text-xs text-foreground-muted opacity-50">
              Click to flip
            </span>
          </div>
        </div>

        {/* Back Face */}
        <div
          className={`
            absolute inset-0 w-full h-full
            glass rounded-lg p-4 overflow-y-auto
            ${glowClass}
          `}
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <h4 className="text-sm font-medium text-primary">Full Memory</h4>
            <button
              onClick={() => setIsFlipped(false)}
              className="text-foreground-muted hover:text-foreground transition-colors"
            >
              ↩
            </button>
          </div>

          {/* Full content */}
          <p className="text-sm text-foreground leading-relaxed mb-3">
            {memory.content}
          </p>

          {/* Entities */}
          {entities.length > 0 && (
            <div className="mb-3">
              <h5 className="text-xs text-foreground-muted mb-1">Entities</h5>
              <div className="flex flex-wrap gap-1">
                {entities.slice(0, 5).map((entity) => (
                  <span
                    key={entity.id}
                    className={`
                      text-xs px-2 py-0.5 rounded-full
                      bg-background-tertiary border border-glass-border
                      ${getEntityTextClass(entity.type)}
                    `}
                  >
                    {getEntityIcon(entity.type)} {entity.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Scores */}
          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
            <div className="text-foreground-muted">
              Salience: <span className="text-foreground">{memory.salience_score.toFixed(1)}</span>
            </div>
            <div className="text-foreground-muted">
              Strength: <span className="text-foreground">{(memory.current_strength * 100).toFixed(0)}%</span>
            </div>
            {memory.similarity !== undefined && (
              <div className="text-foreground-muted">
                Similarity: <span className="text-foreground">{(memory.similarity * 100).toFixed(0)}%</span>
              </div>
            )}
            <div className="text-foreground-muted">
              Score: <span className="text-foreground">{(memory.final_score * 100).toFixed(0)}%</span>
            </div>
          </div>

          {/* Export buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleExportMarkdown}
              className="
                text-xs px-3 py-1 rounded
                bg-primary/20 text-primary border border-primary/30
                hover:bg-primary/30 transition-colors
              "
            >
              Export .md
            </button>
            <button
              onClick={handleExportText}
              className="
                text-xs px-3 py-1 rounded
                bg-background-tertiary text-foreground-muted border border-glass-border
                hover:text-foreground transition-colors
              "
            >
              Export .txt
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Salience meter sub-component
function SalienceMeter({ score }: { score: number }) {
  const percentage = (score / 10) * 100;
  const level = Math.min(10, Math.max(1, Math.round(score)));

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            backgroundColor: `var(--salience-${level})`,
          }}
        />
      </div>
      <span className="text-xs text-foreground-muted">{score.toFixed(1)}</span>
    </div>
  );
}

export default MemoryCard;
