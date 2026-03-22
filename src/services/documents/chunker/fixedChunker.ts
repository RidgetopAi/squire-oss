/**
 * Fixed-Size Document Chunker
 *
 * Splits documents into fixed-token-count chunks with configurable overlap.
 * Uses gpt-tokenizer for accurate token counting.
 */

import { v4 as uuidv4 } from 'uuid';
import { encode, decode } from 'gpt-tokenizer';
import {
  DocumentChunker,
  ChunkingOptions,
  ChunkingResult,
  DocumentChunk,
  DEFAULT_CHUNKING_OPTIONS,
} from './types.js';

/**
 * Fixed-size chunker implementation
 *
 * Splits text into chunks of approximately maxTokens,
 * with overlap between consecutive chunks for context continuity.
 */
export const fixedChunker: DocumentChunker = {
  strategy: 'fixed',

  async chunk(
    text: string,
    objectId: string,
    options?: Partial<ChunkingOptions>
  ): Promise<ChunkingResult> {
    const startTime = Date.now();

    const opts: ChunkingOptions = {
      ...DEFAULT_CHUNKING_OPTIONS,
      ...options,
      strategy: 'fixed',
    };

    // Validate input
    if (!text || text.trim().length === 0) {
      return {
        success: false,
        chunks: [],
        totalTokens: 0,
        error: 'Empty text provided',
        errorCode: 'EMPTY_TEXT',
        processingDurationMs: Date.now() - startTime,
      };
    }

    try {
      // Tokenize the entire text
      const tokens = encode(text);
      const totalTokens = tokens.length;

      // Check minimum length
      if (totalTokens < opts.minTokens) {
        // Return as single chunk if too short to split
        const chunk = createChunk(
          objectId,
          0,
          text,
          totalTokens,
          opts,
          { isFirst: true, isLast: true }
        );
        return {
          success: true,
          chunks: [chunk],
          totalTokens,
          processingDurationMs: Date.now() - startTime,
        };
      }

      const chunks: DocumentChunk[] = [];
      let chunkIndex = 0;
      let startTokenIndex = 0;

      while (startTokenIndex < totalTokens) {
        // Calculate end position for this chunk
        const endTokenIndex = Math.min(startTokenIndex + opts.maxTokens, totalTokens);

        // Extract tokens for this chunk
        const chunkTokens = tokens.slice(startTokenIndex, endTokenIndex);

        // Decode tokens back to text
        const chunkText = decode(chunkTokens);

        // Create chunk
        const isFirst = chunkIndex === 0;
        const isLast = endTokenIndex >= totalTokens;

        const chunk = createChunk(
          objectId,
          chunkIndex,
          chunkText,
          chunkTokens.length,
          opts,
          {
            isFirst,
            isLast,
            startTokenIndex,
            endTokenIndex,
          }
        );

        chunks.push(chunk);
        chunkIndex++;

        // Move to next chunk position (accounting for overlap)
        if (isLast) {
          break;
        }

        // Step forward by (maxTokens - overlapTokens)
        const step = Math.max(1, opts.maxTokens - opts.overlapTokens);
        startTokenIndex += step;
      }

      return {
        success: true,
        chunks,
        totalTokens,
        processingDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        chunks: [],
        totalTokens: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'TOKENIZATION_FAILED',
        processingDurationMs: Date.now() - startTime,
      };
    }
  },
};

/**
 * Create a DocumentChunk with metadata
 */
function createChunk(
  objectId: string,
  chunkIndex: number,
  content: string,
  tokenCount: number,
  _options: ChunkingOptions,
  context: {
    isFirst: boolean;
    isLast: boolean;
    startTokenIndex?: number;
    endTokenIndex?: number;
  }
): DocumentChunk {
  return {
    id: uuidv4(),
    objectId,
    chunkIndex,
    content,
    tokenCount,
    chunkingStrategy: 'fixed',
    metadata: {
      hasOverlapBefore: !context.isFirst,
      hasOverlapAfter: !context.isLast,
      wordCount: countWords(content),
      startTokenIndex: context.startTokenIndex,
      endTokenIndex: context.endTokenIndex,
    },
    createdAt: new Date(),
  };
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Utility function to count tokens in text
 */
export function countTokens(text: string): number {
  return encode(text).length;
}

/**
 * Utility function to truncate text to a maximum token count
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const tokens = encode(text);
  if (tokens.length <= maxTokens) {
    return text;
  }
  return decode(tokens.slice(0, maxTokens));
}
