'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DocumentSearchResult } from '@/lib/types';
import { searchDocuments } from '@/lib/api/documents';

interface DocumentSearchProps {
  onResultClick?: (result: DocumentSearchResult) => void;
}

export function DocumentSearch({ onResultClick }: DocumentSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocumentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const { results: searchResults } = await searchDocuments(searchQuery, {
        limit: 20,
        threshold: 0.3,
      });
      setResults(searchResults);
      setHasSearched(true);
    } catch (err) {
      console.error('Search failed:', err);
      setError('Search failed. Please try again.');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    performSearch(query);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setError(null);
  };

  const getRelevanceColor = (similarity: number): string => {
    if (similarity >= 0.8) return 'bg-green-500';
    if (similarity >= 0.6) return 'bg-emerald-500';
    if (similarity >= 0.4) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  const getRelevanceLabel = (similarity: number): string => {
    if (similarity >= 0.8) return 'Excellent';
    if (similarity >= 0.6) return 'Good';
    if (similarity >= 0.4) return 'Fair';
    return 'Partial';
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="Search documents..."
            className="
              w-full pl-10 pr-10 py-3 rounded-xl
              bg-background-tertiary border border-glass-border
              text-foreground placeholder:text-foreground-muted
              focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30
              transition-all
            "
          />

          {query && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-background transition-colors"
            >
              <svg className="w-4 h-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Loading indicator */}
        {isSearching && (
          <div className="absolute right-12 top-1/2 -translate-y-1/2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full"
            />
          </div>
        )}
      </form>

      {/* Error Message */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      <AnimatePresence mode="wait">
        {hasSearched && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {/* Results count */}
            <p className="text-sm text-foreground-muted">
              {results.length} result{results.length !== 1 ? 's' : ''} found
            </p>

            {/* Result list */}
            {results.length === 0 ? (
              <div className="text-center py-8">
                <svg
                  className="w-12 h-12 mx-auto text-foreground-muted mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-foreground-muted">No matching documents found</p>
                <p className="text-sm text-foreground-muted mt-1">Try different keywords</p>
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((result, index) => (
                  <motion.div
                    key={result.chunkId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => onResultClick?.(result)}
                    className="p-4 rounded-lg bg-background-tertiary border border-glass-border hover:border-primary/30 cursor-pointer transition-all group"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        {result.sectionTitle && (
                          <p className="text-sm font-medium text-primary truncate">
                            {result.sectionTitle}
                          </p>
                        )}
                        {result.pageNumber && (
                          <p className="text-xs text-foreground-muted">
                            Page {result.pageNumber}
                          </p>
                        )}
                      </div>

                      {/* Relevance indicator */}
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${getRelevanceColor(result.similarity)}`}
                          title={`${(result.similarity * 100).toFixed(0)}% match`}
                        />
                        <span className="text-xs text-foreground-muted">
                          {getRelevanceLabel(result.similarity)}
                        </span>
                      </div>
                    </div>

                    {/* Content preview */}
                    <p className="text-sm text-foreground line-clamp-3 group-hover:line-clamp-none transition-all">
                      {result.content}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center gap-2 mt-2 text-xs text-foreground-muted">
                      <span>{(result.similarity * 100).toFixed(0)}% match</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint when empty */}
      {!hasSearched && !query && (
        <div className="text-center py-8 text-foreground-muted">
          <svg
            className="w-10 h-10 mx-auto mb-3 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <p className="text-sm">Search across all your documents</p>
          <p className="text-xs mt-1">Uses AI-powered semantic search</p>
        </div>
      )}
    </div>
  );
}

export default DocumentSearch;
