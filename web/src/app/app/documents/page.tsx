'use client';

import { useState, useEffect, useCallback } from 'react';
import type { StoredDocument } from '@/lib/api/documents';
import { listDocuments, deleteDocument } from '@/lib/api/documents';
import { DocumentList } from '@/components/documents/DocumentList';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { DocumentDetail } from '@/components/documents/DocumentDetail';
import { DocumentSearch } from '@/components/documents/DocumentSearch';
import { FactReviewPanel } from '@/components/documents/FactReviewPanel';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<StoredDocument | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [activeTab, setActiveTab] = useState<'library' | 'search'>('library');
  const [reviewDocument, setReviewDocument] = useState<StoredDocument | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const options: { processingStatus?: 'completed' | 'pending' | 'failed' } = {};
      if (filterStatus !== 'all') {
        options.processingStatus = filterStatus;
      }

      const { documents: docs } = await listDocuments({
        ...options,
        limit: 100,
      });
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents:', err);
      setError('Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleUploadSuccess = () => {
    // Reload documents after successful upload
    loadDocuments();
  };

  const handleDelete = async (document: StoredDocument) => {
    if (!confirm(`Delete "${document.name || document.filename}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteDocument(document.id);
      setDocuments((prev) => prev.filter((d) => d.id !== document.id));
      if (selectedDocument?.id === document.id) {
        setSelectedDocument(null);
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
      alert('Failed to delete document');
    }
  };

  const handleSelect = (document: StoredDocument) => {
    setSelectedDocument(document);
  };

  const handleCloseDetail = () => {
    setSelectedDocument(null);
  };

  const handleOpenReview = (document: StoredDocument) => {
    setReviewDocument(document);
  };

  const handleCloseReview = () => {
    setReviewDocument(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documents</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Upload and search your documents with AI-powered indexing
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-background-tertiary rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-background text-foreground'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
              title="List view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'grid'
                  ? 'bg-background text-foreground'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
              title="Grid view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>

          {/* Upload Button */}
          <button
            onClick={() => setUploadOpen(true)}
            className="
              inline-flex items-center gap-2 px-4 py-2 rounded-lg
              bg-primary text-white
              hover:bg-primary/90 transition-colors
            "
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-4 mb-6 border-b border-glass-border">
        <button
          onClick={() => setActiveTab('library')}
          className={`
            px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
            ${activeTab === 'library'
              ? 'text-primary border-primary'
              : 'text-foreground-muted border-transparent hover:text-foreground'
            }
          `}
        >
          Library
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`
            px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
            ${activeTab === 'search'
              ? 'text-primary border-primary'
              : 'text-foreground-muted border-transparent hover:text-foreground'
            }
          `}
        >
          Search
        </button>
      </div>

      {/* Filters (Library tab only) */}
      {activeTab === 'library' && (
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm text-foreground-muted">Filter:</span>
          {(['all', 'completed', 'pending', 'failed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`
                px-3 py-1.5 rounded-lg text-sm transition-colors
                ${filterStatus === status
                  ? 'bg-primary text-white'
                  : 'bg-background-tertiary text-foreground-muted hover:text-foreground'
                }
              `}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
          {error}
          <button
            onClick={loadDocuments}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {activeTab === 'library' ? (
        <DocumentList
          documents={documents}
          isLoading={isLoading}
          onSelect={handleSelect}
          onDelete={handleDelete}
          selectedId={selectedDocument?.id}
          viewMode={viewMode}
        />
      ) : (
        <DocumentSearch />
      )}

      {/* Upload modal */}
      <DocumentUpload
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      {/* Document detail panel */}
      <DocumentDetail
        document={selectedDocument}
        isOpen={!!selectedDocument}
        onClose={handleCloseDetail}
        onDelete={selectedDocument ? () => handleDelete(selectedDocument) : undefined}
        onReviewFacts={selectedDocument ? () => handleOpenReview(selectedDocument) : undefined}
      />

      {/* Fact review panel */}
      <FactReviewPanel
        document={reviewDocument}
        isOpen={!!reviewDocument}
        onClose={handleCloseReview}
      />
    </div>
  );
}
