'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { ListItem, ListType } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/formatting';

interface ListItemRowProps {
  item: ListItem;
  listType: ListType;
  onToggle?: (item: ListItem) => void;
  onUpdate?: (item: ListItem, content: string) => void;
  onDelete?: (item: ListItem) => void;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
}

export function ListItemRow({
  item,
  listType,
  onToggle,
  onUpdate,
  onDelete,
  isDragging = false,
  dragHandleProps,
}: ListItemRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(item.content);
  const [showActions, setShowActions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== item.content) {
      onUpdate?.(item, trimmed);
    }
    setIsEditing(false);
    setEditContent(item.content);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent(item.content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const isChecklist = listType === 'checklist';
  const isRanked = listType === 'ranked';

  return (
    <motion.div
      className={`
        group flex items-center gap-3 px-3 py-2 rounded-lg
        transition-all duration-150
        ${isDragging ? 'opacity-50 bg-background-tertiary' : 'hover:bg-background-tertiary/50'}
        ${item.is_completed ? 'opacity-60' : ''}
      `}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      layout
    >
      {/* Drag handle */}
      <div
        className="cursor-grab active:cursor-grabbing text-foreground-muted opacity-0 group-hover:opacity-100 transition-opacity"
        {...dragHandleProps}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </div>

      {/* Checkbox (for checklists) */}
      {isChecklist && (
        <button
          onClick={() => onToggle?.(item)}
          className={`
            w-5 h-5 rounded border-2 flex items-center justify-center
            transition-all duration-150
            ${item.is_completed
              ? 'bg-primary border-primary'
              : 'border-glass-border hover:border-primary/50'
            }
          `}
        >
          {item.is_completed && (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      )}

      {/* Priority badge (for ranked) */}
      {isRanked && item.priority > 0 && (
        <span className={`
          w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
          ${item.priority === 1 ? 'bg-yellow-500/20 text-yellow-400' :
            item.priority === 2 ? 'bg-gray-400/20 text-gray-400' :
            item.priority === 3 ? 'bg-orange-600/20 text-orange-400' :
            'bg-background-tertiary text-foreground-muted'}
        `}>
          {item.priority}
        </span>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="
              w-full px-2 py-1 rounded
              bg-background-secondary border border-primary/50
              text-sm text-foreground
              focus:outline-none
            "
          />
        ) : (
          <span
            className={`
              text-sm cursor-text
              ${item.is_completed ? 'line-through text-foreground-muted' : 'text-foreground'}
            `}
            onDoubleClick={() => setIsEditing(true)}
          >
            {item.content}
          </span>
        )}

        {/* Notes preview */}
        {item.notes && !isEditing && (
          <p className="text-xs text-foreground-muted mt-0.5 line-clamp-1">
            {item.notes}
          </p>
        )}
      </div>

      {/* Due date */}
      {item.due_at && (
        <span className={`
          text-xs px-2 py-0.5 rounded-full
          ${new Date(item.due_at) < new Date()
            ? 'bg-red-500/20 text-red-400'
            : 'bg-background-tertiary text-foreground-muted'
          }
        `}>
          {formatRelativeTime(item.due_at)}
        </span>
      )}

      {/* Entity badge */}
      {item.entity && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
          {item.entity.name}
        </span>
      )}

      {/* Actions */}
      {showActions && !isEditing && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 rounded hover:bg-background-secondary transition-colors"
            title="Edit"
          >
            <svg className="w-3.5 h-3.5 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete?.(item)}
            className="p-1 rounded hover:bg-red-500/20 transition-colors"
            title="Delete"
          >
            <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
    </motion.div>
  );
}

export default ListItemRow;
