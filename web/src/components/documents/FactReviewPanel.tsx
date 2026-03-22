'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ExtractedFact, FactExtractionStats } from '@/lib/types';
import type { StoredDocument } from '@/lib/api/documents';
import {
  getDocumentFacts,
  getDocumentFactStats,
  extractDocumentFacts,
  updateFactStatus,
  updateFactContent,
  bulkUpdateFactStatus,
} from '@/lib/api/documents';
import { FactReviewList } from './FactReviewList';

interface FactReviewPanelProps {
  document: StoredDocument | null;
  isOpen: boolean;
  onClose: () => void;
}

export function FactReviewPanel({ document, isOpen, onClose }: FactReviewPanelProps) {
  const [facts, setFacts] = useState<ExtractedFact[]>([]);
  const [stats, setStats] = useState<FactExtractionStats | null>(null);
  const [hasBeenExtracted, setHasBeenExtracted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<{
    success: boolean;
    factsExtracted: number;
    message?: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'all' | 'approved'>('pending');

  // Load facts when document changes
  useEffect(() => {
    if (document && isOpen) {
      loadFactsAndStats();
    }
  }, [document?.id, isOpen]);

  const loadFactsAndStats = async () => {
    if (!document) return;

    setIsLoading(true);
    try {
      // Load stats first to check if extraction has been done
      const statsResult = await getDocumentFactStats(document.id);
      setHasBeenExtracted(statsResult.hasBeenExtracted);
      setStats(statsResult.stats);

      // Load facts based on active tab
      const statusFilter =
        activeTab === 'pending'
          ? 'pending'
          : activeTab === 'approved'
            ? ['approved', 'auto_approved']
            : undefined;

      const factsResult = await getDocumentFacts(document.id, {
        status: statusFilter as any,
      });
      setFacts(factsResult.facts);
    } catch (err) {
      console.error('Failed to load facts:', err);
      setFacts([]);
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Reload facts when tab changes
  useEffect(() => {
    if (document && isOpen && hasBeenExtracted) {
      loadFactsAndStats();
    }
  }, [activeTab]);

  const handleExtract = async () => {
    if (!document) return;

    setIsExtracting(true);
    setExtractionResult(null);
    try {
      const result = await extractDocumentFacts(document.id);
      setExtractionResult({
        success: result.success,
        factsExtracted: result.factsExtracted,
        message: result.success
          ? `Extracted ${result.factsExtracted} facts from ${result.chunksProcessed} chunks`
          : 'Extraction failed',
      });
      // Reload facts after extraction
      await loadFactsAndStats();
    } catch (err) {
      setExtractionResult({
        success: false,
        factsExtracted: 0,
        message: err instanceof Error ? err.message : 'Extraction failed',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleApprove = async (factId: string) => {
    await updateFactStatus(factId, 'approved');
    await loadFactsAndStats();
  };

  const handleReject = async (factId: string) => {
    await updateFactStatus(factId, 'rejected');
    await loadFactsAndStats();
  };

  const handleEdit = async (factId: string, content: string) => {
    await updateFactContent(factId, content);
    await loadFactsAndStats();
  };

  const handleBulkApprove = async (factIds: string[]) => {
    await bulkUpdateFactStatus(factIds, 'approved');
    await loadFactsAndStats();
  };

  const handleBulkReject = async (factIds: string[]) => {
    await bulkUpdateFactStatus(factIds, 'rejected');
    await loadFactsAndStats();
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
            className="fixed top-0 right-0 bottom-0 w-full md:w-[600px] lg:w-[700px] z-50 glass border-l border-glass-border flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-glass-border">
              <div className="flex-1 min-w-0 mr-4">
                <h2 className="text-lg font-semibold text-foreground">Fact Review</h2>
                <p className="text-sm text-foreground-muted mt-0.5 truncate">
                  {document.name || document.filename}
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

            {/* Stats bar */}
            {stats && hasBeenExtracted && (
              <div className="px-6 py-3 border-b border-glass-border bg-background-tertiary/50">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex gap-4">
                    <span className="text-yellow-400">
                      {stats.byStatus.pending ?? 0} pending
                    </span>
                    <span className="text-green-400">
                      {(stats.byStatus.approved ?? 0) + (stats.byStatus.auto_approved ?? 0)} approved
                    </span>
                    <span className="text-red-400">
                      {stats.byStatus.rejected ?? 0} rejected
                    </span>
                  </div>
                  <span className="text-foreground-muted">
                    {stats.total} total facts
                  </span>
                </div>
              </div>
            )}

            {/* Tabs */}
            {hasBeenExtracted && (
              <div className="flex border-b border-glass-border">
                {(['pending', 'all', 'approved'] as const).map((tab) => (
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
                    {tab === 'pending' ? 'Pending Review' : tab === 'all' ? 'All Facts' : 'Approved'}
                  </button>
                ))}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {!hasBeenExtracted ? (
                // Not yet extracted - show extraction UI
                <div className="text-center py-12">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Extract Facts from Document
                  </h3>
                  <p className="text-sm text-foreground-muted mb-6 max-w-md mx-auto">
                    Use AI to extract facts, entities, dates, and relationships from this document.
                    You'll be able to review and approve them before they become memories.
                  </p>

                  {extractionResult && (
                    <div
                      className={`mb-6 px-4 py-3 rounded-lg text-sm ${
                        extractionResult.success
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {extractionResult.message}
                    </div>
                  )}

                  <button
                    onClick={handleExtract}
                    disabled={isExtracting}
                    className="px-6 py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isExtracting ? (
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Extracting...
                      </span>
                    ) : (
                      'Extract Facts'
                    )}
                  </button>
                </div>
              ) : (
                // Facts list
                <FactReviewList
                  facts={facts}
                  isLoading={isLoading}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onEdit={handleEdit}
                  onBulkApprove={handleBulkApprove}
                  onBulkReject={handleBulkReject}
                />
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-glass-border">
              <div>
                {hasBeenExtracted && (
                  <button
                    onClick={handleExtract}
                    disabled={isExtracting}
                    className="px-3 py-1.5 text-sm rounded-lg bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
                  >
                    {isExtracting ? 'Re-extracting...' : 'Re-extract Facts'}
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

export default FactReviewPanel;
