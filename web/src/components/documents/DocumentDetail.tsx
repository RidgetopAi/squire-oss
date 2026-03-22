'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DocumentChunk } from '@/lib/types';
import type { StoredDocument } from '@/lib/api/documents';
import { getDocumentChunks, getFileTypeLabel, formatFileSize } from '@/lib/api/documents';

interface DocumentDetailProps {
  document: StoredDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onReprocess?: () => void;
  onDelete?: () => void;
  onReviewFacts?: () => void;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  completed: { label: 'Completed', color: 'text-green-400' },
  processing: { label: 'Processing', color: 'text-blue-400' },
  pending: { label: 'Pending', color: 'text-yellow-400' },
  failed: { label: 'Failed', color: 'text-red-400' },
  skipped: { label: 'Skipped', color: 'text-gray-400' },
};

export function DocumentDetail({
  document,
  isOpen,
  onClose,
  onReprocess,
  onDelete,
  onReviewFacts,
}: DocumentDetailProps) {
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'chunks' | 'text'>('overview');
  const [currentChunkPage, setCurrentChunkPage] = useState(0);
  const chunksPerPage = 5;

  // Load chunks when document changes
  useEffect(() => {
    if (document && isOpen) {
      loadChunks();
    }
  }, [document?.id, isOpen]);

  const loadChunks = async () => {
    if (!document) return;

    setIsLoadingChunks(true);
    try {
      const { chunks: loadedChunks } = await getDocumentChunks(document.id);
      setChunks(loadedChunks);
    } catch (err) {
      console.error('Failed to load chunks:', err);
      setChunks([]);
    } finally {
      setIsLoadingChunks(false);
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      window.document.addEventListener('keydown', handleKeyDown);
      window.document.body.style.overflow = 'hidden';
    }
    return () => {
      window.document.removeEventListener('keydown', handleKeyDown);
      window.document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!document) return null;

  const createdDate = new Date(document.created_at);
  const processedDate = document.processed_at ? new Date(document.processed_at) : null;
  const status = statusLabels[document.processing_status] || statusLabels.pending;

  // Paginated chunks
  const totalChunkPages = Math.ceil(chunks.length / chunksPerPage);
  const displayedChunks = chunks.slice(
    currentChunkPage * chunksPerPage,
    (currentChunkPage + 1) * chunksPerPage
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed top-0 right-0 bottom-0 w-full md:w-[500px] lg:w-[600px] z-50 glass border-l border-glass-border flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-glass-border">
              <div className="flex-1 min-w-0 mr-4">
                <h2 className="text-lg font-semibold text-foreground truncate">
                  {document.name || document.filename}
                </h2>
                <p className="text-sm text-foreground-muted mt-0.5">
                  {getFileTypeLabel(document.mime_type)} &bull; {formatFileSize(document.size_bytes)}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-background-tertiary transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-glass-border">
              {(['overview', 'chunks', 'text'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`
                    flex-1 px-4 py-3 text-sm font-medium transition-colors
                    ${activeTab === tab
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-foreground-muted hover:text-foreground'
                    }
                  `}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Status Card */}
                  <div className="p-4 rounded-lg bg-background-tertiary">
                    <h3 className="text-sm font-medium text-foreground-muted mb-3">Processing Status</h3>
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-semibold ${status.color}`}>
                        {status.label}
                      </span>
                      {document.processing_status === 'completed' && (
                        <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    {document.processing_error && (
                      <p className="mt-2 text-sm text-red-400">{document.processing_error}</p>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground-muted">Details</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-foreground-muted">File Type</p>
                        <p className="text-foreground">{getFileTypeLabel(document.mime_type)}</p>
                      </div>
                      <div>
                        <p className="text-foreground-muted">Size</p>
                        <p className="text-foreground">{formatFileSize(document.size_bytes)}</p>
                      </div>
                      <div>
                        <p className="text-foreground-muted">Uploaded</p>
                        <p className="text-foreground">
                          {createdDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-foreground-muted">Processed</p>
                        <p className="text-foreground">
                          {processedDate
                            ? processedDate.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Not yet'
                          }
                        </p>
                      </div>
                      <div>
                        <p className="text-foreground-muted">Chunks</p>
                        <p className="text-foreground">{chunks.length}</p>
                      </div>
                      <div>
                        <p className="text-foreground-muted">Source</p>
                        <p className="text-foreground capitalize">{document.source}</p>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {document.description && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-foreground-muted">Description</h3>
                      <p className="text-sm text-foreground">{document.description}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Chunks Tab */}
              {activeTab === 'chunks' && (
                <div className="space-y-4">
                  {isLoadingChunks ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="p-4 rounded-lg bg-background-tertiary animate-pulse">
                          <div className="h-4 bg-background rounded w-1/4 mb-2" />
                          <div className="h-3 bg-background rounded w-full mb-1" />
                          <div className="h-3 bg-background rounded w-3/4" />
                        </div>
                      ))}
                    </div>
                  ) : chunks.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-foreground-muted">No chunks available</p>
                      <p className="text-sm text-foreground-muted mt-1">
                        Document may not be processed yet
                      </p>
                    </div>
                  ) : (
                    <>
                      {displayedChunks.map((chunk, index) => (
                        <motion.div
                          key={chunk.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="p-4 rounded-lg bg-background-tertiary"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-primary">
                              Chunk {chunk.chunkIndex + 1}
                            </span>
                            <span className="text-xs text-foreground-muted">
                              {chunk.tokenCount} tokens
                            </span>
                          </div>
                          <p className="text-sm text-foreground line-clamp-4">
                            {chunk.content}
                          </p>
                          {chunk.pageNumber && (
                            <p className="mt-2 text-xs text-foreground-muted">
                              Page {chunk.pageNumber}
                            </p>
                          )}
                        </motion.div>
                      ))}

                      {/* Pagination */}
                      {totalChunkPages > 1 && (
                        <div className="flex items-center justify-between pt-4">
                          <button
                            onClick={() => setCurrentChunkPage((p) => Math.max(0, p - 1))}
                            disabled={currentChunkPage === 0}
                            className="px-3 py-1.5 text-sm rounded-lg bg-background-tertiary text-foreground-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Previous
                          </button>
                          <span className="text-sm text-foreground-muted">
                            Page {currentChunkPage + 1} of {totalChunkPages}
                          </span>
                          <button
                            onClick={() => setCurrentChunkPage((p) => Math.min(totalChunkPages - 1, p + 1))}
                            disabled={currentChunkPage >= totalChunkPages - 1}
                            className="px-3 py-1.5 text-sm rounded-lg bg-background-tertiary text-foreground-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Text Tab */}
              {activeTab === 'text' && (
                <div className="space-y-4">
                  {document.extracted_text ? (
                    <div className="p-4 rounded-lg bg-background-tertiary max-h-[60vh] overflow-auto">
                      <pre className="text-sm text-foreground whitespace-pre-wrap font-mono">
                        {document.extracted_text}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-foreground-muted">No extracted text available</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-glass-border">
              <div className="flex items-center gap-2">
                {onReprocess && (
                  <button
                    onClick={onReprocess}
                    className="px-3 py-1.5 text-sm rounded-lg bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
                  >
                    Reprocess
                  </button>
                )}
                {onReviewFacts && document?.processing_status === 'completed' && (
                  <button
                    onClick={onReviewFacts}
                    className="px-3 py-1.5 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    Review Facts
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="px-3 py-1.5 text-sm rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default DocumentDetail;
