'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  listDocuments,
  getFileTypeLabel,
  formatFileSize,
  type StoredDocument,
} from '@/lib/api/documents';

interface DocumentPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (document: StoredDocument) => void;
}

export function DocumentPicker({ isOpen, onClose, onSelect }: DocumentPickerProps) {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch documents when opened
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    listDocuments({ status: 'active', processingStatus: 'completed', limit: 100 })
      .then(({ documents: docs }) => {
        // Only show documents that have extracted text
        setDocuments(docs.filter((d) => d.extracted_text));
      })
      .catch((err) => {
        console.error('[DocumentPicker] Failed to fetch documents:', err);
      })
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  // Client-side filter by search query
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.filename.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q)
    );
  }, [documents, searchQuery]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleSelect = useCallback(
    (doc: StoredDocument) => {
      onSelect(doc);
    },
    [onSelect]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed inset-0 z-[60] bg-[var(--background)] flex flex-col pt-[env(safe-area-inset-top)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
            <h2 className="text-lg font-semibold text-foreground">Documents</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-background-tertiary transition-colors"
            >
              <svg className="w-5 h-5 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="px-6 py-3">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted"
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents..."
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background-tertiary border border-glass-border text-foreground placeholder-foreground-muted text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/30 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Document List */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-12 h-12 mx-auto text-foreground-muted/40 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-foreground-muted">
                  {searchQuery ? 'No documents match your search.' : 'No documents available.'}
                </p>
                <p className="text-xs text-foreground-muted/60 mt-1">
                  Upload documents from the Documents page first.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((doc, index) => (
                  <motion.button
                    key={doc.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.3) }}
                    onClick={() => handleSelect(doc)}
                    className="w-full text-left px-4 py-3 rounded-lg bg-background-tertiary border border-glass-border hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                        <span className="text-xs font-medium text-primary">
                          {getFileTypeLabel(doc.mime_type).slice(0, 3).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-foreground-muted">
                            {getFileTypeLabel(doc.mime_type)}
                          </span>
                          <span className="text-foreground-muted/40">·</span>
                          <span className="text-xs text-foreground-muted">
                            {formatFileSize(doc.size_bytes)}
                          </span>
                          <span className="text-foreground-muted/40">·</span>
                          <span className="text-xs text-foreground-muted">
                            {new Date(doc.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {doc.description && (
                          <p className="text-xs text-foreground-muted/70 mt-1 line-clamp-1">
                            {doc.description}
                          </p>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-foreground-muted/40 shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
