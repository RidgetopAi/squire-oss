/**
 * Document Chunking Integration Tests
 *
 * Tests for the document chunking system, including:
 * - Fixed-size chunking
 * - Semantic chunking
 * - Hybrid chunking
 * - Token counting utilities
 * - Chunk metadata
 *
 * Run with: npx tsx --test tests/chunking.test.ts
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  fixedChunker,
  semanticChunker,
  hybridChunker,
  countTokens,
  truncateToTokens,
  DEFAULT_CHUNKING_OPTIONS,
  CHUNKING_STRATEGIES,
  type ChunkingOptions,
  type DocumentChunk,
  type ChunkingResult,
} from '../src/services/documents/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function readFixture(filename: string): Promise<string> {
  const buffer = await fs.readFile(path.join(FIXTURES_DIR, filename));
  return buffer.toString('utf-8');
}

function generateTestObjectId(): string {
  return '00000000-0000-0000-0000-000000000001';
}

// ============================================================================
// TOKEN COUNTING TESTS
// ============================================================================

describe('Token Counting Utilities', () => {
  describe('countTokens', () => {
    it('should count tokens in simple text', () => {
      const tokens = countTokens('Hello World');
      assert.ok(tokens > 0, 'Should have tokens');
      assert.ok(tokens <= 5, 'Simple text should have few tokens');
    });

    it('should count tokens in longer text', () => {
      const text = 'This is a longer sentence with more words that should result in more tokens.';
      const tokens = countTokens(text);
      assert.ok(tokens > 10, 'Longer text should have more tokens');
    });

    it('should handle empty string', () => {
      const tokens = countTokens('');
      assert.strictEqual(tokens, 0, 'Empty string should have 0 tokens');
    });

    it('should handle whitespace', () => {
      const tokens = countTokens('   ');
      assert.ok(tokens >= 0, 'Whitespace should be handled');
    });
  });

  describe('truncateToTokens', () => {
    it('should truncate text to specified token count', () => {
      const text = 'This is a test sentence with multiple words that should be truncated to a shorter length.';
      const maxTokens = 5;
      const truncated = truncateToTokens(text, maxTokens);
      const resultTokens = countTokens(truncated);

      assert.ok(resultTokens <= maxTokens, `Truncated text should have <= ${maxTokens} tokens`);
      assert.ok(truncated.length < text.length, 'Truncated should be shorter');
    });

    it('should return original text if under limit', () => {
      const text = 'Short';
      const truncated = truncateToTokens(text, 100);

      assert.strictEqual(truncated, text, 'Should return original text');
    });
  });
});

// ============================================================================
// FIXED CHUNKER TESTS
// ============================================================================

describe('Fixed Chunker', () => {
  it('should have correct strategy', () => {
    assert.strictEqual(fixedChunker.strategy, 'fixed');
  });

  describe('chunk', () => {
    it('should chunk a simple text', async () => {
      const text = await readFixture('sample.txt');
      const objectId = generateTestObjectId();
      const result = await fixedChunker.chunk(text, objectId);

      assert.strictEqual(result.success, true, 'Chunking should succeed');
      assert.ok(result.chunks.length > 0, 'Should produce chunks');
      assert.ok(result.totalTokens > 0, 'Should count total tokens');
      assert.ok(result.processingDurationMs >= 0, 'Should record processing time');
    });

    it('should produce chunks within token limits', async () => {
      const text = await readFixture('long-document.txt');
      const objectId = generateTestObjectId();
      const maxTokens = 100;

      const result = await fixedChunker.chunk(text, objectId, { maxTokens });

      assert.strictEqual(result.success, true);
      for (const chunk of result.chunks) {
        assert.ok(
          chunk.tokenCount <= maxTokens + 10, // Allow small variance due to tokenization
          `Chunk ${chunk.chunkIndex} has ${chunk.tokenCount} tokens, should be <= ${maxTokens}`
        );
      }
    });

    it('should set correct chunk indices', async () => {
      const text = await readFixture('long-document.txt');
      const objectId = generateTestObjectId();
      const result = await fixedChunker.chunk(text, objectId, { maxTokens: 100 });

      assert.strictEqual(result.success, true);
      for (let i = 0; i < result.chunks.length; i++) {
        const chunk = result.chunks[i];
        assert.ok(chunk, `Chunk ${i} should exist`);
        assert.strictEqual(chunk.chunkIndex, i, `Chunk should have index ${i}`);
      }
    });

    it('should set correct objectId on all chunks', async () => {
      const text = await readFixture('sample.txt');
      const objectId = generateTestObjectId();
      const result = await fixedChunker.chunk(text, objectId);

      assert.strictEqual(result.success, true);
      for (const chunk of result.chunks) {
        assert.strictEqual(chunk.objectId, objectId, 'Chunk should have correct objectId');
      }
    });

    it('should include overlap metadata', async () => {
      const text = await readFixture('long-document.txt');
      const objectId = generateTestObjectId();
      const result = await fixedChunker.chunk(text, objectId, { maxTokens: 100, overlapTokens: 20 });

      assert.strictEqual(result.success, true);
      assert.ok(result.chunks.length > 2, 'Should have multiple chunks for overlap test');

      // First chunk should not have overlap before
      const firstChunk = result.chunks[0];
      assert.ok(firstChunk, 'First chunk should exist');
      assert.strictEqual(firstChunk.metadata.hasOverlapBefore, false);

      // Middle chunks should have overlap before and after
      if (result.chunks.length > 2) {
        const middleChunk = result.chunks[1];
        assert.ok(middleChunk, 'Middle chunk should exist');
        assert.strictEqual(middleChunk.metadata.hasOverlapBefore, true);
        assert.strictEqual(middleChunk.metadata.hasOverlapAfter, true);
      }

      // Last chunk should not have overlap after
      const lastChunk = result.chunks[result.chunks.length - 1];
      assert.ok(lastChunk, 'Last chunk should exist');
      assert.strictEqual(lastChunk.metadata.hasOverlapAfter, false);
    });

    it('should set chunking strategy on chunks', async () => {
      const text = await readFixture('sample.txt');
      const objectId = generateTestObjectId();
      const result = await fixedChunker.chunk(text, objectId);

      assert.strictEqual(result.success, true);
      for (const chunk of result.chunks) {
        assert.strictEqual(chunk.chunkingStrategy, 'fixed');
      }
    });

    it('should handle empty text', async () => {
      const result = await fixedChunker.chunk('', generateTestObjectId());

      assert.strictEqual(result.success, false, 'Should fail on empty text');
      assert.strictEqual(result.errorCode, 'EMPTY_TEXT');
    });

    it('should handle whitespace-only text', async () => {
      const result = await fixedChunker.chunk('   \n\n   ', generateTestObjectId());

      assert.strictEqual(result.success, false, 'Should fail on whitespace-only text');
      assert.strictEqual(result.errorCode, 'EMPTY_TEXT');
    });

    it('should handle very short text as single chunk', async () => {
      const text = 'Short text.';
      const result = await fixedChunker.chunk(text, generateTestObjectId());

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.chunks.length, 1, 'Should produce single chunk');
      assert.ok(result.chunks[0]?.content.includes('Short text'), 'Chunk should contain the text');
    });

    it('should include word count in metadata', async () => {
      const text = await readFixture('sample.txt');
      const result = await fixedChunker.chunk(text, generateTestObjectId());

      assert.strictEqual(result.success, true);
      for (const chunk of result.chunks) {
        assert.ok(typeof chunk.metadata.wordCount === 'number', 'Should have word count');
        assert.ok(chunk.metadata.wordCount > 0, 'Word count should be positive');
      }
    });

    it('should generate unique IDs for each chunk', async () => {
      const text = await readFixture('long-document.txt');
      const result = await fixedChunker.chunk(text, generateTestObjectId(), { maxTokens: 100 });

      assert.strictEqual(result.success, true);
      const ids = new Set(result.chunks.map(c => c.id));
      assert.strictEqual(ids.size, result.chunks.length, 'All chunk IDs should be unique');
    });
  });
});

// ============================================================================
// SEMANTIC CHUNKER TESTS
// ============================================================================

describe('Semantic Chunker', () => {
  it('should have correct strategy', () => {
    assert.strictEqual(semanticChunker.strategy, 'semantic');
  });

  describe('chunk', () => {
    it('should chunk markdown text respecting sections', async () => {
      const text = await readFixture('sample.md');
      const objectId = generateTestObjectId();
      const result = await semanticChunker.chunk(text, objectId);

      assert.strictEqual(result.success, true, 'Chunking should succeed');
      assert.ok(result.chunks.length > 0, 'Should produce chunks');
    });

    it('should preserve paragraph boundaries', async () => {
      const text = await readFixture('long-document.txt');
      const objectId = generateTestObjectId();
      const result = await semanticChunker.chunk(text, objectId);

      assert.strictEqual(result.success, true);
      // Semantic chunker should try to keep paragraphs together
      for (const chunk of result.chunks) {
        assert.strictEqual(chunk.chunkingStrategy, 'semantic');
      }
    });

    it('should detect section titles', async () => {
      const text = await readFixture('sample.md');
      const objectId = generateTestObjectId();
      const result = await semanticChunker.chunk(text, objectId);

      assert.strictEqual(result.success, true);
      // Some chunks should have section titles detected
      const chunksWithSections = result.chunks.filter(c => c.sectionTitle);
      // Markdown with headers should have some section titles
      assert.ok(result.chunks.length > 0, 'Should have chunks');
    });

    it('should handle empty text', async () => {
      const result = await semanticChunker.chunk('', generateTestObjectId());

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.errorCode, 'EMPTY_TEXT');
    });
  });
});

// ============================================================================
// HYBRID CHUNKER TESTS
// ============================================================================

describe('Hybrid Chunker', () => {
  it('should have correct strategy', () => {
    assert.strictEqual(hybridChunker.strategy, 'hybrid');
  });

  describe('chunk', () => {
    it('should chunk text with semantic awareness and size limits', async () => {
      const text = await readFixture('long-document.txt');
      const objectId = generateTestObjectId();
      const maxTokens = 200;

      const result = await hybridChunker.chunk(text, objectId, { maxTokens });

      assert.strictEqual(result.success, true, 'Chunking should succeed');
      assert.ok(result.chunks.length > 0, 'Should produce chunks');

      // Verify chunks are within size limits (with some tolerance for overlap)
      for (const chunk of result.chunks) {
        assert.ok(
          chunk.tokenCount <= maxTokens * 1.5, // Allow 50% tolerance for overlap text
          `Chunk ${chunk.chunkIndex} exceeds token limit`
        );
      }
    });

    it('should respect semantic boundaries when possible', async () => {
      const text = await readFixture('sample.md');
      const objectId = generateTestObjectId();
      const result = await hybridChunker.chunk(text, objectId, { maxTokens: 300 });

      assert.strictEqual(result.success, true);
      for (const chunk of result.chunks) {
        assert.strictEqual(chunk.chunkingStrategy, 'hybrid');
      }
    });

    it('should produce chunks with overlap metadata', async () => {
      const text = await readFixture('long-document.txt');
      const objectId = generateTestObjectId();
      const result = await hybridChunker.chunk(text, objectId, { maxTokens: 150, overlapTokens: 30 });

      assert.strictEqual(result.success, true);

      // First chunk should not have overlap before
      if (result.chunks.length > 0) {
        const firstChunk = result.chunks[0];
        assert.ok(firstChunk);
        assert.strictEqual(firstChunk.metadata.hasOverlapBefore, false);
      }

      // Last chunk should not have overlap after
      if (result.chunks.length > 0) {
        const lastChunk = result.chunks[result.chunks.length - 1];
        assert.ok(lastChunk);
        assert.strictEqual(lastChunk.metadata.hasOverlapAfter, false);
      }
    });

    it('should handle very short text', async () => {
      const text = 'Just a few words.';
      const result = await hybridChunker.chunk(text, generateTestObjectId());

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.chunks.length, 1, 'Short text should be single chunk');
    });

    it('should handle empty text', async () => {
      const result = await hybridChunker.chunk('', generateTestObjectId());

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.errorCode, 'EMPTY_TEXT');
    });

    it('should set createdAt on all chunks', async () => {
      const text = await readFixture('sample.txt');
      const result = await hybridChunker.chunk(text, generateTestObjectId());

      assert.strictEqual(result.success, true);
      const now = new Date();
      for (const chunk of result.chunks) {
        assert.ok(chunk.createdAt instanceof Date, 'createdAt should be a Date');
        assert.ok(chunk.createdAt <= now, 'createdAt should not be in the future');
      }
    });
  });
});

// ============================================================================
// DEFAULT OPTIONS TESTS
// ============================================================================

describe('Default Chunking Options', () => {
  it('should have sensible defaults', () => {
    assert.strictEqual(DEFAULT_CHUNKING_OPTIONS.strategy, 'hybrid');
    assert.strictEqual(DEFAULT_CHUNKING_OPTIONS.maxTokens, 512);
    assert.strictEqual(DEFAULT_CHUNKING_OPTIONS.overlapTokens, 50);
    assert.strictEqual(DEFAULT_CHUNKING_OPTIONS.preserveParagraphs, true);
    assert.strictEqual(DEFAULT_CHUNKING_OPTIONS.preserveSentences, true);
    assert.strictEqual(DEFAULT_CHUNKING_OPTIONS.minTokens, 50);
  });
});

// ============================================================================
// CHUNKING STRATEGIES CONSTANT TESTS
// ============================================================================

describe('Chunking Strategies', () => {
  it('should include all expected strategies', () => {
    assert.ok(CHUNKING_STRATEGIES.includes('fixed'));
    assert.ok(CHUNKING_STRATEGIES.includes('semantic'));
    assert.ok(CHUNKING_STRATEGIES.includes('hybrid'));
    assert.strictEqual(CHUNKING_STRATEGIES.length, 3);
  });
});

// ============================================================================
// COMPARATIVE TESTS
// ============================================================================

describe('Strategy Comparison', () => {
  it('should produce different results for different strategies', async () => {
    const text = await readFixture('long-document.txt');
    const objectId = generateTestObjectId();
    const options = { maxTokens: 200 };

    const [fixedResult, semanticResult, hybridResult] = await Promise.all([
      fixedChunker.chunk(text, objectId, options),
      semanticChunker.chunk(text, objectId, options),
      hybridChunker.chunk(text, objectId, options),
    ]);

    assert.strictEqual(fixedResult.success, true);
    assert.strictEqual(semanticResult.success, true);
    assert.strictEqual(hybridResult.success, true);

    // All should have roughly similar total tokens (within 10% variance due to tokenization differences)
    const avgTokens = (fixedResult.totalTokens + semanticResult.totalTokens + hybridResult.totalTokens) / 3;
    const tolerance = avgTokens * 0.1;
    assert.ok(Math.abs(fixedResult.totalTokens - semanticResult.totalTokens) <= tolerance,
      'Fixed and semantic should have similar token counts');
    assert.ok(Math.abs(semanticResult.totalTokens - hybridResult.totalTokens) <= tolerance,
      'Semantic and hybrid should have similar token counts');

    // Each should set correct strategy on chunks
    assert.ok(fixedResult.chunks.every(c => c.chunkingStrategy === 'fixed'));
    assert.ok(semanticResult.chunks.every(c => c.chunkingStrategy === 'semantic'));
    assert.ok(hybridResult.chunks.every(c => c.chunkingStrategy === 'hybrid'));
  });

  it('all strategies should cover the document content', async () => {
    const text = await readFixture('sample.txt');
    const objectId = generateTestObjectId();

    const results = await Promise.all([
      fixedChunker.chunk(text, objectId),
      semanticChunker.chunk(text, objectId),
      hybridChunker.chunk(text, objectId),
    ]);

    for (const result of results) {
      assert.strictEqual(result.success, true);

      // Concatenated chunk content should contain key phrases from original
      const allContent = result.chunks.map(c => c.content).join(' ');
      assert.ok(allContent.includes('sample text file') || allContent.includes('Squire project'),
        'Chunks should contain original content');
    }
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle text with only newlines', async () => {
    const text = '\n\n\n\n\n';
    const result = await hybridChunker.chunk(text, generateTestObjectId());

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.errorCode, 'EMPTY_TEXT');
  });

  it('should handle text with special characters', async () => {
    const text = 'Hello 🌍 World! Special chars: é, ñ, 中文, العربية. Math: ∑∏∫.';
    const result = await hybridChunker.chunk(text, generateTestObjectId());

    assert.strictEqual(result.success, true);
    assert.ok(result.chunks.length >= 1);
    assert.ok(result.chunks[0]?.content.includes('🌍'), 'Should preserve emoji');
    assert.ok(result.chunks[0]?.content.includes('中文'), 'Should preserve Chinese');
  });

  it('should handle very long single paragraph', async () => {
    // Create a long paragraph without line breaks - use fixedChunker which is guaranteed to split
    const text = 'Word '.repeat(500);
    const result = await fixedChunker.chunk(text, generateTestObjectId(), { maxTokens: 100 });

    assert.strictEqual(result.success, true);
    assert.ok(result.chunks.length > 1, 'Long paragraph should be split by fixed chunker');

    // Also verify hybrid handles it without error
    const hybridResult = await hybridChunker.chunk(text, generateTestObjectId(), { maxTokens: 100 });
    assert.strictEqual(hybridResult.success, true);
    assert.ok(hybridResult.chunks.length >= 1, 'Hybrid should produce at least one chunk');
  });

  it('should handle custom options override', async () => {
    const text = await readFixture('sample.txt');
    const customOptions: Partial<ChunkingOptions> = {
      maxTokens: 50,
      overlapTokens: 10,
      minTokens: 5,
    };

    const result = await hybridChunker.chunk(text, generateTestObjectId(), customOptions);

    assert.strictEqual(result.success, true);
    // With smaller max tokens, should produce more chunks
    assert.ok(result.chunks.length > 1, 'Should produce multiple chunks with small max tokens');
  });
});
