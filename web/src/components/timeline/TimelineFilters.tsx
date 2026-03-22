'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { MemorySource } from '@/lib/types';

// Filter state interface
export interface TimelineFilterState {
  searchQuery: string;
  sources: MemorySource[];
  dateRange: DateRangePreset;
  minSalience: number;
}

export type DateRangePreset = 'all' | 'today' | 'week' | 'month' | 'year';

// Default filter state
export const defaultFilters: TimelineFilterState = {
  searchQuery: '',
  sources: [],
  dateRange: 'all',
  minSalience: 0,
};

// Icons
const icons = {
  search: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  x: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  chevronDown: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  conversation: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  observation: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  document: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  import: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ),
  system: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  star: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  calendar: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
};

// Source configuration
const sourceOptions: { source: MemorySource; icon: React.ReactNode; label: string; color: string }[] = [
  { source: 'chat', icon: icons.conversation, label: 'Chat', color: 'primary' },
  { source: 'observation', icon: icons.observation, label: 'Observe', color: 'purple' },
  { source: 'document', icon: icons.document, label: 'Doc', color: 'info' },
  { source: 'import', icon: icons.import, label: 'Import', color: 'gold' },
  { source: 'system', icon: icons.system, label: 'System', color: 'muted' },
];

// Date range options
const dateRangeOptions: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

// Salience options
const salienceOptions: { value: number; label: string }[] = [
  { value: 0, label: 'All' },
  { value: 5, label: '5+' },
  { value: 7, label: '7+' },
  { value: 9, label: '9+' },
];

interface TimelineFiltersProps {
  filters: TimelineFilterState;
  onFiltersChange: (filters: TimelineFilterState) => void;
  isSearching?: boolean;
  resultCount?: number;
}

export function TimelineFilters({
  filters,
  onFiltersChange,
  isSearching = false,
  resultCount,
}: TimelineFiltersProps) {
  const [localSearch, setLocalSearch] = useState(filters.searchQuery);
  const [showFilters, setShowFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync local search with filters
  useEffect(() => {
    setLocalSearch(filters.searchQuery);
  }, [filters.searchQuery]);

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filters, searchQuery: value });
    }, 300);
  }, [filters, onFiltersChange]);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setLocalSearch('');
    onFiltersChange({ ...filters, searchQuery: '' });
    searchInputRef.current?.focus();
  }, [filters, onFiltersChange]);

  // Toggle source filter
  const toggleSource = useCallback((source: MemorySource) => {
    const newSources = filters.sources.includes(source)
      ? filters.sources.filter(s => s !== source)
      : [...filters.sources, source];
    onFiltersChange({ ...filters, sources: newSources });
  }, [filters, onFiltersChange]);

  // Set date range
  const setDateRange = useCallback((range: DateRangePreset) => {
    onFiltersChange({ ...filters, dateRange: range });
  }, [filters, onFiltersChange]);

  // Set salience threshold
  const setSalience = useCallback((minSalience: number) => {
    onFiltersChange({ ...filters, minSalience });
  }, [filters, onFiltersChange]);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setLocalSearch('');
    onFiltersChange(defaultFilters);
  }, [onFiltersChange]);

  // Check if any filters are active
  const hasActiveFilters =
    filters.searchQuery !== '' ||
    filters.sources.length > 0 ||
    filters.dateRange !== 'all' ||
    filters.minSalience > 0;

  // Count active filters (excluding search)
  const activeFilterCount =
    (filters.sources.length > 0 ? 1 : 0) +
    (filters.dateRange !== 'all' ? 1 : 0) +
    (filters.minSalience > 0 ? 1 : 0);

  return (
    <div className="space-y-3 mb-6">
      {/* Main filter bar */}
      <div className="flex items-center gap-3 p-3 bg-surface-elevated rounded-lg border border-border/50">
        {/* Search input */}
        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-surface rounded-md border border-border/50 focus-within:border-accent-primary/50 transition-colors">
          <span className={`transition-colors ${localSearch ? 'text-accent-primary' : 'text-foreground-muted'}`}>
            {icons.search}
          </span>
          <input
            ref={searchInputRef}
            type="text"
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search memories..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-muted focus:outline-none"
          />
          {localSearch && (
            <button
              onClick={handleClearSearch}
              className="p-0.5 text-foreground-muted hover:text-foreground transition-colors"
            >
              {icons.x}
            </button>
          )}
          {isSearching && (
            <div className="w-4 h-4 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
          )}
        </div>

        {/* Filter toggle button */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-all
            ${showFilters || activeFilterCount > 0
              ? 'bg-accent-primary/10 border-accent-primary/30 text-accent-primary'
              : 'bg-surface border-border/50 text-foreground-muted hover:bg-surface-hover'
            }
          `}
        >
          <span className={showFilters ? 'rotate-180 transition-transform' : 'transition-transform'}>
            {icons.chevronDown}
          </span>
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-accent-primary text-background rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Clear all button */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="px-3 py-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Expanded filters panel */}
      {showFilters && (
        <div className="p-4 bg-surface-elevated rounded-lg border border-border/50 space-y-4 animate-fade-in">
          {/* Source filters */}
          <div>
            <label className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-2 block">
              Source
            </label>
            <div className="flex flex-wrap gap-2">
              {sourceOptions.map(({ source, icon, label, color }) => {
                const isActive = filters.sources.includes(source);
                return (
                  <button
                    key={source}
                    onClick={() => toggleSource(source)}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                      ${isActive
                        ? `
                          ${color === 'primary' ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/30' : ''}
                          ${color === 'purple' ? 'bg-accent-purple/20 text-accent-purple border-accent-purple/30' : ''}
                          ${color === 'info' ? 'bg-accent-info/20 text-accent-info border-accent-info/30' : ''}
                          ${color === 'gold' ? 'bg-accent-gold/20 text-accent-gold border-accent-gold/30' : ''}
                          ${color === 'muted' ? 'bg-foreground-muted/20 text-foreground-muted border-foreground-muted/30' : ''}
                          border
                        `
                        : 'bg-surface border border-border/50 text-foreground-muted hover:bg-surface-hover'
                      }
                    `}
                  >
                    {icon}
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date range and salience row */}
          <div className="flex flex-wrap gap-4">
            {/* Date range */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                {icons.calendar}
                <span>Time Range</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {dateRangeOptions.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setDateRange(value)}
                    className={`
                      px-3 py-1.5 rounded-md text-xs font-medium transition-all
                      ${filters.dateRange === value
                        ? 'bg-accent-primary text-background'
                        : 'bg-surface border border-border/50 text-foreground-muted hover:bg-surface-hover'
                      }
                    `}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Salience threshold */}
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                {icons.star}
                <span>Min Salience</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {salienceOptions.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setSalience(value)}
                    className={`
                      px-3 py-1.5 rounded-md text-xs font-medium transition-all
                      ${filters.minSalience === value
                        ? 'bg-accent-gold text-background'
                        : 'bg-surface border border-border/50 text-foreground-muted hover:bg-surface-hover'
                      }
                    `}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results indicator */}
      {(filters.searchQuery || hasActiveFilters) && resultCount !== undefined && (
        <div className="text-xs text-foreground-muted px-1">
          {resultCount === 0 ? (
            <span>No memories match your filters</span>
          ) : (
            <span>
              Showing <span className="font-medium text-foreground">{resultCount}</span>
              {resultCount === 1 ? ' memory' : ' memories'}
              {filters.searchQuery && (
                <span> matching &ldquo;<span className="text-accent-primary">{filters.searchQuery}</span>&rdquo;</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Export helper to get date range bounds
export function getDateRangeBounds(range: DateRangePreset): { start: Date | null; end: Date | null } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (range) {
    case 'today':
      return { start: today, end: now };
    case 'week': {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      return { start: weekStart, end: now };
    }
    case 'month': {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: monthStart, end: now };
    }
    case 'year': {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      return { start: yearStart, end: now };
    }
    case 'all':
    default:
      return { start: null, end: null };
  }
}
