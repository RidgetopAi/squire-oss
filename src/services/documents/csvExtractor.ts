/**
 * CSV Extractor
 *
 * Extracts CSV files and converts them to readable row format
 * for better semantic search in RAG.
 *
 * Example output:
 * "Row 1: Name=John Smith, Age=30, City=Austin
 *  Row 2: Name=Jane Doe, Age=25, City=Dallas"
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
 * Parse CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * CSV Extractor implementation
 */
class CSVExtractor implements DocumentExtractor {
  readonly supportedFormats: DocumentFormat[] = ['txt']; // CSV is a text variant
  readonly supportedMimeTypes: string[] = [
    'text/csv',
    'application/csv',
    'text/comma-separated-values',
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
      let rawText: string;
      let fileName: string | undefined;
      let fileSize: number | undefined;

      if (typeof input === 'string') {
        // It's a file path
        const buffer = await fs.readFile(input);
        rawText = buffer.toString('utf-8');
        fileName = input.split('/').pop();
        const stats = await fs.stat(input);
        fileSize = stats.size;
      } else {
        // It's a buffer
        rawText = input.toString('utf-8');
        fileSize = input.length;
      }

      // Handle BOM
      if (rawText.charCodeAt(0) === 0xFEFF) {
        rawText = rawText.slice(1);
      }

      // Check for empty document
      if (!rawText || rawText.trim().length === 0) {
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
            format: 'txt',
            extractedAt: new Date(),
            extractionDurationMs: Date.now() - startTime,
            warnings: ['Document is empty.'],
          },
        };
      }

      // Parse CSV
      const lines = rawText.split(/\r?\n/).filter(line => line.trim().length > 0);

      if (lines.length === 0) {
        return {
          success: true,
          document: {
            text: '',
            metadata: { wordCount: 0, charCount: 0, fileName, fileSize },
            pages: [],
            format: 'txt',
            extractedAt: new Date(),
            extractionDurationMs: Date.now() - startTime,
            warnings: ['CSV file has no data rows.'],
          },
        };
      }

      // First line is header
      const headers = parseCSVLine(lines[0]!);
      const dataRows = lines.slice(1);

      // Convert to readable format
      const formattedRows: string[] = [];
      let rowNum = 0;

      for (const line of dataRows) {
        rowNum++;
        const values = parseCSVLine(line);

        // Build "Column=Value" pairs
        const pairs: string[] = [];
        for (let i = 0; i < headers.length; i++) {
          const header = headers[i] || `Column${i + 1}`;
          const value = values[i] || '';
          if (value) {
            pairs.push(`${header}=${value}`);
          }
        }

        if (pairs.length > 0) {
          formattedRows.push(`Row ${rowNum}: ${pairs.join(', ')}`);
        }

        // Check if we're exceeding max length
        const currentText = formattedRows.join('\n');
        if (currentText.length > opts.maxTextLength) {
          warnings.push(`CSV truncated after ${rowNum} rows (max text length reached).`);
          break;
        }
      }

      const text = formattedRows.join('\n');

      // Build metadata
      const metadata: DocumentMetadata = {
        title: fileName?.replace(/\.csv$/i, ''),
        wordCount: countWords(text),
        charCount: text.length,
        fileName,
        fileSize,
      };

      const document: ExtractedDocument = {
        text,
        metadata,
        pages: [],
        format: 'txt',
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
        error: `CSV extraction failed: ${message}`,
        errorCode: 'UNKNOWN_ERROR',
      };
    }
  }
}

// Singleton instance
export const csvExtractor = new CSVExtractor();
