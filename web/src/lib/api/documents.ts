/**
 * Document Intelligence API Client
 * Handles file uploads, extraction, chunking, and search operations
 */

import type {
  ExtractedDocument,
  DocumentChunk,
  DocumentSearchResult,
  ChunkingOptions,
} from '@/lib/types';

const API_BASE = '/api/documents';

/**
 * Upload and extract text from a document file
 */
export async function extractDocument(
  file: File,
  options?: {
    maxTextLength?: number;
    preservePageBreaks?: boolean;
    ocrLanguage?: string;
  }
): Promise<{ objectId: string; extraction: ExtractedDocument }> {
  const formData = new FormData();
  formData.append('file', file);

  const params = new URLSearchParams();
  if (options?.maxTextLength) params.set('maxTextLength', String(options.maxTextLength));
  if (options?.preservePageBreaks) params.set('preservePageBreaks', 'true');
  if (options?.ocrLanguage) params.set('ocrLanguage', options.ocrLanguage);

  const url = `${API_BASE}/extract${params.toString() ? `?${params.toString()}` : ''}`;

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Failed to extract document');
  }

  return response.json();
}


/**
 * Chunk a document by object ID
 */
export async function chunkDocument(
  objectId: string,
  options?: ChunkingOptions
): Promise<{ chunks: DocumentChunk[]; totalTokens: number }> {
  const response = await fetch(`${API_BASE}/${objectId}/chunk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Chunking failed' }));
    throw new Error(error.error || 'Failed to chunk document');
  }

  return response.json();
}

/**
 * Get chunks for a document
 */
export async function getDocumentChunks(objectId: string): Promise<{ chunks: DocumentChunk[] }> {
  const response = await fetch(`${API_BASE}/${objectId}/chunks`);
  if (!response.ok) throw new Error('Failed to get chunks');
  return response.json();
}


/**
 * Generate embeddings for document chunks
 */
export async function generateChunkEmbeddings(
  objectId: string
): Promise<{ embedded: number; failed: number }> {
  const response = await fetch(`${API_BASE}/${objectId}/chunks/embed`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to generate embeddings');
  return response.json();
}

/**
 * Semantic search across documents
 */
export async function searchDocuments(
  query: string,
  options?: {
    limit?: number;
    threshold?: number;
    objectIds?: string[];
  }
): Promise<{ results: DocumentSearchResult[] }> {
  const params = new URLSearchParams({ query });
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.threshold) params.set('threshold', String(options.threshold));
  if (options?.objectIds) params.set('objectIds', options.objectIds.join(','));

  const response = await fetch(`${API_BASE}/search?${params.toString()}`);
  if (!response.ok) throw new Error('Search failed');
  return response.json();
}


/**
 * File type helpers
 */
export const SUPPORTED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.doc',
  '.txt',
  '.md',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.tiff',
  '.bmp',
  '.gif',
];

const MIME_TYPE_MAP: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/msword': 'Word',
  'text/plain': 'Text',
  'text/markdown': 'Markdown',
  'text/x-markdown': 'Markdown',
  'text/csv': 'CSV',
  'application/csv': 'CSV',
  'image/png': 'Image (PNG)',
  'image/jpeg': 'Image (JPEG)',
  'image/jpg': 'Image (JPEG)',
  'image/webp': 'Image (WebP)',
  'image/tiff': 'Image (TIFF)',
  'image/bmp': 'Image (BMP)',
  'image/gif': 'Image (GIF)',
};

export function getFileTypeLabel(mimeType: string): string {
  return MIME_TYPE_MAP[mimeType] || 'Unknown';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================
// Document Library API (uses Objects endpoints)
// ============================================

export interface StoredDocument {
  id: string;
  name: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  object_type: 'document';
  extracted_text: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  processing_error: string | null;
  processed_at: string | null;
  thumbnail_path: string | null;
  source: 'upload' | 'import' | 'extract' | 'generate';
  status: 'active' | 'archived' | 'deleted';
  created_at: string;
  updated_at: string;
  // Chunk stats (if available)
  chunk_count?: number;
  has_embeddings?: boolean;
}

export interface DocumentListOptions {
  status?: 'active' | 'archived' | 'deleted';
  processingStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  tag?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * List stored documents (filtered objects of type 'document')
 */
export async function listDocuments(
  options: DocumentListOptions = {}
): Promise<{ documents: StoredDocument[]; count: number }> {
  const params = new URLSearchParams({ type: 'document' });

  if (options.status) params.set('status', options.status);
  if (options.processingStatus) params.set('processingStatus', options.processingStatus);
  if (options.tag) params.set('tag', options.tag);
  if (options.search) params.set('search', options.search);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));

  const response = await fetch(`/api/objects?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to list documents');

  const data = await response.json();
  return {
    documents: data.objects as StoredDocument[],
    count: data.count,
  };
}

/**
 * Get a single document by ID
 */
export async function getDocument(id: string): Promise<StoredDocument> {
  const response = await fetch(`/api/objects/${id}`);
  if (!response.ok) throw new Error('Failed to get document');
  return response.json();
}

/**
 * Delete a document (soft delete - sets status to 'deleted')
 */
export async function deleteDocument(id: string): Promise<void> {
  const response = await fetch(`/api/objects/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete document');
}


// ============================================
// Fact Extraction API (Phase 6)
// ============================================

import type {
  ExtractedFact,
  FactStatus,
  FactType,
  FactExtractionStats,
  FactExtractionOptions,
} from '@/lib/types';

/**
 * Extract facts from a document
 */
export async function extractDocumentFacts(
  objectId: string,
  options?: FactExtractionOptions
): Promise<{
  success: boolean;
  batchId: string;
  objectId: string;
  chunksProcessed: number;
  factsExtracted: number;
  factsAutoApproved: number;
  totalDurationMs: number;
  errors?: string[];
}> {
  const response = await fetch(`${API_BASE}/${objectId}/extract-facts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Extraction failed' }));
    throw new Error(error.error || 'Failed to extract facts');
  }

  return response.json();
}

/**
 * Get extracted facts for a document
 */
export async function getDocumentFacts(
  objectId: string,
  options?: {
    status?: FactStatus | FactStatus[];
    factType?: FactType | FactType[];
    minConfidence?: number;
    limit?: number;
    offset?: number;
  }
): Promise<{ facts: ExtractedFact[]; count: number }> {
  const params = new URLSearchParams();

  if (options?.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    params.set('status', statuses.join(','));
  }
  if (options?.factType) {
    const types = Array.isArray(options.factType) ? options.factType : [options.factType];
    params.set('factType', types.join(','));
  }
  if (options?.minConfidence) params.set('minConfidence', String(options.minConfidence));
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const url = `${API_BASE}/${objectId}/facts${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url);

  if (!response.ok) throw new Error('Failed to get facts');
  return response.json();
}

/**
 * Get fact extraction statistics for a document
 */
export async function getDocumentFactStats(objectId: string): Promise<{
  hasBeenExtracted: boolean;
  stats: FactExtractionStats;
}> {
  const response = await fetch(`${API_BASE}/${objectId}/facts/stats`);
  if (!response.ok) throw new Error('Failed to get fact stats');
  return response.json();
}


/**
 * Update fact status (approve/reject)
 */
export async function updateFactStatus(
  factId: string,
  status: FactStatus,
  notes?: string
): Promise<ExtractedFact> {
  const response = await fetch(`${API_BASE}/facts/${factId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, notes }),
  });

  if (!response.ok) throw new Error('Failed to update fact status');
  const data = await response.json();
  return data.fact;
}

/**
 * Bulk update fact statuses
 */
export async function bulkUpdateFactStatus(
  factIds: string[],
  status: FactStatus,
  notes?: string
): Promise<{ updatedCount: number }> {
  const response = await fetch(`${API_BASE}/facts/bulk-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ factIds, status, notes }),
  });

  if (!response.ok) throw new Error('Failed to bulk update fact statuses');
  return response.json();
}

/**
 * Update fact content (edit during review)
 */
export async function updateFactContent(
  factId: string,
  content: string,
  notes?: string
): Promise<ExtractedFact> {
  const response = await fetch(`${API_BASE}/facts/${factId}/content`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, notes }),
  });

  if (!response.ok) throw new Error('Failed to update fact content');
  const data = await response.json();
  return data.fact;
}

