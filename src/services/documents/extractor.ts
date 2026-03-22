/**
 * Unified Document Extractor
 *
 * Main entry point for document extraction. Routes to the appropriate
 * format-specific extractor based on MIME type or file extension.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ExtractionInput,
  ExtractionOptions,
  ExtractionResult,
  DocumentExtractor,
  isExtractableMimeType,
  EXTRACTABLE_MIME_TYPES,
} from './types.js';
import { pdfExtractor } from './pdfExtractor.js';
import { docxExtractor } from './docxExtractor.js';
import { textExtractor } from './textExtractor.js';
import { csvExtractor } from './csvExtractor.js';
import { ocrExtractor } from './ocrExtractor.js';
import { getObjectById, getObjectData } from '../objects.js';

/**
 * Registry of all available extractors
 */
const extractors: DocumentExtractor[] = [
  pdfExtractor,
  docxExtractor,
  csvExtractor, // CSV before text so it takes priority for .csv files
  textExtractor,
  ocrExtractor,
];

/**
 * Find an extractor that can handle the given MIME type
 */
function findExtractor(mimeType: string): DocumentExtractor | null {
  const lowerMime = mimeType.toLowerCase();
  for (const extractor of extractors) {
    if (extractor.canHandle(lowerMime)) {
      return extractor;
    }
  }
  return null;
}

/**
 * Detect MIME type from file extension
 */
function mimeFromExtension(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.markdown': 'text/markdown',
    '.csv': 'text/csv',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.bmp': 'image/bmp',
    '.gif': 'image/gif',
  };
  return mimeMap[ext] || null;
}

/**
 * Extract text and metadata from a document
 *
 * @param input - Document input (buffer with mime type, file path, or object ID)
 * @param options - Extraction options
 * @returns Extraction result
 *
 * @example
 * // Extract from buffer
 * const result = await extractDocument({
 *   type: 'buffer',
 *   buffer: pdfBuffer,
 *   mimeType: 'application/pdf'
 * });
 *
 * @example
 * // Extract from file path
 * const result = await extractDocument({
 *   type: 'path',
 *   filePath: '/path/to/document.pdf'
 * });
 */
export async function extractDocument(
  input: ExtractionInput,
  options?: ExtractionOptions
): Promise<ExtractionResult> {
  try {
    let buffer: Buffer | string;
    let mimeType: string;

    switch (input.type) {
      case 'buffer': {
        buffer = input.buffer;
        mimeType = input.mimeType;
        break;
      }

      case 'path': {
        // Verify file exists
        try {
          await fs.access(input.filePath);
        } catch {
          return {
            success: false,
            error: `File not found: ${input.filePath}`,
            errorCode: 'CORRUPTED_FILE',
          };
        }

        // Use provided MIME type or detect from extension
        mimeType = input.mimeType || mimeFromExtension(input.filePath) || '';
        if (!mimeType) {
          return {
            success: false,
            error: `Could not determine file type for: ${input.filePath}`,
            errorCode: 'UNSUPPORTED_FORMAT',
          };
        }

        buffer = input.filePath;
        break;
      }

      case 'objectId': {
        // Fetch object metadata from objects service
        const obj = await getObjectById(input.objectId);
        if (!obj) {
          return {
            success: false,
            error: `Object not found: ${input.objectId}`,
            errorCode: 'CORRUPTED_FILE',
          };
        }

        if (obj.status === 'deleted') {
          return {
            success: false,
            error: `Object has been deleted: ${input.objectId}`,
            errorCode: 'CORRUPTED_FILE',
          };
        }

        // Fetch file data
        const objectData = await getObjectData(input.objectId);
        if (!objectData) {
          return {
            success: false,
            error: `Could not read object data: ${input.objectId}`,
            errorCode: 'CORRUPTED_FILE',
          };
        }

        buffer = objectData;
        mimeType = obj.mime_type;
        break;
      }

      default: {
        return {
          success: false,
          error: 'Invalid extraction input type',
          errorCode: 'UNKNOWN_ERROR',
        };
      }
    }

    // Validate MIME type is extractable
    if (!isExtractableMimeType(mimeType)) {
      return {
        success: false,
        error: `Unsupported file type: ${mimeType}`,
        errorCode: 'UNSUPPORTED_FORMAT',
      };
    }

    // Find appropriate extractor
    const extractor = findExtractor(mimeType);
    if (!extractor) {
      return {
        success: false,
        error: `No extractor available for: ${mimeType}`,
        errorCode: 'UNSUPPORTED_FORMAT',
      };
    }

    // Perform extraction
    return await extractor.extract(buffer, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Extraction failed: ${message}`,
      errorCode: 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Check if a MIME type is supported for extraction
 */
export function isSupported(mimeType: string): boolean {
  return isExtractableMimeType(mimeType);
}

/**
 * Get list of all supported MIME types
 */
export function getSupportedMimeTypes(): readonly string[] {
  return EXTRACTABLE_MIME_TYPES;
}

/**
 * Quick extraction from a file path
 */
export async function extractFromFile(
  filePath: string,
  options?: ExtractionOptions
): Promise<ExtractionResult> {
  return extractDocument({ type: 'path', filePath }, options);
}

/**
 * Quick extraction from a buffer
 */
export async function extractFromBuffer(
  buffer: Buffer,
  mimeType: string,
  options?: ExtractionOptions
): Promise<ExtractionResult> {
  return extractDocument({ type: 'buffer', buffer, mimeType }, options);
}

// Types are exported from index.ts
