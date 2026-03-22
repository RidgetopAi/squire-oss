'use client';

import { useState, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { ExtractedFact, FactType, FactStatus } from '@/lib/types';
import { FactTypeLabels } from '@/lib/types';
import { FactReviewCard } from './FactReviewCard';

interface FactReviewListProps {
  facts: ExtractedFact[];
  isLoading?: boolean;
  onApprove: (factId: string) => Promise<void>;
  onReject: (factId: string) => Promise<void>;
  onEdit: (factId: string, content: string) => Promise<void>;
  onBulkApprove: (factIds: string[]) => Promise<void>;
  onBulkReject: (factIds: string[]) => Promise<void>;
}

type SortOption = 'confidence-desc' | 'confidence-asc' | 'type' | 'date';
type FilterType = 'all' | FactType;

export function FactReviewList({
  facts,
  isLoading,
  onApprove,
  onReject,
  onEdit,
  onBulkApprove,
  onBulkReject,
}: FactReviewListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('confidence-desc');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [isProcessing, setIsProcessing] = useState(false);

  // Filter and sort facts
  const processedFacts = useMemo(() => {
    let result = [...facts];

    // Filter by type
    if (filterType !== 'all') {
      result = result.filter((f) => f.factType === filterType);
    }

    // Sort
    switch (sortBy) {
      case 'confidence-desc':
        result.sort((a, b) => b.confidence - a.confidence);
        break;
      case 'confidence-asc':
        result.sort((a, b) => a.confidence - b.confidence);
        break;
      case 'type':
        result.sort((a, b) => a.factType.localeCompare(b.factType));
        break;
      case 'date':
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }

    return result;
  }, [facts, sortBy, filterType]);

  // Get unique fact types for filter
  const availableTypes = useMemo(() => {
    const types = new Set(facts.map((f) => f.factType));
    return Array.from(types).sort();
  }, [facts]);

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === processedFacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(processedFacts.map((f) => f.id)));
    }
  };

  const handleSelect = (factId: string, selected: boolean) => {
    const newSelected = new Set(selectedIds);
    if (selected) {
      newSelected.add(factId);
    } else {
      newSelected.delete(factId);
    }
    setSelectedIds(newSelected);
  };

  // Bulk action handlers
  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    try {
      await onBulkApprove(Array.from(selectedIds));
      setSelectedIds(new Set());
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    try {
      await onBulkReject(Array.from(selectedIds));
      setSelectedIds(new Set());
    } finally {
      setIsProcessing(false);
    }
  };

  // Individual action handlers
  const handleApprove = async (factId: string) => {
    setIsProcessing(true);
    try {
      await onApprove(factId);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (factId: string) => {
    setIsProcessing(true);
    try {
      await onReject(factId);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEdit = async (factId: string, content: string) => {
    setIsProcessing(true);
    try {
      await onEdit(factId, content);
    } finally {
      setIsProcessing(false);
    }
  };

  // Pending facts count
  const pendingCount = facts.filter((f) => f.status === 'pending').length;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="p-4 rounded-lg bg-background-tertiary animate-pulse">
            <div className="h-4 bg-background rounded w-1/4 mb-3" />
            <div className="h-3 bg-background rounded w-full mb-2" />
            <div className="h-3 bg-background rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (facts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-background-tertiary flex items-center justify-center">
          <svg className="w-8 h-8 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-foreground-muted">No facts extracted yet</p>
        <p className="text-sm text-foreground-muted mt-1">
          Extract facts from document chunks to review them here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-foreground-muted">
            {pendingCount} pending &bull; {facts.length} total
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Type filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
            className="px-3 py-1.5 text-sm rounded-lg bg-background-tertiary border border-glass-border text-foreground focus:outline-none focus:border-primary"
          >
            <option value="all">All Types</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {FactTypeLabels[type]}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-1.5 text-sm rounded-lg bg-background-tertiary border border-glass-border text-foreground focus:outline-none focus:border-primary"
          >
            <option value="confidence-desc">Highest Confidence</option>
            <option value="confidence-asc">Lowest Confidence</option>
            <option value="type">By Type</option>
            <option value="date">Most Recent</option>
          </select>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedIds.size === processedFacts.length}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded border-glass-border bg-background text-primary focus:ring-primary"
            />
            <span className="text-sm text-foreground">
              {selectedIds.size} selected
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleBulkReject}
              disabled={isProcessing}
              className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              Reject All
            </button>
            <button
              onClick={handleBulkApprove}
              disabled={isProcessing}
              className="px-3 py-1.5 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
            >
              Approve All
            </button>
          </div>
        </div>
      )}

      {/* Select all toggle (when nothing selected) */}
      {selectedIds.size === 0 && processedFacts.length > 0 && (
        <div className="flex items-center gap-2 px-4">
          <input
            type="checkbox"
            checked={false}
            onChange={handleSelectAll}
            className="w-4 h-4 rounded border-glass-border bg-background text-primary focus:ring-primary"
          />
          <span className="text-xs text-foreground-muted">Select all</span>
        </div>
      )}

      {/* Facts list */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {processedFacts.map((fact) => (
            <FactReviewCard
              key={fact.id}
              fact={fact}
              isSelected={selectedIds.has(fact.id)}
              onSelect={(selected) => handleSelect(fact.id, selected)}
              onApprove={() => handleApprove(fact.id)}
              onReject={() => handleReject(fact.id)}
              onEdit={(content) => handleEdit(fact.id, content)}
              disabled={isProcessing}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Empty state for filtered results */}
      {processedFacts.length === 0 && facts.length > 0 && (
        <div className="text-center py-8">
          <p className="text-foreground-muted">No facts match the current filter</p>
          <button
            onClick={() => setFilterType('all')}
            className="mt-2 text-sm text-primary hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}
    </div>
  );
}

export default FactReviewList;
