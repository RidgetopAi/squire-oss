'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ExtractedDocument, DocumentProcessingStatus } from '@/lib/types';
import {
  extractDocument,
  chunkDocument,
  generateChunkEmbeddings,
  SUPPORTED_EXTENSIONS,
  getFileTypeLabel,
  formatFileSize,
} from '@/lib/api/documents';

interface DocumentUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: UploadResult) => void;
  /** If true, only extract without chunking/embedding */
  ephemeralMode?: boolean;
}

interface UploadResult {
  objectId: string;
  filename: string;
  extraction: ExtractedDocument;
  chunksCreated?: number;
  embeddingsGenerated?: number;
}

interface FileWithPreview {
  file: File;
  preview?: string;
}

const processingSteps = [
  { key: 'extracting', label: 'Extracting text...' },
  { key: 'chunking', label: 'Creating chunks...' },
  { key: 'embedding', label: 'Generating embeddings...' },
  { key: 'completed', label: 'Complete!' },
] as const;

export function DocumentUpload({
  isOpen,
  onClose,
  onSuccess,
  ephemeralMode = false,
}: DocumentUploadProps) {
  const [selectedFile, setSelectedFile] = useState<FileWithPreview | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [status, setStatus] = useState<DocumentProcessingStatus>('pending');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setStatus('pending');
    setError(null);
    setProgress('');
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const validateFile = (file: File): boolean => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      setError(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
      return false;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB');
      return false;
    }
    return true;
  };

  const handleFileSelect = useCallback((file: File) => {
    setError(null);
    if (!validateFile(file)) return;

    const preview = file.type.startsWith('image/')
      ? URL.createObjectURL(file)
      : undefined;

    setSelectedFile({ file, preview });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleUpload = async () => {
    if (!selectedFile) return;

    setError(null);
    setStatus('extracting');
    setProgress('Extracting text from document...');

    try {
      // Step 1: Extract text
      const { objectId, extraction } = await extractDocument(selectedFile.file);

      if (ephemeralMode) {
        // Skip chunking/embedding for ephemeral mode
        setStatus('completed');
        setProgress('Extraction complete!');
        onSuccess?.({
          objectId,
          filename: selectedFile.file.name,
          extraction,
        });
        setTimeout(handleClose, 1500);
        return;
      }

      // Step 2: Create chunks
      setStatus('chunking');
      setProgress('Creating document chunks...');
      const { chunks } = await chunkDocument(objectId, {
        strategy: 'hybrid',
        maxTokens: 512,
        overlapTokens: 50,
      });

      // Step 3: Generate embeddings
      setStatus('embedding');
      setProgress('Generating embeddings...');
      const { embedded } = await generateChunkEmbeddings(objectId);

      // Done!
      setStatus('completed');
      setProgress('Document processed successfully!');

      onSuccess?.({
        objectId,
        filename: selectedFile.file.name,
        extraction,
        chunksCreated: chunks.length,
        embeddingsGenerated: embedded,
      });

      setTimeout(handleClose, 1500);
    } catch (err) {
      setStatus('failed');
      setError(err instanceof Error ? err.message : 'Upload failed');
      setProgress('');
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'extracting':
      case 'chunking':
      case 'embedding':
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full"
          />
        );
      case 'completed':
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      default:
        return null;
    }
  };

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
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-[calc(env(safe-area-inset-top)+1.5rem)] right-[calc(env(safe-area-inset-right)+1.5rem)] bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] left-[calc(env(safe-area-inset-left)+1.5rem)] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-xl md:w-full md:max-h-[85vh] z-50 glass rounded-xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-glass-border">
              <h2 className="text-lg font-semibold text-foreground">
                {ephemeralMode ? 'Process Document' : 'Upload Document'}
              </h2>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-background-tertiary transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {/* Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                  transition-all duration-200
                  ${isDragOver
                    ? 'border-primary bg-primary/10'
                    : 'border-glass-border hover:border-primary/50 hover:bg-background-tertiary'
                  }
                  ${selectedFile ? 'bg-background-tertiary' : ''}
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={SUPPORTED_EXTENSIONS.join(',')}
                  onChange={handleInputChange}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="space-y-3">
                    {/* File Preview */}
                    {selectedFile.preview ? (
                      <div className="w-20 h-20 mx-auto rounded-lg overflow-hidden bg-background">
                        <img
                          src={selectedFile.preview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 mx-auto rounded-lg bg-background flex items-center justify-center">
                        <svg className="w-10 h-10 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    )}

                    {/* File Info */}
                    <div>
                      <p className="font-medium text-foreground truncate max-w-xs mx-auto">
                        {selectedFile.file.name}
                      </p>
                      <p className="text-sm text-foreground-muted">
                        {getFileTypeLabel(selectedFile.file.type)} &bull; {formatFileSize(selectedFile.file.size)}
                      </p>
                    </div>

                    {/* Change File Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        resetState();
                      }}
                      className="text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      Choose different file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-16 h-16 mx-auto rounded-xl bg-background flex items-center justify-center">
                      <svg className="w-8 h-8 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-foreground font-medium">
                        Drop file here or click to browse
                      </p>
                      <p className="text-sm text-foreground-muted mt-1">
                        PDF, Word, Text, Markdown, CSV, or Images (max 50MB)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Processing Status */}
              {status !== 'pending' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  {/* Progress Steps */}
                  {!ephemeralMode && (
                    <div className="flex items-center justify-between gap-2">
                      {processingSteps.map((step, index) => {
                        const stepIndex = processingSteps.findIndex((s) => s.key === status);
                        const isActive = step.key === status;
                        const isCompleted = index < stepIndex || status === 'completed';

                        return (
                          <div
                            key={step.key}
                            className={`
                              flex-1 h-1 rounded-full transition-colors
                              ${isCompleted ? 'bg-green-500' : isActive ? 'bg-primary' : 'bg-background-tertiary'}
                            `}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Status Message */}
                  <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-background-tertiary">
                    {getStatusIcon()}
                    <span className="text-sm text-foreground">{progress}</span>
                  </div>
                </motion.div>
              )}

              {/* Error Message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                >
                  {error}
                </motion.div>
              )}

              {/* Info Text */}
              {!ephemeralMode && status === 'pending' && (
                <p className="text-xs text-foreground-muted text-center">
                  Documents will be stored, chunked, and indexed for semantic search
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-glass-border">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-sm text-foreground-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || status !== 'pending'}
                className="
                  px-4 py-2 rounded-lg text-sm
                  bg-primary text-white
                  hover:bg-primary/90 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {ephemeralMode ? 'Process' : 'Upload & Process'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default DocumentUpload;
