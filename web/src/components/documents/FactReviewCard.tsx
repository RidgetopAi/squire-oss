'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ExtractedFact } from '@/lib/types';
import { FactTypeLabels, FactStatusColors } from '@/lib/types';

interface FactReviewCardProps {
  fact: ExtractedFact;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onEdit?: (content: string) => void;
  disabled?: boolean;
}

const typeIcons: Record<string, string> = {
  biographical: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  event: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  relationship: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  preference: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  statement: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  date: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  location: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
  organization: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
};

export function FactReviewCard({
  fact,
  isSelected,
  onSelect,
  onApprove,
  onReject,
  onEdit,
  disabled,
}: FactReviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(fact.content);

  const confidenceColor =
    fact.confidence >= 0.8
      ? 'bg-green-500/20 text-green-400'
      : fact.confidence >= 0.6
        ? 'bg-yellow-500/20 text-yellow-400'
        : 'bg-red-500/20 text-red-400';

  const handleSaveEdit = () => {
    if (onEdit && editedContent !== fact.content) {
      onEdit(editedContent);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedContent(fact.content);
    setIsEditing(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`
        relative p-4 rounded-lg border transition-all
        ${isSelected
          ? 'border-primary bg-primary/5'
          : 'border-glass-border bg-background-tertiary hover:border-primary/50'
        }
        ${disabled ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      {/* Selection checkbox */}
      {onSelect && (
        <div className="absolute top-4 left-4">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(e.target.checked)}
            className="w-4 h-4 rounded border-glass-border bg-background text-primary focus:ring-primary focus:ring-offset-0"
          />
        </div>
      )}

      <div className={onSelect ? 'pl-8' : ''}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {/* Type icon */}
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={typeIcons[fact.factType] || typeIcons.statement} />
              </svg>
            </div>
            <div>
              <span className="text-xs font-medium text-primary">
                {FactTypeLabels[fact.factType]}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-1.5 py-0.5 rounded ${confidenceColor}`}>
                  {Math.round(fact.confidence * 100)}%
                </span>
                {fact.status !== 'pending' && (
                  <span className={`text-xs ${FactStatusColors[fact.status]}`}>
                    {fact.status.replace('_', ' ')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Expand/Collapse */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg hover:bg-background transition-colors"
          >
            <svg
              className={`w-4 h-4 text-foreground-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Content */}
        {isEditing ? (
          <div className="mb-3">
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-glass-border text-sm text-foreground resize-none focus:outline-none focus:border-primary"
              rows={3}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={handleCancelEdit}
                className="px-3 py-1 text-xs rounded-lg bg-background-tertiary text-foreground-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1 text-xs rounded-lg bg-primary text-white hover:bg-primary/90"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground mb-3">{fact.content}</p>
        )}

        {/* Expanded details */}
        {isExpanded && !isEditing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 pt-3 border-t border-glass-border"
          >
            {/* Raw text */}
            <div>
              <p className="text-xs font-medium text-foreground-muted mb-1">Source Text</p>
              <p className="text-xs text-foreground-muted bg-background rounded-lg p-2 line-clamp-3">
                "{fact.rawText}"
              </p>
            </div>

            {/* Entities */}
            {fact.entities.length > 0 && (
              <div>
                <p className="text-xs font-medium text-foreground-muted mb-1">Entities</p>
                <div className="flex flex-wrap gap-1">
                  {fact.entities.map((entity, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-400"
                    >
                      <span className="capitalize">{entity.type}:</span>
                      <span className="font-medium">{entity.name}</span>
                      {entity.role && <span className="text-blue-300">({entity.role})</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Dates */}
            {fact.dates.length > 0 && (
              <div>
                <p className="text-xs font-medium text-foreground-muted mb-1">Dates</p>
                <div className="flex flex-wrap gap-1">
                  {fact.dates.map((date, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-500/10 text-purple-400"
                    >
                      <span>{date.date}</span>
                      <span className="text-purple-300">({date.type.replace('_', ' ')})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Relationships */}
            {fact.relationships.length > 0 && (
              <div>
                <p className="text-xs font-medium text-foreground-muted mb-1">Relationships</p>
                <div className="space-y-1">
                  {fact.relationships.map((rel, i) => (
                    <p key={i} className="text-xs text-foreground-muted">
                      <span className="text-foreground">{rel.subject}</span>
                      <span className="mx-1 text-primary">{rel.predicate.replace(/_/g, ' ')}</span>
                      <span className="text-foreground">{rel.object}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Source info */}
            {(fact.sourcePage || fact.sourceSection) && (
              <div className="flex gap-4 text-xs text-foreground-muted">
                {fact.sourcePage && <span>Page {fact.sourcePage}</span>}
                {fact.sourceSection && <span>Section: {fact.sourceSection}</span>}
              </div>
            )}
          </motion.div>
        )}

        {/* Actions */}
        {fact.status === 'pending' && !isEditing && (
          <div className="flex items-center justify-between pt-3 border-t border-glass-border mt-3">
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 text-xs rounded-lg text-foreground-muted hover:text-foreground hover:bg-background transition-colors"
            >
              Edit
            </button>
            <div className="flex gap-2">
              <button
                onClick={onReject}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                Reject
              </button>
              <button
                onClick={onApprove}
                className="px-3 py-1.5 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
              >
                Approve
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default FactReviewCard;
