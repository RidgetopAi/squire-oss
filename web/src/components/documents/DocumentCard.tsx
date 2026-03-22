'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { StoredDocument } from '@/lib/api/documents';
import { getFileTypeLabel, formatFileSize } from '@/lib/api/documents';

interface DocumentCardProps {
  document: StoredDocument;
  onClick?: () => void;
  onDelete?: () => void;
  isSelected?: boolean;
}

const statusColors: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  skipped: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const typeIcons: Record<string, ReactNode> = {
  'application/pdf': (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      <text x="7" y="16" fontSize="6" fill="currentColor" fontWeight="bold">PDF</text>
    </svg>
  ),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  'text/plain': (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  'text/markdown': (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      <text x="7" y="16" fontSize="5" fill="currentColor" fontWeight="bold">MD</text>
    </svg>
  ),
  default: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
};

function getTypeIcon(mimeType: string): ReactNode {
  if (mimeType.startsWith('image/')) {
    return (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  return typeIcons[mimeType] || typeIcons.default;
}

export function DocumentCard({
  document,
  onClick,
  onDelete,
  isSelected = false,
}: DocumentCardProps) {
  const createdDate = new Date(document.created_at);
  const formattedDate = createdDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      className={`
        glass rounded-xl p-4 cursor-pointer transition-all
        ${isSelected
          ? 'ring-2 ring-primary border-primary/50'
          : 'border border-glass-border hover:border-primary/30'
        }
      `}
    >
      <div className="flex items-start gap-4">
        {/* File Icon */}
        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-background-tertiary flex items-center justify-center text-foreground-muted">
          {getTypeIcon(document.mime_type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 className="font-medium text-foreground truncate" title={document.name}>
            {document.name || document.filename}
          </h3>

          {/* Metadata Row */}
          <div className="flex items-center gap-3 mt-1 text-sm text-foreground-muted">
            <span>{getFileTypeLabel(document.mime_type)}</span>
            <span>&bull;</span>
            <span>{formatFileSize(document.size_bytes)}</span>
            <span>&bull;</span>
            <span>{formattedDate}</span>
          </div>

          {/* Status & Chunk Info */}
          <div className="flex items-center gap-2 mt-2">
            {/* Processing Status Badge */}
            <span
              className={`
                inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border
                ${statusColors[document.processing_status] || statusColors.pending}
              `}
            >
              {document.processing_status === 'completed' && (
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {document.processing_status === 'processing' && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-3 h-3 mr-1 border border-current border-t-transparent rounded-full"
                />
              )}
              {document.processing_status === 'failed' && (
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {document.processing_status.charAt(0).toUpperCase() + document.processing_status.slice(1)}
            </span>

            {/* Chunk count if available */}
            {document.chunk_count !== undefined && document.chunk_count > 0 && (
              <span className="text-xs text-foreground-muted">
                {document.chunk_count} chunks
              </span>
            )}

            {/* Embeddings indicator */}
            {document.has_embeddings && (
              <span className="text-xs text-primary" title="Has embeddings">
                <svg className="w-3.5 h-3.5 inline" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </span>
            )}
          </div>

          {/* Description Preview */}
          {document.description && (
            <p className="mt-2 text-sm text-foreground-muted line-clamp-2">
              {document.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0">
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-2 rounded-lg text-foreground-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete document"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default DocumentCard;
