/**
 * Hybrid Document Chunker
 *
 * Combines semantic awareness with strict token limits:
 * - Respects paragraph and section boundaries when possible
 * - Enforces maximum token count per chunk
 * - Adds configurable overlap between chunks
 *
 * This is the recommended default strategy for RAG applications.
 */

import { v4 as uuidv4 } from 'uuid';
import { encode, decode } from 'gpt-tokenizer';
import {
  DocumentChunker,
  ChunkingOptions,
  ChunkingResult,
  DocumentChunk,
  DocumentSection,
  DEFAULT_CHUNKING_OPTIONS,
} from './types.js';
import { detectSections } from './semanticChunker.js';

/**
 * Hybrid chunker implementation
 *
 * Uses semantic boundaries but enforces strict token limits with overlap.
 */
export const hybridChunker: DocumentChunker = {
  strategy: 'hybrid',

  async chunk(
    text: string,
    objectId: string,
    options?: Partial<ChunkingOptions>
  ): Promise<ChunkingResult> {
    const startTime = Date.now();

    const opts: ChunkingOptions = {
      ...DEFAULT_CHUNKING_OPTIONS,
      ...options,
      strategy: 'hybrid',
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
      const tokens = encode(text);
      const totalTokens = tokens.length;

      // If text is shorter than minTokens, return as single chunk
      if (totalTokens < opts.minTokens) {
        return {
          success: true,
          chunks: [createSingleChunk(text, objectId, totalTokens)],
          totalTokens,
          processingDurationMs: Date.now() - startTime,
        };
      }

      // Detect sections for metadata
      const sections = detectSections(text);

      // Split into semantic units (paragraphs)
      const units = splitIntoSemanticUnits(text);

      // Group units into chunks with overlap
      const chunks = groupUnitsWithOverlap(units, sections, objectId, opts);

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
        errorCode: 'UNKNOWN_ERROR',
        processingDurationMs: Date.now() - startTime,
      };
    }
  },
};

interface SemanticUnit {
  text: string;
  tokens: number[];
  tokenCount: number;
  startChar: number;
  endChar: number;
  isHeading: boolean;
}

/**
 * Split text into semantic units (paragraphs, preserving headings)
 */
function splitIntoSemanticUnits(text: string): SemanticUnit[] {
  const units: SemanticUnit[] = [];

  // Split on paragraph breaks
  const paragraphs = text.split(/\n\s*\n/);

  let currentPos = 0;
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length === 0) continue;

    const startChar = text.indexOf(para, currentPos);
    const tokens = encode(trimmed);

    // Check if this is a heading
    const isHeading = /^#{1,6}\s/.test(trimmed) || /^.+\n[=-]{2,}$/.test(trimmed);

    units.push({
      text: trimmed,
      tokens,
      tokenCount: tokens.length,
      startChar,
      endChar: startChar + para.length,
      isHeading,
    });

    currentPos = startChar + para.length;
  }

  return units;
}

/**
 * Group semantic units into chunks with overlap
 */
function groupUnitsWithOverlap(
  units: SemanticUnit[],
  sections: DocumentSection[],
  objectId: string,
  options: ChunkingOptions
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  // Track tokens for overlap
  let overlapTokens: number[] = [];

  let currentUnits: SemanticUnit[] = [];
  let currentTokenCount = 0;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (!unit) continue;

    // If this unit alone exceeds max, split it
    if (unit.tokenCount > options.maxTokens) {
      // Flush current chunk if any
      if (currentUnits.length > 0) {
        const chunk = createChunkFromUnits(
          currentUnits,
          sections,
          objectId,
          chunkIndex++,
          overlapTokens,
          options
        );
        chunks.push(chunk);

        // Prepare overlap for next chunk
        overlapTokens = getOverlapTokens(currentUnits, options.overlapTokens);
        currentUnits = [];
        currentTokenCount = 0;
      }

      // Split large unit by tokens
      const splitChunks = splitLargeUnit(unit, sections, objectId, chunkIndex, overlapTokens, options);
      chunks.push(...splitChunks);
      chunkIndex += splitChunks.length;

      // Prepare overlap from last split chunk
      const lastSplit = splitChunks[splitChunks.length - 1];
      if (lastSplit) {
        overlapTokens = encode(lastSplit.content).slice(-options.overlapTokens);
      }
      continue;
    }

    // Check if adding this unit would exceed max (accounting for overlap)
    const projectedTokens = currentTokenCount + unit.tokenCount +
      (currentUnits.length === 0 ? overlapTokens.length : 0);

    if (projectedTokens > options.maxTokens && currentUnits.length > 0) {
      // Flush current chunk
      const chunk = createChunkFromUnits(
        currentUnits,
        sections,
        objectId,
        chunkIndex++,
        overlapTokens,
        options
      );
      chunks.push(chunk);

      // Prepare overlap for next chunk
      overlapTokens = getOverlapTokens(currentUnits, options.overlapTokens);
      currentUnits = [];
      currentTokenCount = 0;
    }

    // Add unit to current chunk
    currentUnits.push(unit);
    currentTokenCount += unit.tokenCount;
  }

  // Flush final chunk
  if (currentUnits.length > 0) {
    const chunk = createChunkFromUnits(
      currentUnits,
      sections,
      objectId,
      chunkIndex++,
      overlapTokens,
      options
    );
    chunk.metadata.hasOverlapAfter = false;
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Get overlap tokens from units
 */
function getOverlapTokens(units: SemanticUnit[], maxOverlap: number): number[] {
  // Collect tokens from the end of units
  const allTokens: number[] = [];
  for (const unit of units) {
    allTokens.push(...unit.tokens);
  }
  return allTokens.slice(-maxOverlap);
}

/**
 * Split a large unit that exceeds max tokens
 */
function splitLargeUnit(
  unit: SemanticUnit,
  sections: DocumentSection[],
  objectId: string,
  startIndex: number,
  leadingOverlap: number[],
  options: ChunkingOptions
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let chunkIndex = startIndex;

  // Try to split on sentences first
  const sentences = unit.text.match(/[^.!?]+[.!?]+\s*/g) || [unit.text];

  let currentTokens: number[] = [...leadingOverlap];
  let currentText = leadingOverlap.length > 0 ? decode(leadingOverlap) : '';

  for (const sentence of sentences) {
    const sentenceTokens = encode(sentence);

    if (currentTokens.length + sentenceTokens.length > options.maxTokens) {
      // Flush current chunk if we have content beyond overlap
      if (currentText.length > (leadingOverlap.length > 0 ? decode(leadingOverlap).length : 0)) {
        const section = findSectionForPosition(unit.startChar, sections);
        chunks.push({
          id: uuidv4(),
          objectId,
          chunkIndex: chunkIndex++,
          content: currentText.trim(),
          tokenCount: currentTokens.length,
          sectionTitle: section?.title,
          chunkingStrategy: 'hybrid',
          metadata: {
            hasOverlapBefore: chunks.length > 0 || leadingOverlap.length > 0,
            hasOverlapAfter: true,
            wordCount: countWords(currentText),
          },
          createdAt: new Date(),
        });

        // New overlap from current chunk
        currentTokens = currentTokens.slice(-options.overlapTokens);
        currentText = decode(currentTokens);
      }
    }

    currentTokens.push(...sentenceTokens);
    currentText += sentence;
  }

  // Final chunk from remaining text
  if (currentText.trim()) {
    const section = findSectionForPosition(unit.startChar, sections);
    chunks.push({
      id: uuidv4(),
      objectId,
      chunkIndex: chunkIndex++,
      content: currentText.trim(),
      tokenCount: currentTokens.length,
      sectionTitle: section?.title,
      chunkingStrategy: 'hybrid',
      metadata: {
        hasOverlapBefore: chunks.length > 0 || leadingOverlap.length > 0,
        hasOverlapAfter: false,
        wordCount: countWords(currentText),
      },
      createdAt: new Date(),
    });
  }

  return chunks;
}

/**
 * Create a chunk from semantic units
 */
function createChunkFromUnits(
  units: SemanticUnit[],
  sections: DocumentSection[],
  objectId: string,
  chunkIndex: number,
  leadingOverlap: number[],
  _options: ChunkingOptions
): DocumentChunk {
  // Build content with overlap
  let content = '';
  let tokenCount = 0;

  // Add overlap text at the start if this isn't the first chunk
  if (leadingOverlap.length > 0 && chunkIndex > 0) {
    const overlapText = decode(leadingOverlap);
    content = overlapText + '\n\n';
    tokenCount = leadingOverlap.length;
  }

  // Add unit texts
  content += units.map(u => u.text).join('\n\n');
  tokenCount += units.reduce((sum, u) => sum + u.tokenCount, 0);

  // Find section
  const firstUnit = units[0];
  const section = firstUnit
    ? findSectionForPosition(firstUnit.startChar, sections)
    : undefined;

  return {
    id: uuidv4(),
    objectId,
    chunkIndex,
    content: content.trim(),
    tokenCount,
    sectionTitle: section?.title,
    chunkingStrategy: 'hybrid',
    metadata: {
      hasOverlapBefore: chunkIndex > 0,
      hasOverlapAfter: true,
      wordCount: countWords(content),
      unitCount: units.length,
      overlapTokens: leadingOverlap.length,
    },
    createdAt: new Date(),
  };
}

/**
 * Create a single chunk for short documents
 */
function createSingleChunk(
  text: string,
  objectId: string,
  tokenCount: number
): DocumentChunk {
  return {
    id: uuidv4(),
    objectId,
    chunkIndex: 0,
    content: text,
    tokenCount,
    chunkingStrategy: 'hybrid',
    metadata: {
      hasOverlapBefore: false,
      hasOverlapAfter: false,
      wordCount: countWords(text),
    },
    createdAt: new Date(),
  };
}

/**
 * Find section for a position
 */
function findSectionForPosition(
  position: number,
  sections: DocumentSection[]
): DocumentSection | undefined {
  for (let i = sections.length - 1; i >= 0; i--) {
    const section = sections[i];
    if (section && section.startChar <= position) {
      return section;
    }
  }
  return undefined;
}

/**
 * Count words
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
