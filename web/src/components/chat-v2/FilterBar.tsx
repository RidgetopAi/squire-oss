'use client';

import { useRef, useEffect, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSavedCardsStore } from '@/lib/stores/savedCardsStore';

export function FilterBar() {
  const {
    isFilterMode,
    setFilterMode,
    tags,
    activeFilters,
    toggleTag,
    searchQuery,
    setSearchQuery,
    searchCards,
  } = useSavedCardsStore();

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isFilterMode && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isFilterMode]);

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      searchCards();
    }
    if (e.key === 'Escape') {
      setFilterMode(false);
    }
  };

  return (
    <div className="px-4 py-2 max-w-3xl mx-auto w-full">
      <AnimatePresence mode="wait">
        {!isFilterMode ? (
          <motion.button
            key="toggle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFilterMode(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-accent-olive border border-accent-olive/30 hover:bg-accent-olive/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Saved
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            {/* Search bar + close */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search saved cards..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-background-tertiary border border-[var(--card-border)] text-foreground placeholder-foreground-muted focus:outline-none focus:border-primary/50"
                />
              </div>
              <button
                onClick={() => setFilterMode(false)}
                className="text-xs text-foreground-muted hover:text-foreground transition-colors px-2 py-2"
              >
                Back
              </button>
            </div>

            {/* Tag chips */}
            {tags.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                {tags.map(({ tag, count }) => {
                  const isActive = activeFilters.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs transition-colors ${
                        isActive
                          ? 'bg-accent-olive text-white'
                          : 'bg-accent-olive/10 text-accent-olive border border-accent-olive/30 hover:bg-accent-olive/20'
                      }`}
                    >
                      {tag}
                      <span className="text-[10px] opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
