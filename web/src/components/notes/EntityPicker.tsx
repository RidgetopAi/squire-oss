'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Entity } from '@/lib/types';
import { searchEntities } from '@/lib/api/entities';
import { getEntityIcon } from '@/lib/utils/colors';

interface EntityPickerProps {
  value?: Entity | null;
  onChange: (entity: Entity | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function EntityPicker({
  value,
  onChange,
  placeholder = 'Link to entity...',
  disabled = false,
}: EntityPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const debounce = setTimeout(async () => {
      setIsLoading(true);
      try {
        const entities = await searchEntities(query);
        setResults(entities.slice(0, 10));
      } catch (error) {
        console.error('Failed to search entities:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(debounce);
  }, [query]);

  const handleSelect = (entity: Entity) => {
    onChange(entity);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
  };

  if (value) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background-tertiary border border-glass-border">
        <span>{getEntityIcon(value.type)}</span>
        <span className="text-sm text-foreground flex-1">{value.name}</span>
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          className="p-1 rounded hover:bg-background-secondary transition-colors"
        >
          <svg className="w-4 h-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="
            w-full px-3 py-2 rounded-lg
            bg-background-tertiary border border-glass-border
            text-sm text-foreground placeholder:text-foreground-muted
            focus:outline-none focus:border-primary/50
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <svg className="w-4 h-4 text-foreground-muted animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (query.trim() || results.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="
              absolute z-50 w-full mt-1
              glass rounded-lg border border-glass-border
              max-h-60 overflow-auto
              shadow-lg
            "
          >
            {results.length > 0 ? (
              <ul className="py-1">
                {results.map((entity) => (
                  <li key={entity.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(entity)}
                      className="
                        w-full flex items-center gap-2 px-3 py-2
                        text-left text-sm
                        hover:bg-background-tertiary transition-colors
                      "
                    >
                      <span>{getEntityIcon(entity.type)}</span>
                      <span className="text-foreground flex-1">{entity.name}</span>
                      <span className="text-xs text-foreground-muted capitalize">{entity.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : query.trim() && !isLoading ? (
              <div className="px-3 py-4 text-sm text-foreground-muted text-center">
                No entities found
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default EntityPicker;
