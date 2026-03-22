'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { List } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/formatting';

interface ListCardProps {
  list: List;
  onOpen?: (list: List) => void;
  onEdit?: (list: List) => void;
  onArchive?: (list: List) => void;
  onDelete?: (list: List) => void;
  compact?: boolean;
}

const listTypeIcons: Record<string, string> = {
  checklist: '☑️',
  simple: '📋',
  ranked: '🏆',
};

const listTypeLabels: Record<string, string> = {
  checklist: 'Checklist',
  simple: 'Simple',
  ranked: 'Ranked',
};

export function ListCard({
  list,
  onOpen,
  onEdit,
  onArchive,
  onDelete,
  compact = false,
}: ListCardProps) {
  const [showActions, setShowActions] = useState(false);

  const itemCount = list.item_count ?? 0;
  const completedCount = list.completed_count ?? 0;
  const progress = itemCount > 0 ? Math.round((completedCount / itemCount) * 100) : 0;

  return (
    <motion.div
      className={`
        relative glass rounded-lg overflow-hidden
        transition-all duration-200
        hover:border-primary/50 cursor-pointer
        ${list.is_pinned ? 'ring-1 ring-accent-gold/50' : ''}
        ${list.color ? `border-l-4` : ''}
      `}
      style={list.color ? { borderLeftColor: list.color } : undefined}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={() => onOpen?.(list)}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className={`p-4 ${compact ? 'pb-3' : ''}`}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Pin indicator */}
            {list.is_pinned && (
              <span className="text-accent-gold text-sm" title="Pinned">📌</span>
            )}
            
            {/* List type icon */}
            <span className="text-sm" title={listTypeLabels[list.list_type]}>
              {listTypeIcons[list.list_type] || '📋'}
            </span>

            {/* Category badge */}
            {list.category && (
              <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-500/20 text-gray-400 border-gray-500/30">
                {list.category}
              </span>
            )}
          </div>

          {/* Action buttons */}
          {showActions && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => onEdit?.(list)}
                className="p-1 rounded hover:bg-background-tertiary transition-colors"
                title="Edit"
              >
                <svg className="w-4 h-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={() => onArchive?.(list)}
                className="p-1 rounded hover:bg-background-tertiary transition-colors"
                title="Archive"
              >
                <svg className="w-4 h-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </button>
              <button
                onClick={() => onDelete?.(list)}
                className="p-1 rounded hover:bg-red-500/20 transition-colors"
                title="Delete"
              >
                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Name */}
        <h3 className="text-sm font-medium text-foreground mb-1 line-clamp-1">
          {list.name}
        </h3>

        {/* Description */}
        {list.description && !compact && (
          <p className="text-sm text-foreground-muted line-clamp-2 mb-2">
            {list.description}
          </p>
        )}

        {/* Progress bar (for checklists) */}
        {list.list_type === 'checklist' && itemCount > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-foreground-muted mb-1">
              <span>{completedCount} of {itemCount} complete</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        {/* Simple/ranked just show item count */}
        {list.list_type !== 'checklist' && itemCount > 0 && (
          <div className="mt-2 text-xs text-foreground-muted">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-glass-border">
          {/* Entity badge */}
          {list.primary_entity && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
              {list.primary_entity.name}
            </span>
          )}

          {/* Timestamp */}
          <span className="text-xs text-foreground-muted ml-auto">
            {formatRelativeTime(list.updated_at)}
          </span>
        </div>

        {/* Tags */}
        {list.tags.length > 0 && !compact && (
          <div className="flex flex-wrap gap-1 mt-2">
            {list.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="text-xs px-1.5 py-0.5 rounded bg-background-tertiary text-foreground-muted"
              >
                #{tag}
              </span>
            ))}
            {list.tags.length > 5 && (
              <span className="text-xs text-foreground-muted">+{list.tags.length - 5}</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function ListCardCompact({
  list,
  onClick,
}: {
  list: List;
  onClick?: () => void;
}) {
  const itemCount = list.item_count ?? 0;
  const completedCount = list.completed_count ?? 0;
  const progress = itemCount > 0 ? Math.round((completedCount / itemCount) * 100) : 0;

  return (
    <motion.button
      className={`
        w-full text-left p-3 rounded-lg
        glass hover:border-primary/50
        transition-all duration-200
        ${list.is_pinned ? 'border-accent-gold/30' : ''}
      `}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm">{listTypeIcons[list.list_type] || '📋'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{list.name}</p>
          {list.list_type === 'checklist' && itemCount > 0 && (
            <div className="mt-1">
              <div className="h-1 bg-background-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-foreground-muted mt-0.5">
                {completedCount}/{itemCount}
              </span>
            </div>
          )}
          {list.list_type !== 'checklist' && (
            <span className="text-xs text-foreground-muted">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

export default ListCard;
