'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Note, Entity, CreateNoteInput, UpdateNoteInput, NoteCategory } from '@/lib/types';
import { EntityPicker } from './EntityPicker';

interface NoteEditorProps {
  note?: Note | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: CreateNoteInput | UpdateNoteInput, noteId?: string) => Promise<void>;
}

const categories: { value: NoteCategory; label: string; color: string }[] = [
  { value: 'work', label: 'Work', color: 'bg-blue-500' },
  { value: 'personal', label: 'Personal', color: 'bg-purple-500' },
  { value: 'health', label: 'Health', color: 'bg-green-500' },
  { value: 'project', label: 'Project', color: 'bg-orange-500' },
];

const noteColors = [
  { value: null, label: 'None' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#22c55e', label: 'Green' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#ec4899', label: 'Pink' },
];

export function NoteEditor({ note, isOpen, onClose, onSave }: NoteEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<NoteCategory | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!note;

  useEffect(() => {
    if (note) {
      setTitle(note.title || '');
      setContent(note.content);
      setCategory(note.category);
      setTags(note.tags);
      setIsPinned(note.is_pinned);
      setColor(note.color);
      setEntity(note.primary_entity || null);
    } else {
      setTitle('');
      setContent('');
      setCategory(null);
      setTags([]);
      setIsPinned(false);
      setColor(null);
      setEntity(null);
    }
    setTagInput('');
  }, [note, isOpen]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    if (!content.trim()) return;

    setIsSaving(true);
    try {
      const input: CreateNoteInput | UpdateNoteInput = {
        title: title.trim() || undefined,
        content: content.trim(),
        category: category || undefined,
        tags,
        is_pinned: isPinned,
        color: color || undefined,
      };

      if (!isEditing && entity) {
        (input as CreateNoteInput).primary_entity_id = entity.id;
      }

      await onSave(input, note?.id);
      onClose();
    } catch (error) {
      console.error('Failed to save note:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-[calc(env(safe-area-inset-top)+1.5rem)] right-[calc(env(safe-area-inset-right)+1.5rem)] bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] left-[calc(env(safe-area-inset-left)+1.5rem)] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-2xl md:w-full md:max-h-[85vh] z-50 glass rounded-xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-glass-border">
              <h2 className="text-lg font-semibold text-foreground">
                {isEditing ? 'Edit Note' : 'New Note'}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-background-tertiary transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-foreground-muted mb-1">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Note title..."
                  className="
                    w-full px-3 py-2 rounded-lg
                    bg-background-tertiary border border-glass-border
                    text-foreground placeholder:text-foreground-muted
                    focus:outline-none focus:border-primary/50
                  "
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-foreground-muted mb-1">
                  Content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your note..."
                  rows={6}
                  className="
                    w-full px-3 py-2 rounded-lg resize-none
                    bg-background-tertiary border border-glass-border
                    text-foreground placeholder:text-foreground-muted
                    focus:outline-none focus:border-primary/50
                  "
                />
              </div>

              {/* Entity Link */}
              <div>
                <label className="block text-sm font-medium text-foreground-muted mb-1">
                  Link to Entity
                </label>
                <EntityPicker
                  value={entity}
                  onChange={setEntity}
                  placeholder="Search for entity..."
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-foreground-muted mb-1">
                  Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(category === cat.value ? null : cat.value)}
                      className={`
                        px-3 py-1.5 rounded-lg text-sm transition-colors
                        ${category === cat.value
                          ? `${cat.color} text-white`
                          : 'bg-background-tertiary text-foreground-muted hover:text-foreground'
                        }
                      `}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-foreground-muted mb-1">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-background-tertiary text-sm"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-red-400 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    placeholder="Add tag..."
                    className="
                      flex-1 px-3 py-2 rounded-lg
                      bg-background-tertiary border border-glass-border
                      text-sm text-foreground placeholder:text-foreground-muted
                      focus:outline-none focus:border-primary/50
                    "
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-3 py-2 rounded-lg bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-foreground-muted mb-1">
                  Color
                </label>
                <div className="flex gap-2">
                  {noteColors.map((c) => (
                    <button
                      key={c.value || 'none'}
                      type="button"
                      onClick={() => setColor(c.value)}
                      className={`
                        w-8 h-8 rounded-full transition-all
                        ${c.value ? '' : 'bg-background-tertiary border border-glass-border'}
                        ${color === c.value ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                      `}
                      style={c.value ? { backgroundColor: c.value } : undefined}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              {/* Pin toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPinned(!isPinned)}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
                    ${isPinned
                      ? 'bg-accent-gold/20 text-accent-gold border border-accent-gold/30'
                      : 'bg-background-tertiary text-foreground-muted hover:text-foreground'
                    }
                  `}
                >
                  <span>📌</span>
                  <span className="text-sm">{isPinned ? 'Pinned' : 'Pin this note'}</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-glass-border">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-foreground-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!content.trim() || isSaving}
                className="
                  px-4 py-2 rounded-lg text-sm
                  bg-primary text-white
                  hover:bg-primary/90 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Note'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default NoteEditor;
