'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { useSavedCardsStore } from '@/lib/stores/savedCardsStore';

interface TagInputProps {
  onSave: (tags: string[]) => void;
  onCancel: () => void;
}

export function TagInput({ onSave, onCancel }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const existingTags = useSavedCardsStore((s) => s.tags);
  const fetchTags = useSavedCardsStore((s) => s.fetchTags);

  useEffect(() => {
    inputRef.current?.focus();
    fetchTags();
  }, [fetchTags]);

  const addTag = (tag: string) => {
    const normalized = tag.toLowerCase().trim();
    if (normalized && !selectedTags.includes(normalized)) {
      setSelectedTags((prev) => [...prev, normalized]);
    }
    setInputValue('');
  };

  const removeTag = (tag: string) => {
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    }
    if (e.key === 'Backspace' && !inputValue && selectedTags.length > 0) {
      removeTag(selectedTags[selectedTags.length - 1]);
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  // Suggested tags (existing tags not yet selected)
  const suggestions = existingTags
    .filter((t) => !selectedTags.includes(t.tag))
    .filter((t) => !inputValue || t.tag.includes(inputValue.toLowerCase()))
    .slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="px-5 pb-3 border-t border-[var(--card-border)]"
    >
      <div className="pt-3">
        {/* Selected tags */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 px-2 py-0.5 text-xs bg-accent-olive/15 text-accent-olive border border-accent-olive/30"
            >
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-foreground">
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedTags.length > 0 ? 'Add more...' : 'Add tags...'}
            className="flex-1 min-w-[80px] bg-transparent text-xs text-foreground placeholder-foreground-muted focus:outline-none py-0.5"
          />
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="flex gap-1 mb-2 flex-wrap">
            {suggestions.map(({ tag }) => (
              <button
                key={tag}
                onClick={() => addTag(tag)}
                className="text-[10px] px-2 py-0.5 text-foreground-muted border border-[var(--card-border)] hover:border-accent-olive/50 hover:text-accent-olive transition-colors"
              >
                + {tag}
              </button>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-xs text-foreground-muted hover:text-foreground transition-colors px-2 py-1"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(selectedTags)}
            className="text-xs bg-primary text-[var(--background)] hover:bg-primary-hover px-3 py-1 font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </motion.div>
  );
}
