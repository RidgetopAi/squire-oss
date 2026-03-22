'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { List, ListType } from '@/lib/types';
import { ListCard } from './ListCard';
import { ExportModal, type ExportFormat } from '@/components/common';
import { exportAllLists } from '@/lib/api/lists';

interface ListsListProps {
  lists: List[];
  isLoading?: boolean;
  onOpen: (list: List) => void;
  onEdit: (list: List) => void;
  onArchive: (list: List) => void;
  onDelete: (list: List) => void;
}

type SortOption = 'updated_desc' | 'updated_asc' | 'created_desc' | 'name_asc';
type ViewMode = 'grid' | 'list';

const typeFilters: { value: ListType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'checklist', label: '☑️ Checklists' },
  { value: 'simple', label: '📋 Simple' },
  { value: 'ranked', label: '🏆 Ranked' },
];

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'created_desc', label: 'Newest first' },
  { value: 'updated_asc', label: 'Oldest updated' },
  { value: 'name_asc', label: 'Name A-Z' },
];

export function ListsList({
  lists,
  isLoading = false,
  onOpen,
  onEdit,
  onArchive,
  onDelete,
}: ListsListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ListType | 'all'>('all');
  const [pinnedFilter, setPinnedFilter] = useState<'all' | 'pinned' | 'unpinned'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('updated_desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showExportModal, setShowExportModal] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    if (format === 'txt') return; // Use exportAllLists which supports json/markdown/csv
    const blob = await exportAllLists(format as 'json' | 'markdown' | 'csv');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lists-export-${new Date().toISOString().split('T')[0]}.${format === 'markdown' ? 'md' : format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredLists = useMemo(() => {
    let result = [...lists];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (list) =>
          list.name.toLowerCase().includes(query) ||
          list.description?.toLowerCase().includes(query) ||
          list.tags.some((tag) => tag.includes(query))
      );
    }

    if (typeFilter !== 'all') {
      result = result.filter((list) => list.list_type === typeFilter);
    }

    if (pinnedFilter === 'pinned') {
      result = result.filter((list) => list.is_pinned);
    } else if (pinnedFilter === 'unpinned') {
      result = result.filter((list) => !list.is_pinned);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'updated_desc':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case 'updated_asc':
          return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        case 'created_desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'name_asc':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    const pinned = result.filter((l) => l.is_pinned);
    const unpinned = result.filter((l) => !l.is_pinned);
    return [...pinned, ...unpinned];
  }, [lists, searchQuery, typeFilter, pinnedFilter, sortBy]);

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search lists..."
            className="
              w-full pl-10 pr-4 py-2 rounded-lg
              bg-background-tertiary border border-glass-border
              text-sm text-foreground placeholder:text-foreground-muted
              focus:outline-none focus:border-primary/50
            "
          />
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ListType | 'all')}
          className="
            px-3 py-2 rounded-lg
            bg-background-tertiary border border-glass-border
            text-sm text-foreground
            focus:outline-none focus:border-primary/50
          "
        >
          {typeFilters.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Pinned filter */}
        <select
          value={pinnedFilter}
          onChange={(e) => setPinnedFilter(e.target.value as 'all' | 'pinned' | 'unpinned')}
          className="
            px-3 py-2 rounded-lg
            bg-background-tertiary border border-glass-border
            text-sm text-foreground
            focus:outline-none focus:border-primary/50
          "
        >
          <option value="all">All Lists</option>
          <option value="pinned">📌 Pinned</option>
          <option value="unpinned">Unpinned</option>
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="
            px-3 py-2 rounded-lg
            bg-background-tertiary border border-glass-border
            text-sm text-foreground
            focus:outline-none focus:border-primary/50
          "
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* View mode toggle */}
        <div className="flex rounded-lg border border-glass-border overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={`
              px-3 py-2 transition-colors
              ${viewMode === 'grid' ? 'bg-primary text-white' : 'bg-background-tertiary text-foreground-muted hover:text-foreground'}
            `}
            title="Grid view"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`
              px-3 py-2 transition-colors
              ${viewMode === 'list' ? 'bg-primary text-white' : 'bg-background-tertiary text-foreground-muted hover:text-foreground'}
            `}
            title="List view"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Export button */}
        <button
          onClick={() => setShowExportModal(true)}
          className="px-3 py-2 rounded-lg bg-background-tertiary border border-glass-border hover:border-foreground-muted transition-colors flex items-center gap-2"
          title="Export lists"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span className="text-sm hidden sm:inline">Export</span>
        </button>
      </div>

      {/* Lists display */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse glass rounded-lg p-4 h-36">
              <div className="h-4 bg-background-tertiary rounded w-2/3 mb-3" />
              <div className="space-y-2">
                <div className="h-3 bg-background-tertiary rounded w-full" />
                <div className="h-3 bg-background-tertiary rounded w-4/5" />
              </div>
              <div className="h-2 bg-background-tertiary rounded w-full mt-4" />
            </div>
          ))}
        </div>
      ) : filteredLists.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-foreground-muted">
            {searchQuery || typeFilter !== 'all' || pinnedFilter !== 'all'
              ? 'No lists match your filters'
              : 'No lists yet. Create your first list!'}
          </p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <motion.div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
                : 'space-y-3'
            }
          >
            {filteredLists.map((list) => (
              <motion.div
                key={list.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <ListCard
                  list={list}
                  onOpen={onOpen}
                  onEdit={onEdit}
                  onArchive={onArchive}
                  onDelete={onDelete}
                  compact={viewMode === 'list'}
                />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Results count */}
      {!isLoading && filteredLists.length > 0 && (
        <p className="text-sm text-foreground-muted text-center">
          Showing {filteredLists.length} of {lists.length} lists
        </p>
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        title="Export Lists"
        formats={['json', 'markdown', 'csv']}
      />
    </div>
  );
}

export default ListsList;
