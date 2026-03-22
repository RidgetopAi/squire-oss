'use client';

import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useInfiniteMemories, useMemorySearch } from '@/lib/hooks/useMemories';
import {
  TimelineFilters,
  LoadMoreTrigger,
  EndOfTimeline,
  defaultFilters,
  getDateRangeBounds,
  type TimelineFilterState,
} from '@/components/timeline';
import { DetailModal } from '@/components/dashboard';
import { useOpenMemoryDetail } from '@/lib/stores';
import type { Memory, MemorySource } from '@/lib/types';

// Icons as simple SVG components
const icons = {
  clock: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  conversation: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  observation: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  document: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  import: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ),
  system: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  sparkles: (
    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  searchEmpty: (
    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
};

// Source icon and color mapping
const sourceConfig: Record<MemorySource, { icon: React.ReactNode; color: string; label: string }> = {
  chat: { icon: icons.conversation, color: 'primary', label: 'Chat' },
  conversation: { icon: icons.conversation, color: 'primary', label: 'Conversation' },
  observation: { icon: icons.observation, color: 'purple', label: 'Observation' },
  document: { icon: icons.document, color: 'info', label: 'Document' },
  import: { icon: icons.import, color: 'gold', label: 'Import' },
  system: { icon: icons.system, color: 'muted', label: 'System' },
};

// Format relative time
function formatRelativeTime(date: string | null | undefined): string {
  if (!date) return '—';

  const now = new Date();
  const then = new Date(date);

  // Check for invalid date
  if (isNaN(then.getTime())) return '—';

  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Format date for timeline header
function formatDateHeader(date: string): string {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

// Group memories by date
function groupMemoriesByDate(memories: Memory[]): Map<string, Memory[]> {
  const groups = new Map<string, Memory[]>();

  memories.forEach(memory => {
    const date = new Date(memory.created_at).toDateString();
    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(memory);
  });

  return groups;
}

// Apply filters to memories (client-side)
function applyFilters(memories: Memory[], filters: TimelineFilterState): Memory[] {
  let filtered = [...memories];

  // Filter by source
  if (filters.sources.length > 0) {
    filtered = filtered.filter(m => filters.sources.includes(m.source));
  }

  // Filter by date range
  const { start } = getDateRangeBounds(filters.dateRange);
  if (start) {
    filtered = filtered.filter(m => new Date(m.created_at) >= start);
  }

  // Filter by salience
  if (filters.minSalience > 0) {
    filtered = filtered.filter(m => (m.salience ?? 0) >= filters.minSalience);
  }

  return filtered;
}

// Loading skeleton
function TimelineSkeleton() {
  return (
    <div className="space-y-6">
      {/* Date header skeleton */}
      <div className="h-6 w-32 bg-surface-elevated rounded animate-pulse" />

      {/* Memory cards skeleton */}
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="flex gap-4 animate-pulse"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          {/* Timeline dot */}
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-surface-elevated" />
            <div className="w-0.5 flex-1 bg-surface-elevated/50 mt-2" />
          </div>

          {/* Card */}
          <div className="flex-1 bg-surface-elevated rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-border" />
              <div className="h-4 w-20 bg-border rounded" />
              <div className="h-3 w-12 bg-border/50 rounded ml-auto" />
            </div>
            <div className="h-4 w-full bg-border rounded" />
            <div className="h-4 w-3/4 bg-border/50 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Empty state
function TimelineEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-accent-gold/10 border border-accent-gold/30 flex items-center justify-center mb-4">
        <span className="text-accent-gold">{icons.sparkles}</span>
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">No memories yet</h2>
      <p className="text-foreground-muted max-w-md">
        Your timeline will fill up as you create memories through conversations, observations, and document imports.
      </p>
    </div>
  );
}

// No results state (for filtered/search)
function NoResultsState({ isSearch }: { isSearch: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-surface-elevated border border-border/50 flex items-center justify-center mb-4">
        <span className="text-foreground-muted">{icons.searchEmpty}</span>
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">
        {isSearch ? 'No matching memories' : 'No memories match filters'}
      </h2>
      <p className="text-foreground-muted max-w-md">
        {isSearch
          ? 'Try adjusting your search terms or clearing filters.'
          : 'Try adjusting your filters to see more memories.'}
      </p>
    </div>
  );
}

// Chevron icon for expand/collapse
const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

// Animation variants for staggered entrance
const cardVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: (index: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: index * 0.05, // 50ms stagger
      duration: 0.3,
      ease: [0, 0, 0.2, 1] as const, // ease-out cubic bezier
    },
  }),
};

// Memory card component
interface MemoryCardProps {
  memory: Memory;
  isLast: boolean;
  isExpanded: boolean;
  isFocused: boolean;
  animationIndex: number;
  onClick?: (memory: Memory) => void;
  onToggleExpand?: (memoryId: string) => void;
  searchQuery?: string;
}

function MemoryCard({ memory, isLast, isExpanded, isFocused, animationIndex, onClick, onToggleExpand, searchQuery }: MemoryCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const config = sourceConfig[memory.source] || sourceConfig.system;
  const salience = memory.salience ?? 0;
  const isHighSalience = salience >= 7;

  // Check if content is long enough to need expansion
  const isLongContent = memory.content.length > 200;
  const hasMoreEntities = memory.entities && memory.entities.length > 3;
  const isExpandable = isLongContent || hasMoreEntities;

  // Scroll into view when focused
  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isFocused]);

  // Highlight search terms in content
  const highlightContent = (content: string, query: string) => {
    if (!query || query.length < 2) return content;

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = content.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-accent-gold/30 text-foreground rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Handle expand toggle (prevent card click)
  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand?.(memory.id);
  };

  return (
    <motion.div
      ref={cardRef}
      className="flex gap-4 group"
      onClick={() => onClick?.(memory)}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={animationIndex}
      layout
    >
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        {/* Dot with source color */}
        <div
          className={`
            w-3 h-3 rounded-full border-2 transition-transform duration-200
            ${isHighSalience ? 'scale-125' : ''}
            ${config.color === 'primary' ? 'border-accent-primary bg-accent-primary/30' : ''}
            ${config.color === 'purple' ? 'border-accent-purple bg-accent-purple/30' : ''}
            ${config.color === 'gold' ? 'border-accent-gold bg-accent-gold/30' : ''}
            ${config.color === 'info' ? 'border-accent-info bg-accent-info/30' : ''}
            ${config.color === 'muted' ? 'border-foreground-muted bg-foreground-muted/30' : ''}
            group-hover:scale-150
          `}
        />
        {/* Connecting line */}
        {!isLast && (
          <div className="w-0.5 flex-1 bg-border/50 mt-2" />
        )}
      </div>

      {/* Memory card */}
      <motion.div
        className={`
          flex-1 mb-4 bg-surface-elevated rounded-lg p-4 border transition-all duration-200
          hover:border-border hover:bg-surface-hover
          ${onClick ? 'cursor-pointer' : ''}
          ${isFocused
            ? 'border-accent-primary ring-2 ring-accent-primary/30 bg-accent-primary/5'
            : 'border-border/50'}
        `}
        layout
        transition={{ duration: 0.2 }}
      >
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2">
          {/* Source icon */}
          <span className={`
            ${config.color === 'primary' ? 'text-accent-primary' : ''}
            ${config.color === 'purple' ? 'text-accent-purple' : ''}
            ${config.color === 'gold' ? 'text-accent-gold' : ''}
            ${config.color === 'info' ? 'text-accent-info' : ''}
            ${config.color === 'muted' ? 'text-foreground-muted' : ''}
          `}>
            {config.icon}
          </span>

          {/* Source label */}
          <span className="text-xs text-foreground-muted font-medium">
            {config.label}
          </span>

          {/* Salience indicator */}
          {isHighSalience && (
            <span className="flex items-center gap-1 text-xs text-accent-gold">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-gold" />
              {salience.toFixed(1)}
            </span>
          )}

          {/* Timestamp */}
          <span className="text-xs text-foreground-muted ml-auto">
            {formatRelativeTime(memory.created_at)}
          </span>

          {/* Expand/collapse button */}
          {isExpandable && (
            <button
              onClick={handleExpandClick}
              className="p-1 -m-1 rounded hover:bg-surface transition-colors text-foreground-muted hover:text-foreground"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              <ChevronIcon expanded={isExpanded} />
            </button>
          )}
        </div>

        {/* Content */}
        <p className={`text-sm text-foreground leading-relaxed ${isExpanded ? '' : 'line-clamp-3'}`}>
          {searchQuery ? highlightContent(memory.content, searchQuery) : memory.content}
        </p>

        {/* Entities preview (if any) */}
        {memory.entities && memory.entities.length > 0 && (
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {(isExpanded ? memory.entities : memory.entities.slice(0, 3)).map((entity) => (
              <span
                key={entity.id}
                className="px-2 py-0.5 text-xs rounded-full bg-surface border border-border text-foreground-muted"
              >
                {entity.name}
              </span>
            ))}
            {!isExpanded && memory.entities.length > 3 && (
              <span className="px-2 py-0.5 text-xs text-foreground-muted">
                +{memory.entities.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Expanded footer with action hint */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
            <span className="text-xs text-foreground-muted">
              Click to view full details
            </span>
            <button
              onClick={handleExpandClick}
              className="text-xs text-accent-primary hover:underline"
            >
              Collapse
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// Date section component
interface DateSectionProps {
  date: string;
  memories: Memory[];
  expandedIds: Set<string>;
  focusedId: string | null;
  onMemoryClick?: (memory: Memory) => void;
  onToggleExpand?: (memoryId: string) => void;
  searchQuery?: string;
}

function DateSection({ date, memories, expandedIds, focusedId, onMemoryClick, onToggleExpand, searchQuery }: DateSectionProps) {
  return (
    <div className="mb-8">
      {/* Date header */}
      <motion.div
        className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2 mb-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h3 className="text-sm font-semibold text-foreground-muted">
          {formatDateHeader(date)}
        </h3>
      </motion.div>

      {/* Memories */}
      <div className="pl-2">
        {memories.map((memory, idx) => (
          <MemoryCard
            key={memory.id}
            memory={memory}
            isLast={idx === memories.length - 1}
            isExpanded={expandedIds.has(memory.id)}
            isFocused={focusedId === memory.id}
            animationIndex={idx}
            onClick={onMemoryClick}
            onToggleExpand={onToggleExpand}
            searchQuery={searchQuery}
          />
        ))}
      </div>
    </div>
  );
}

function TimelineContent() {
  // URL search params for deep linking
  const searchParams = useSearchParams();
  const memoryParam = searchParams.get('memory');

  // Filter state
  const [filters, setFilters] = useState<TimelineFilterState>(defaultFilters);

  // Expanded cards state
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Focused memory state (from URL param)
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Detail modal action
  const openMemory = useOpenMemoryDetail();

  // Handle URL param for deep linking
  useEffect(() => {
    if (memoryParam) {
      setFocusedId(memoryParam);
      // Clear focus highlight after 3 seconds
      const timer = setTimeout(() => setFocusedId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [memoryParam]);

  // Check if searching (semantic search mode)
  const isSearchMode = filters.searchQuery.length >= 3;

  // Check if any filters are active (excluding search)
  const hasActiveFilters =
    filters.sources.length > 0 ||
    filters.dateRange !== 'all' ||
    filters.minSalience > 0;

  // Infinite scroll for browsing mode
  const {
    data: infiniteData,
    isLoading: isLoadingMemories,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error: memoriesError,
  } = useInfiniteMemories({ pageSize: 30 });

  // Semantic search (only when search query is long enough)
  const {
    data: searchResults,
    isLoading: isSearching,
  } = useMemorySearch(filters.searchQuery, { limit: 50 });

  // Flatten infinite pages into single array
  const allMemories = useMemo(() => {
    if (!infiniteData?.pages) return [];
    return infiniteData.pages.flatMap(page => page.memories);
  }, [infiniteData?.pages]);

  // Get total count from first page
  const totalCount = infiniteData?.pages?.[0]?.total ?? 0;

  // Determine which memories to display
  const displayMemories = useMemo(() => {
    if (isSearchMode && searchResults) {
      // In search mode, use search results then apply additional filters
      return applyFilters(searchResults, { ...filters, searchQuery: '' });
    }

    // In browse mode, apply filters if any are active
    if (hasActiveFilters) {
      return applyFilters(allMemories, filters);
    }

    // No filters - show all paginated memories
    return allMemories;
  }, [isSearchMode, searchResults, allMemories, filters, hasActiveFilters]);

  // Group memories by date
  const groupedMemories = useMemo(
    () => groupMemoriesByDate(displayMemories),
    [displayMemories]
  );

  // Handle memory click - opens detail modal
  const handleMemoryClick = useCallback((memory: Memory) => {
    openMemory(memory);
  }, [openMemory]);

  // Handle expand/collapse toggle
  const handleToggleExpand = useCallback((memoryId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(memoryId)) {
        next.delete(memoryId);
      } else {
        next.add(memoryId);
      }
      return next;
    });
  }, []);

  // Load more handler for infinite scroll
  const handleLoadMore = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Loading state (only for initial load)
  const isLoading = isLoadingMemories || (isSearchMode && isSearching);

  // Error state
  const error = memoriesError;

  // Check for empty base data vs no results from filters
  const hasNoBaseData = !isLoadingMemories && allMemories.length === 0;
  const hasNoFilterResults = displayMemories.length === 0 && !hasNoBaseData;

  // Determine if we should show infinite scroll controls
  // Only in browse mode without client-side filters (which break pagination)
  const showInfiniteScroll = !isSearchMode && !hasActiveFilters;

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      {/* Detail Modal */}
      <DetailModal />

      {/* Page Header */}
      <div className="mb-6 animate-fade-in flex-shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-accent-gold">{icons.clock}</span>
          <h1 className="text-2xl font-bold text-foreground">Timeline</h1>
        </div>
        <p className="text-foreground-muted text-sm">
          Your memories in chronological order — scroll through time
        </p>
      </div>

      {/* Filter Bar */}
      <div className="flex-shrink-0">
        <TimelineFilters
          filters={filters}
          onFiltersChange={setFilters}
          isSearching={isSearchMode && isSearching}
          resultCount={displayMemories.length}
        />
      </div>

      {/* Main Timeline Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <TimelineSkeleton />
        ) : error ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center text-status-error">
              <p className="font-medium">Failed to load memories</p>
              <p className="text-sm text-foreground-muted mt-1">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          </div>
        ) : hasNoBaseData ? (
          <TimelineEmpty />
        ) : hasNoFilterResults ? (
          <NoResultsState isSearch={isSearchMode} />
        ) : (
          <div className="animate-fade-in">
            {Array.from(groupedMemories.entries()).map(([date, memories]) => (
              <DateSection
                key={date}
                date={date}
                memories={memories}
                expandedIds={expandedIds}
                focusedId={focusedId}
                onMemoryClick={handleMemoryClick}
                onToggleExpand={handleToggleExpand}
                searchQuery={isSearchMode ? filters.searchQuery : undefined}
              />
            ))}

            {/* Infinite scroll controls */}
            {showInfiniteScroll && (
              hasNextPage ? (
                <LoadMoreTrigger
                  onLoadMore={handleLoadMore}
                  hasMore={hasNextPage}
                  isLoading={isFetchingNextPage}
                />
              ) : displayMemories.length > 0 ? (
                <EndOfTimeline totalCount={totalCount} />
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function TimelinePage() {
  return (
    <Suspense fallback={<TimelineSkeleton />}>
      <TimelineContent />
    </Suspense>
  );
}
