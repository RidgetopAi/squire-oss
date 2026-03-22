'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoredDocument } from '@/lib/api/documents';
import { DocumentCard } from './DocumentCard';

interface DocumentListProps {
  documents: StoredDocument[];
  isLoading: boolean;
  onSelect?: (document: StoredDocument) => void;
  onDelete?: (document: StoredDocument) => void;
  selectedId?: string | null;
  viewMode?: 'grid' | 'list';
}

export function DocumentList({
  documents,
  isLoading,
  onSelect,
  onDelete,
  selectedId,
  viewMode = 'list',
}: DocumentListProps) {
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Sort documents
  const sortedDocuments = [...documents].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'date':
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case 'name':
        comparison = (a.name || a.filename).localeCompare(b.name || b.filename);
        break;
      case 'size':
        comparison = a.size_bytes - b.size_bytes;
        break;
    }

    return sortOrder === 'desc' ? -comparison : comparison;
  });

  // Loading skeleton
  if (isLoading) {
    return (
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="glass rounded-xl p-4 animate-pulse"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-background-tertiary" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-background-tertiary rounded w-3/4" />
                <div className="h-3 bg-background-tertiary rounded w-1/2" />
                <div className="h-3 bg-background-tertiary rounded w-1/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-background-tertiary flex items-center justify-center">
          <svg className="w-8 h-8 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-foreground mb-1">No documents yet</h3>
        <p className="text-foreground-muted">Upload your first document to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sort Controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground-muted">
          {documents.length} document{documents.length !== 1 ? 's' : ''}
        </p>

        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'name' | 'size')}
            className="text-sm px-2 py-1 rounded-lg bg-background-tertiary border border-glass-border text-foreground focus:outline-none focus:border-primary/50"
          >
            <option value="date">Date</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>

          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="p-1.5 rounded-lg bg-background-tertiary border border-glass-border text-foreground-muted hover:text-foreground transition-colors"
            title={sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
          >
            {sortOrder === 'asc' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Document List */}
      <motion.div
        layout
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'space-y-3'
        }
      >
        <AnimatePresence mode="popLayout">
          {sortedDocuments.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onClick={() => onSelect?.(doc)}
              onDelete={onDelete ? () => onDelete(doc) : undefined}
              isSelected={selectedId === doc.id}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default DocumentList;
