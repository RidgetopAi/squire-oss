/**
 * OCR Image Extractor
 *
 * Extracts text from images using Tesseract.js.
 */

import Tesseract from 'tesseract.js';
import * as fs from 'fs/promises';
import {
  DocumentExtractor,
  DocumentFormat,
  ExtractionOptions,
  ExtractionResult,
  ExtractedDocument,
  DocumentMetadata,
  DEFAULT_EXTRACTION_OPTIONS,
  countWords,
} from './types.js';

/**
 * OCR Extractor implementation using Tesseract.js
 */
class OcrExtractor implements DocumentExtractor {
  readonly supportedFormats: DocumentFormat[] = ['image'];
  readonly supportedMimeTypes: string[] = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/tiff',
    'image/bmp',
    'image/gif',
  ];

  canHandle(mimeType: string): boolean {
    return this.supportedMimeTypes.includes(mimeType.toLowerCase());
  }

  async extract(
    input: Buffer | string,
    options?: ExtractionOptions
  ): Promise<ExtractionResult> {
    const opts = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      // Prepare image for Tesseract
      let imageInput: Buffer | string;
      let fileName: string | undefined;
      let fileSize: number | undefined;

      if (typeof input === 'string') {
        imageInput = input;
        fileName = input.split('/').pop();
        const stats = await fs.stat(input);
        fileSize = stats.size;
      } else {
        imageInput = input;
        fileSize = input.length;
      }

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('OCR timeout exceeded'));
        }, opts.timeoutMs);
      });

      // Run OCR with language setting
      const ocrPromise = Tesseract.recognize(imageInput, opts.ocrLanguage, {
        logger: () => {}, // Suppress logging
      });

      // Race between OCR and timeout
      const result = await Promise.race([ocrPromise, timeoutPromise]);

      // Extract text from result
      let text = result.data.text;

      // Filter by confidence if threshold is set
      if (opts.ocrConfidenceThreshold > 0 && result.data.confidence < opts.ocrConfidenceThreshold * 100) {
        warnings.push(
          `Overall OCR confidence (${result.data.confidence.toFixed(1)}%) below threshold (${opts.ocrConfidenceThreshold * 100}%)`
        );
      }

      // Clean up text
      text = text.trim();

      // Check for empty result
      if (!text || text.length === 0) {
        return {
          success: true,
          document: {
            text: '',
            metadata: {
              wordCount: 0,
              charCount: 0,
              fileName,
              fileSize,
              extra: {
                ocrConfidence: result.data.confidence,
              },
            },
            pages: [],
            format: 'image',
            extractedAt: new Date(),
            extractionDurationMs: Date.now() - startTime,
            warnings: ['No text detected in image.'],
          },
        };
      }

      // Truncate if needed
      if (text.length > opts.maxTextLength) {
        text = text.slice(0, opts.maxTextLength);
        warnings.push(`Text truncated to ${opts.maxTextLength} characters.`);
      }

      // Build metadata
      const metadata: DocumentMetadata = {
        wordCount: countWords(text),
        charCount: text.length,
        fileName,
        fileSize,
        language: opts.ocrLanguage,
        extra: {
          ocrConfidence: result.data.confidence,
          ocrEngine: 'tesseract.js',
        },
      };

      const document: ExtractedDocument = {
        text,
        metadata,
        pages: [], // Single image = single "page"
        format: 'image',
        extractedAt: new Date(),
        extractionDurationMs: Date.now() - startTime,
        warnings,
      };

      return {
        success: true,
        document,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('timeout')) {
        return {
          success: false,
          error: 'OCR processing timed out',
          errorCode: 'EXTRACTION_TIMEOUT',
        };
      }

      if (message.includes('Invalid image') || message.includes('Could not read')) {
        return {
          success: false,
          error: 'Invalid or corrupted image file',
          errorCode: 'CORRUPTED_FILE',
        };
      }

      return {
        success: false,
        error: `OCR extraction failed: ${message}`,
        errorCode: 'OCR_FAILED',
      };
    }
  }
}

// Singleton instance
export const ocrExtractor = new OcrExtractor();
