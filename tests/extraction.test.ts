/**
 * Document Extraction Integration Tests
 *
 * Tests for the document extraction pipeline, including:
 * - Plain text extraction
 * - Markdown extraction
 * - MIME type validation
 * - Error handling
 *
 * Run with: npx tsx --test tests/extraction.test.ts
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  extractFromFile,
  extractFromBuffer,
  isSupported,
  getSupportedMimeTypes,
  textExtractor,
  getFormatFromMimeType,
  getFormatFromExtension,
  isExtractableMimeType,
  countWords,
  EXTRACTABLE_MIME_TYPES,
  DOCUMENT_FORMATS,
} from '../src/services/documents/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function readFixture(filename: string): Promise<Buffer> {
  return fs.readFile(path.join(FIXTURES_DIR, filename));
}

// ============================================================================
// TEXT EXTRACTION TESTS
// ============================================================================

describe('Text Extractor', () => {
  describe('extractFromFile', () => {
    it('should extract text from a plain text file', async () => {
      const filePath = path.join(FIXTURES_DIR, 'sample.txt');
      const result = await extractFromFile(filePath);

      assert.strictEqual(result.success, true, 'Extraction should succeed');
      assert.ok(result.document, 'Should return a document');
      assert.ok(result.document.text.includes('sample text file'), 'Should contain expected text');
      assert.strictEqual(result.document.format, 'txt', 'Format should be txt');
      assert.ok(result.document.metadata.wordCount > 0, 'Should have word count');
      assert.ok(result.document.metadata.charCount > 0, 'Should have char count');
      assert.ok(result.document.extractionDurationMs >= 0, 'Should record extraction time');
    });

    it('should extract text from a markdown file', async () => {
      const filePath = path.join(FIXTURES_DIR, 'sample.md');
      const result = await extractFromFile(filePath);

      assert.strictEqual(result.success, true, 'Extraction should succeed');
      assert.ok(result.document, 'Should return a document');
      assert.strictEqual(result.document.format, 'md', 'Format should be md');
      assert.ok(result.document.text.includes('# Sample Markdown'), 'Should contain markdown heading');
      assert.strictEqual(result.document.metadata.title, 'Sample Markdown Document', 'Should extract title from H1');
    });

    it('should extract from a long document', async () => {
      const filePath = path.join(FIXTURES_DIR, 'long-document.txt');
      const result = await extractFromFile(filePath);

      assert.strictEqual(result.success, true, 'Extraction should succeed');
      assert.ok(result.document, 'Should return a document');
      assert.ok(result.document.metadata.wordCount > 500, 'Should have substantial word count');
      assert.ok(result.document.text.includes('CHAPTER 1'), 'Should contain chapter headers');
      assert.ok(result.document.text.includes('CHAPTER 5'), 'Should contain all chapters');
    });

    it('should return error for non-existent file', async () => {
      const result = await extractFromFile('/non/existent/file.txt');

      assert.strictEqual(result.success, false, 'Extraction should fail');
      assert.ok(result.error, 'Should have error message');
      assert.strictEqual(result.errorCode, 'CORRUPTED_FILE', 'Should have correct error code');
    });
  });

  describe('extractFromBuffer', () => {
    it('should extract text from a text buffer', async () => {
      const buffer = await readFixture('sample.txt');
      const result = await extractFromBuffer(buffer, 'text/plain');

      assert.strictEqual(result.success, true, 'Extraction should succeed');
      assert.ok(result.document, 'Should return a document');
      assert.ok(result.document.text.includes('sample text file'), 'Should contain expected text');
    });

    it('should extract text from a markdown buffer', async () => {
      const buffer = await readFixture('sample.md');
      const result = await extractFromBuffer(buffer, 'text/markdown');

      assert.strictEqual(result.success, true, 'Extraction should succeed');
      assert.ok(result.document, 'Should return a document');
      assert.ok(result.document.text.includes('Sample Markdown'), 'Should contain markdown content');
    });

    it('should handle empty buffer', async () => {
      const buffer = Buffer.from('');
      const result = await extractFromBuffer(buffer, 'text/plain');

      assert.strictEqual(result.success, true, 'Should succeed with empty doc');
      assert.ok(result.document, 'Should return a document');
      assert.strictEqual(result.document.metadata.wordCount, 0, 'Word count should be 0');
      assert.ok(result.document.warnings.length > 0, 'Should have empty document warning');
    });

    it('should handle whitespace-only buffer', async () => {
      const buffer = Buffer.from('   \n\n   \t   ');
      const result = await extractFromBuffer(buffer, 'text/plain');

      assert.strictEqual(result.success, true, 'Should succeed');
      assert.ok(result.document, 'Should return a document');
    });

    it('should handle BOM (Byte Order Mark)', async () => {
      // UTF-8 BOM: EF BB BF
      const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
      const text = Buffer.from('Hello World');
      const buffer = Buffer.concat([bom, text]);

      const result = await extractFromBuffer(buffer, 'text/plain');

      assert.strictEqual(result.success, true, 'Should succeed');
      assert.ok(result.document, 'Should return a document');
      // BOM should be stripped
      assert.ok(!result.document.text.startsWith('\uFEFF'), 'BOM should be removed');
      assert.ok(result.document.text.includes('Hello World'), 'Should contain text');
    });

    it('should return error for unsupported MIME type', async () => {
      const buffer = Buffer.from('test');
      const result = await extractFromBuffer(buffer, 'application/octet-stream');

      assert.strictEqual(result.success, false, 'Extraction should fail');
      assert.strictEqual(result.errorCode, 'UNSUPPORTED_FORMAT', 'Should have unsupported format error');
    });
  });

  describe('extraction options', () => {
    it('should respect maxTextLength option', async () => {
      const buffer = await readFixture('long-document.txt');
      const result = await extractFromBuffer(buffer, 'text/plain', {
        maxTextLength: 100,
      });

      assert.strictEqual(result.success, true, 'Extraction should succeed');
      assert.ok(result.document, 'Should return a document');
      assert.ok(result.document.text.length <= 100, 'Text should be truncated');
      assert.ok(result.document.warnings.some(w => w.includes('truncated')), 'Should warn about truncation');
    });
  });
});

// ============================================================================
// MIME TYPE & FORMAT UTILITIES TESTS
// ============================================================================

describe('MIME Type Utilities', () => {
  describe('isSupported', () => {
    it('should return true for supported MIME types', () => {
      assert.strictEqual(isSupported('text/plain'), true);
      assert.strictEqual(isSupported('text/markdown'), true);
      assert.strictEqual(isSupported('text/x-markdown'), true);
      assert.strictEqual(isSupported('application/pdf'), true);
      assert.strictEqual(isSupported('image/png'), true);
    });

    it('should return false for unsupported MIME types', () => {
      assert.strictEqual(isSupported('application/octet-stream'), false);
      assert.strictEqual(isSupported('video/mp4'), false);
      assert.strictEqual(isSupported('audio/mpeg'), false);
      assert.strictEqual(isSupported(''), false);
    });

    it('should be case-insensitive', () => {
      assert.strictEqual(isSupported('TEXT/PLAIN'), true);
      assert.strictEqual(isSupported('Application/PDF'), true);
    });
  });

  describe('getSupportedMimeTypes', () => {
    it('should return all extractable MIME types', () => {
      const types = getSupportedMimeTypes();

      assert.ok(Array.isArray(types), 'Should return an array');
      assert.ok(types.length > 0, 'Should have MIME types');
      assert.ok(types.includes('text/plain'), 'Should include text/plain');
      assert.ok(types.includes('application/pdf'), 'Should include application/pdf');
    });
  });

  describe('getFormatFromMimeType', () => {
    it('should return correct format for MIME types', () => {
      assert.strictEqual(getFormatFromMimeType('text/plain'), 'txt');
      assert.strictEqual(getFormatFromMimeType('text/markdown'), 'md');
      assert.strictEqual(getFormatFromMimeType('application/pdf'), 'pdf');
      assert.strictEqual(getFormatFromMimeType('image/png'), 'image');
    });

    it('should return null for unknown MIME types', () => {
      assert.strictEqual(getFormatFromMimeType('unknown/type'), null);
    });
  });

  describe('getFormatFromExtension', () => {
    it('should return correct format for file extensions', () => {
      assert.strictEqual(getFormatFromExtension('document.txt'), 'txt');
      assert.strictEqual(getFormatFromExtension('readme.md'), 'md');
      assert.strictEqual(getFormatFromExtension('file.pdf'), 'pdf');
      assert.strictEqual(getFormatFromExtension('photo.png'), 'image');
      assert.strictEqual(getFormatFromExtension('photo.JPEG'), 'image');
    });

    it('should return null for unknown extensions', () => {
      assert.strictEqual(getFormatFromExtension('file.xyz'), null);
    });
  });

  describe('isExtractableMimeType', () => {
    it('should validate extractable MIME types', () => {
      assert.strictEqual(isExtractableMimeType('text/plain'), true);
      assert.strictEqual(isExtractableMimeType('application/pdf'), true);
      assert.strictEqual(isExtractableMimeType('video/mp4'), false);
    });
  });
});

// ============================================================================
// TEXT UTILITY TESTS
// ============================================================================

describe('Text Utilities', () => {
  describe('countWords', () => {
    it('should count words correctly', () => {
      assert.strictEqual(countWords('Hello World'), 2);
      assert.strictEqual(countWords('One'), 1);
      assert.strictEqual(countWords(''), 0);
      assert.strictEqual(countWords('   '), 0);
    });

    it('should handle multiple spaces', () => {
      assert.strictEqual(countWords('Hello    World'), 2);
      assert.strictEqual(countWords('  spaced  out  text  '), 3);
    });

    it('should handle newlines and tabs', () => {
      assert.strictEqual(countWords('Hello\nWorld'), 2);
      assert.strictEqual(countWords('Hello\t\tWorld'), 2);
      assert.strictEqual(countWords('Line1\nLine2\nLine3'), 3);
    });
  });
});

// ============================================================================
// TEXT EXTRACTOR DIRECT TESTS
// ============================================================================

describe('TextExtractor Class', () => {
  it('should support expected formats', () => {
    assert.ok(textExtractor.supportedFormats.includes('txt'), 'Should support txt');
    assert.ok(textExtractor.supportedFormats.includes('md'), 'Should support md');
  });

  it('should support expected MIME types', () => {
    assert.ok(textExtractor.supportedMimeTypes.includes('text/plain'));
    assert.ok(textExtractor.supportedMimeTypes.includes('text/markdown'));
    assert.ok(textExtractor.supportedMimeTypes.includes('text/x-markdown'));
  });

  describe('canHandle', () => {
    it('should return true for supported types', () => {
      assert.strictEqual(textExtractor.canHandle('text/plain'), true);
      assert.strictEqual(textExtractor.canHandle('text/markdown'), true);
    });

    it('should return false for unsupported types', () => {
      assert.strictEqual(textExtractor.canHandle('application/pdf'), false);
      assert.strictEqual(textExtractor.canHandle('image/png'), false);
    });
  });
});

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

describe('Constants', () => {
  it('EXTRACTABLE_MIME_TYPES should include expected types', () => {
    assert.ok(EXTRACTABLE_MIME_TYPES.includes('text/plain'));
    assert.ok(EXTRACTABLE_MIME_TYPES.includes('application/pdf'));
    assert.ok(EXTRACTABLE_MIME_TYPES.includes('image/png'));
    assert.ok(EXTRACTABLE_MIME_TYPES.includes('image/jpeg'));
  });

  it('DOCUMENT_FORMATS should include expected formats', () => {
    assert.ok(DOCUMENT_FORMATS.includes('pdf'));
    assert.ok(DOCUMENT_FORMATS.includes('docx'));
    assert.ok(DOCUMENT_FORMATS.includes('txt'));
    assert.ok(DOCUMENT_FORMATS.includes('md'));
    assert.ok(DOCUMENT_FORMATS.includes('image'));
  });
});
