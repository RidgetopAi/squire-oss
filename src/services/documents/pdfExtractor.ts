/**
 * PDF Document Extractor
 *
 * Extracts text and metadata from PDF files using pdf-parse v2.
 */

import { PDFParse } from 'pdf-parse';
import * as fs from 'fs/promises';
import {
  DocumentExtractor,
  DocumentFormat,
  ExtractionOptions,
  ExtractionResult,
  ExtractedDocument,
  DocumentPage,
  DocumentMetadata,
  DEFAULT_EXTRACTION_OPTIONS,
  countWords,
} from './types.js';

/**
 * PDF Extractor implementation using pdf-parse v2
 */
class PdfExtractor implements DocumentExtractor {
  readonly supportedFormats: DocumentFormat[] = ['pdf'];
  readonly supportedMimeTypes: string[] = ['application/pdf'];

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

    let parser: PDFParse | null = null;

    try {
      // Get buffer from input
      let buffer: Buffer;
      if (typeof input === 'string') {
        buffer = await fs.readFile(input);
      } else {
        buffer = input;
      }

      // Create parser instance
      parser = new PDFParse({ data: buffer });

      // Extract text
      const textResult = await parser.getText();

      // Extract metadata
      const infoResult = await parser.getInfo();

      // Build pages array from text result
      const pages: DocumentPage[] = textResult.pages.map((page) => ({
        pageNumber: page.num,
        text: page.text,
        wordCount: countWords(page.text),
      }));

      // Get full text
      let fullText = textResult.text;

      // Check for empty document
      if (!fullText || fullText.trim().length === 0) {
        warnings.push(
          'PDF contains no extractable text. This may be a scanned document requiring OCR.'
        );
      }

      // Truncate if needed
      if (fullText.length > opts.maxTextLength) {
        fullText = fullText.slice(0, opts.maxTextLength);
        warnings.push(`Text truncated to ${opts.maxTextLength} characters.`);
      }

      // Build metadata
      const info = infoResult.info || {};
      const metadata: DocumentMetadata = {
        title: info.Title || undefined,
        author: info.Author || undefined,
        createdAt: info.CreationDate ? this.parsePdfDate(info.CreationDate) : undefined,
        modifiedAt: info.ModDate ? this.parsePdfDate(info.ModDate) : undefined,
        pageCount: textResult.total,
        wordCount: countWords(fullText),
        charCount: fullText.length,
        extra: {
          producer: info.Producer,
          creator: info.Creator,
          subject: info.Subject,
          keywords: info.Keywords,
          fingerprints: infoResult.fingerprints,
        },
      };

      // Build full text with page breaks if requested
      let finalText = fullText;
      if (opts.preservePageBreaks && pages.length > 1) {
        finalText = pages
          .map((p) => p.text)
          .join('\n\n--- Page Break ---\n\n');
      }

      const document: ExtractedDocument = {
        text: finalText,
        metadata,
        pages,
        format: 'pdf',
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

      // Detect specific error types
      if (message.includes('password') || message.includes('encrypted')) {
        return {
          success: false,
          error: 'PDF is password protected',
          errorCode: 'PASSWORD_PROTECTED',
        };
      }

      if (message.includes('Invalid PDF') || message.includes('corrupted')) {
        return {
          success: false,
          error: 'PDF file is corrupted or invalid',
          errorCode: 'CORRUPTED_FILE',
        };
      }

      return {
        success: false,
        error: `PDF extraction failed: ${message}`,
        errorCode: 'UNKNOWN_ERROR',
      };
    } finally {
      // Clean up parser
      if (parser) {
        try {
          await parser.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Parse PDF date format (D:YYYYMMDDHHmmSS+HH'mm')
   */
  private parsePdfDate(dateStr: string): Date | undefined {
    try {
      // Remove 'D:' prefix if present
      const cleaned = dateStr.replace(/^D:/, '');

      // Parse components
      const year = parseInt(cleaned.slice(0, 4), 10);
      const month = parseInt(cleaned.slice(4, 6), 10) - 1;
      const day = parseInt(cleaned.slice(6, 8), 10);
      const hour = parseInt(cleaned.slice(8, 10), 10) || 0;
      const minute = parseInt(cleaned.slice(10, 12), 10) || 0;
      const second = parseInt(cleaned.slice(12, 14), 10) || 0;

      return new Date(year, month, day, hour, minute, second);
    } catch {
      return undefined;
    }
  }
}

// Singleton instance
export const pdfExtractor = new PdfExtractor();
