'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Note, NoteCategory } from '@/lib/types';
import { NoteCard } from './NoteCard';
import { ExportModal, type ExportFormat } from '@/components/common';
import { exportNotes } from '@/lib/api/notes';

interface NotesListProps {
  notes: Note[];
  isLoading?: boolean;
  onEdit: (note: Note) => void;
  onPin: (note: Note) => void;
  onArchive: (note: Note) => void;
  onDelete: (note: Note) => void;
}

type SortOption = 'created_desc' | 'created_asc' | 'updated_desc' | 'title_asc';
type ViewMode = 'grid' | 'list';

const categoryFilters: { value: NoteCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'work', label: 'Work' },
  { value: 'personal', label: 'Personal' },
  { value: 'health', label: 'Health' },
  { value: 'project', label: 'Project' },
];

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'created_desc', label: 'Newest first' },
  { value: 'created_asc', label: 'Oldest first' },
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'title_asc', label: 'Title A-Z' },
];

export function NotesList({
  notes,
  isLoading = false,
  onEdit,
  onPin,
  onArchive,
  onDelete,
}: NotesListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<NoteCategory | 'all'>('all');
  const [pinnedFilter, setPinnedFilter] = useState<'all' | 'pinned' | 'unpinned'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('created_desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showExportModal, setShowExportModal] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    if (format === 'txt') return; // Notes don't support txt
    const blob = await exportNotes(format as 'json' | 'markdown' | 'csv');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-export-${new Date().toISOString().split('T')[0]}.${format === 'markdown' ? 'md' : format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredNotes = useMemo(() => {
    let result = [...notes];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (note) =>
          note.title?.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query) ||
          note.tags.some((tag) => tag.includes(query))
      );
    }

    if (categoryFilter !== 'all') {
      result = result.filter((note) => note.category === categoryFilter);
    }

    if (pinnedFilter === 'pinned') {
      result = result.filter((note) => note.is_pinned);
    } else if (pinnedFilter === 'unpinned') {
      result = result.filter((note) => !note.is_pinned);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'created_desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'created_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'updated_desc':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case 'title_asc':
          return (a.title || '').localeCompare(b.title || '');
        default:
          return 0;
      }
    });

    const pinned = result.filter((n) => n.is_pinned);
    const unpinned = result.filter((n) => !n.is_pinned);
    return [...pinned, ...unpinned];
  }, [notes, searchQuery, categoryFilter, pinnedFilter, sortBy]);

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
            placeholder="Search notes..."
            className="
              w-full pl-10 pr-4 py-2 rounded-lg
              bg-background-tertiary border border-glass-border
              text-sm text-foreground placeholder:text-foreground-muted
              focus:outline-none focus:border-primary/50
            "
          />
        </div>

        {/* Category filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as NoteCategory | 'all')}
          className="
            px-3 py-2 rounded-lg
            bg-background-tertiary border border-glass-border
            text-sm text-foreground
            focus:outline-none focus:border-primary/50
          "
        >
          {categoryFilters.map((opt) => (
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
          <option value="all">All Notes</option>
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
          title="Export notes"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span className="text-sm hidden sm:inline">Export</span>
        </button>
      </div>

      {/* Notes display */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse glass rounded-lg p-4 h-40">
              <div className="h-4 bg-background-tertiary rounded w-1/3 mb-3" />
              <div className="space-y-2">
                <div className="h-3 bg-background-tertiary rounded w-full" />
                <div className="h-3 bg-background-tertiary rounded w-5/6" />
                <div className="h-3 bg-background-tertiary rounded w-4/6" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📝</div>
          <p className="text-foreground-muted">
            {searchQuery || categoryFilter !== 'all' || pinnedFilter !== 'all'
              ? 'No notes match your filters'
              : 'No notes yet. Create your first note!'}
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
            {filteredNotes.map((note) => (
              <motion.div
                key={note.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <NoteCard
                  note={note}
                  onEdit={onEdit}
                  onPin={onPin}
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
      {!isLoading && filteredNotes.length > 0 && (
        <p className="text-sm text-foreground-muted text-center">
          Showing {filteredNotes.length} of {notes.length} notes
        </p>
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        title="Export Notes"
        formats={['json', 'markdown', 'csv']}
      />
    </div>
  );
}

export default NotesList;
