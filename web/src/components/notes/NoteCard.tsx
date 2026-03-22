'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Note } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/formatting';

interface NoteCardProps {
  note: Note;
  onEdit?: (note: Note) => void;
  onPin?: (note: Note) => void;
  onArchive?: (note: Note) => void;
  onDelete?: (note: Note) => void;
  compact?: boolean;
}

const categoryColors: Record<string, string> = {
  work: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  personal: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  health: 'bg-green-500/20 text-green-400 border-green-500/30',
  project: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const sourceIcons: Record<string, string> = {
  manual: '✏️',
  voice: '🎤',
  chat: '💬',
  calendar_event: '📅',
};

export function NoteCard({
  note,
  onEdit,
  onPin,
  onArchive,
  onDelete,
  compact = false,
}: NoteCardProps) {
  const [showActions, setShowActions] = useState(false);

  const maxLength = compact ? 100 : 200;
  const truncatedContent =
    note.content.length > maxLength
      ? note.content.substring(0, maxLength) + '...'
      : note.content;

  const categoryColor = categoryColors[note.category || ''] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';

  return (
    <motion.div
      className={`
        relative glass rounded-lg overflow-hidden
        transition-all duration-200
        hover:border-primary/50 cursor-pointer
        ${note.is_pinned ? 'ring-1 ring-accent-gold/50' : ''}
        ${note.color ? `border-l-4` : ''}
      `}
      style={note.color ? { borderLeftColor: note.color } : undefined}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={() => onEdit?.(note)}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className={`p-4 ${compact ? 'pb-3' : ''}`}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Pin indicator */}
            {note.is_pinned && (
              <span className="text-accent-gold text-sm" title="Pinned">📌</span>
            )}
            
            {/* Category badge */}
            {note.category && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${categoryColor}`}>
                {note.category}
              </span>
            )}

            {/* Source icon */}
            <span className="text-sm" title={`Source: ${note.source_type}`}>
              {sourceIcons[note.source_type] || '📝'}
            </span>
          </div>

          {/* Action buttons */}
          {showActions && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => onPin?.(note)}
                className="p-1 rounded hover:bg-background-tertiary transition-colors"
                title={note.is_pinned ? 'Unpin' : 'Pin'}
              >
                <span className="text-sm">{note.is_pinned ? '📌' : '📍'}</span>
              </button>
              <button
                onClick={() => onArchive?.(note)}
                className="p-1 rounded hover:bg-background-tertiary transition-colors"
                title="Archive"
              >
                <svg className="w-4 h-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </button>
              <button
                onClick={() => onDelete?.(note)}
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

        {/* Title */}
        {note.title && (
          <h3 className="text-sm font-medium text-foreground mb-1 line-clamp-1">
            {note.title}
          </h3>
        )}

        {/* Content */}
        <p className={`text-sm text-foreground-muted leading-relaxed ${compact ? 'line-clamp-2' : 'line-clamp-4'}`}>
          {truncatedContent}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-glass-border">
          {/* Entity badge */}
          {note.primary_entity && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
              {note.primary_entity.name}
            </span>
          )}

          {/* Timestamp */}
          <span className="text-xs text-foreground-muted ml-auto">
            {formatRelativeTime(note.created_at)}
          </span>
        </div>

        {/* Tags */}
        {note.tags.length > 0 && !compact && (
          <div className="flex flex-wrap gap-1 mt-2">
            {note.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="text-xs px-1.5 py-0.5 rounded bg-background-tertiary text-foreground-muted"
              >
                #{tag}
              </span>
            ))}
            {note.tags.length > 5 && (
              <span className="text-xs text-foreground-muted">+{note.tags.length - 5}</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default NoteCard;
