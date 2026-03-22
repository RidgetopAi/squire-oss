/**
 * Document Extraction Types
 *
 * Types and interfaces for the document extraction pipeline.
 * Supports PDF, DOCX, plain text, markdown, and image OCR.
 */

// === SUPPORTED FORMATS ===

export const EXTRACTABLE_MIME_TYPES = [
  // PDF
  'application/pdf',
  // Microsoft Word
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc (limited support)
  // Plain text
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  // CSV
  'text/csv',
  'application/csv',
  'text/comma-separated-values',
  // Images (for OCR)
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
  'image/bmp',
  'image/gif',
] as const;

export type ExtractableMimeType = (typeof EXTRACTABLE_MIME_TYPES)[number];

const DOCUMENT_FORMATS = ['pdf', 'docx', 'doc', 'txt', 'md', 'image'] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

// === EXTRACTION STATUS ===

const EXTRACTION_STATUSES = ['pending', 'extracting', 'completed', 'failed'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

// === EXTRACTED DOCUMENT ===

/**
 * Metadata extracted from a document
 */
export interface DocumentMetadata {
  /** Document title if available */
  title?: string;
  /** Document author if available */
  author?: string;
  /** Document creation date if available */
  createdAt?: Date;
  /** Document modification date if available */
  modifiedAt?: Date;
  /** Number of pages (for PDF) */
  pageCount?: number;
  /** Total word count */
  wordCount: number;
  /** Total character count */
  charCount: number;
  /** Original file name */
  fileName?: string;
  /** Original file size in bytes */
  fileSize?: number;
  /** Detected language (ISO 639-1 code) */
  language?: string;
  /** Additional format-specific metadata */
  extra?: Record<string, unknown>;
}

/**
 * A single page from a multi-page document
 */
export interface DocumentPage {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Text content of the page */
  text: string;
  /** Word count for this page */
  wordCount: number;
}

/**
 * Result of extracting text from a document
 */
export interface ExtractedDocument {
  /** Full extracted text (all pages concatenated) */
  text: string;
  /** Document metadata */
  metadata: DocumentMetadata;
  /** Individual pages (for PDF, empty for other formats) */
  pages: DocumentPage[];
  /** Original format that was extracted */
  format: DocumentFormat;
  /** Extraction timestamp */
  extractedAt: Date;
  /** Extraction duration in milliseconds */
  extractionDurationMs: number;
  /** Warnings encountered during extraction */
  warnings: string[];
}

// === EXTRACTION OPTIONS ===

/**
 * Options for document extraction
 */
export interface ExtractionOptions {
  /** Maximum text length to extract (truncate if exceeded) */
  maxTextLength?: number;
  /** Whether to preserve page breaks in text */
  preservePageBreaks?: boolean;
  /** Whether to extract metadata */
  extractMetadata?: boolean;
  /** OCR language hint (ISO 639-3 code, e.g., 'eng', 'deu') */
  ocrLanguage?: string;
  /** OCR confidence threshold (0-1, only return text above this confidence) */
  ocrConfidenceThreshold?: number;
  /** Timeout for extraction in milliseconds */
  timeoutMs?: number;
}

/**
 * Default extraction options
 */
export const DEFAULT_EXTRACTION_OPTIONS: Required<ExtractionOptions> = {
  maxTextLength: 1_000_000, // 1MB of text
  preservePageBreaks: true,
  extractMetadata: true,
  ocrLanguage: 'eng',
  ocrConfidenceThreshold: 0.6,
  timeoutMs: 60_000, // 1 minute
};

// === EXTRACTION RESULT ===

/**
 * Result of an extraction attempt (success or failure)
 */
export interface ExtractionResult {
  /** Whether extraction succeeded */
  success: boolean;
  /** Extracted document (if success) */
  document?: ExtractedDocument;
  /** Error message (if failure) */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: ExtractionErrorCode;
}

const EXTRACTION_ERROR_CODES = [
  'UNSUPPORTED_FORMAT',
  'FILE_TOO_LARGE',
  'EXTRACTION_TIMEOUT',
  'CORRUPTED_FILE',
  'PASSWORD_PROTECTED',
  'OCR_FAILED',
  'EMPTY_DOCUMENT',
  'UNKNOWN_ERROR',
] as const;

export type ExtractionErrorCode = (typeof EXTRACTION_ERROR_CODES)[number];

// === EXTRACTOR INTERFACE ===

/**
 * Interface for format-specific extractors
 */
export interface DocumentExtractor {
  /** Formats this extractor supports */
  supportedFormats: DocumentFormat[];
  /** MIME types this extractor supports */
  supportedMimeTypes: string[];

  /**
   * Extract text and metadata from a document
   * @param input - File buffer or path
   * @param options - Extraction options
   * @returns Extraction result
   */
  extract(
    input: Buffer | string,
    options?: ExtractionOptions
  ): Promise<ExtractionResult>;

  /**
   * Check if this extractor can handle a given MIME type
   */
  canHandle(mimeType: string): boolean;
}

// === UTILITY TYPES ===

/**
 * Input for extraction - can be a buffer, file path, or object ID
 */
export type ExtractionInput =
  | { type: 'buffer'; buffer: Buffer; mimeType: string; fileName?: string }
  | { type: 'path'; filePath: string; mimeType?: string }
  | { type: 'objectId'; objectId: string };

// === HELPER FUNCTIONS ===

/**
 * Check if a MIME type is extractable
 */
export function isExtractableMimeType(mimeType: string): boolean {
  return (EXTRACTABLE_MIME_TYPES as readonly string[]).includes(mimeType.toLowerCase());
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}
