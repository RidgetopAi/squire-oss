/**
 * DOCX Document Extractor
 *
 * Extracts text and metadata from Microsoft Word (.docx) files using mammoth.
 */

import mammoth from 'mammoth';
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
 * DOCX Extractor implementation using mammoth
 */
class DocxExtractor implements DocumentExtractor {
  readonly supportedFormats: DocumentFormat[] = ['docx'];
  readonly supportedMimeTypes: string[] = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
      // Prepare input for mammoth
      let mammothInput: { buffer: Buffer } | { path: string };
      if (typeof input === 'string') {
        mammothInput = { path: input };
      } else {
        mammothInput = { buffer: input };
      }

      // Extract text using mammoth
      const result = await mammoth.extractRawText(mammothInput);

      // Collect any messages as warnings
      if (result.messages && result.messages.length > 0) {
        for (const msg of result.messages) {
          warnings.push(`${msg.type}: ${msg.message}`);
        }
      }

      let text = result.value;

      // Check for empty document
      if (!text || text.trim().length === 0) {
        return {
          success: true,
          document: {
            text: '',
            metadata: {
              wordCount: 0,
              charCount: 0,
            },
            pages: [],
            format: 'docx',
            extractedAt: new Date(),
            extractionDurationMs: Date.now() - startTime,
            warnings: ['Document contains no text.'],
          },
        };
      }

      // Truncate if needed
      if (text.length > opts.maxTextLength) {
        text = text.slice(0, opts.maxTextLength);
        warnings.push(`Text truncated to ${opts.maxTextLength} characters.`);
      }

      // Build metadata (DOCX doesn't expose much metadata via mammoth)
      const metadata: DocumentMetadata = {
        wordCount: countWords(text),
        charCount: text.length,
      };

      // Try to extract additional metadata from core.xml if we have a buffer
      if (typeof input !== 'string') {
        const coreMetadata = await this.extractCoreMetadata(input);
        if (coreMetadata.title) metadata.title = coreMetadata.title;
        if (coreMetadata.author) metadata.author = coreMetadata.author;
        if (coreMetadata.createdAt) metadata.createdAt = coreMetadata.createdAt;
        if (coreMetadata.modifiedAt) metadata.modifiedAt = coreMetadata.modifiedAt;
      }

      const document: ExtractedDocument = {
        text,
        metadata,
        pages: [], // DOCX doesn't have page concept in extraction
        format: 'docx',
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

      if (message.includes('Could not find') || message.includes('not a valid')) {
        return {
          success: false,
          error: 'File is not a valid DOCX document',
          errorCode: 'CORRUPTED_FILE',
        };
      }

      return {
        success: false,
        error: `DOCX extraction failed: ${message}`,
        errorCode: 'UNKNOWN_ERROR',
      };
    }
  }

  /**
   * Extract core metadata from DOCX (which is a ZIP file with XML inside)
   */
  private async extractCoreMetadata(_buffer: Buffer): Promise<Partial<DocumentMetadata>> {
    try {
      // DOCX is a ZIP file; we could use JSZip to extract docProps/core.xml
      // For now, return empty - this can be enhanced later
      // The metadata extraction would require adding JSZip as a dependency
      return {};
    } catch {
      return {};
    }
  }
}

// Singleton instance
export const docxExtractor = new DocxExtractor();
