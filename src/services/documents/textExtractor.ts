/**
 * Plain Text and Markdown Extractor
 *
 * Handles plain text (.txt) and Markdown (.md) files with passthrough extraction.
 */

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
 * Text/Markdown Extractor implementation (passthrough)
 */
class TextExtractor implements DocumentExtractor {
  readonly supportedFormats: DocumentFormat[] = ['txt', 'md'];
  readonly supportedMimeTypes: string[] = [
    'text/plain',
    'text/markdown',
    'text/x-markdown',
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
      // Get text content
      let text: string;
      let fileName: string | undefined;
      let fileSize: number | undefined;

      if (typeof input === 'string') {
        // It's a file path
        const buffer = await fs.readFile(input);
        text = buffer.toString('utf-8');
        fileName = input.split('/').pop();
        const stats = await fs.stat(input);
        fileSize = stats.size;
      } else {
        // It's a buffer
        text = input.toString('utf-8');
        fileSize = input.length;
      }

      // Handle BOM (Byte Order Mark) if present
      if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
      }

      // Check for empty document
      if (!text || text.trim().length === 0) {
        return {
          success: true,
          document: {
            text: '',
            metadata: {
              wordCount: 0,
              charCount: 0,
              fileName,
              fileSize,
            },
            pages: [],
            format: this.detectFormat(fileName),
            extractedAt: new Date(),
            extractionDurationMs: Date.now() - startTime,
            warnings: ['Document is empty.'],
          },
        };
      }

      // Truncate if needed
      if (text.length > opts.maxTextLength) {
        text = text.slice(0, opts.maxTextLength);
        warnings.push(`Text truncated to ${opts.maxTextLength} characters.`);
      }

      // Extract title from markdown if present (first # heading)
      let title: string | undefined;
      const format = this.detectFormat(fileName);
      if (format === 'md') {
        const titleMatch = text.match(/^#\s+(.+)$/m);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].trim();
        }
      }

      // Build metadata
      const metadata: DocumentMetadata = {
        title,
        wordCount: countWords(text),
        charCount: text.length,
        fileName,
        fileSize,
      };

      const document: ExtractedDocument = {
        text,
        metadata,
        pages: [], // Plain text doesn't have pages
        format,
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

      if (message?.includes('ENOENT')) {
        return {
          success: false,
          error: 'File not found',
          errorCode: 'CORRUPTED_FILE',
        };
      }

      return {
        success: false,
        error: `Text extraction failed: ${message}`,
        errorCode: 'UNKNOWN_ERROR',
      };
    }
  }

  /**
   * Detect format from filename
   */
  private detectFormat(fileName?: string): DocumentFormat {
    if (!fileName) return 'txt';
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
      return 'md';
    }
    return 'txt';
  }
}

// Singleton instance
export const textExtractor = new TextExtractor();
