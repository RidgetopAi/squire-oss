/**
 * Semantic Document Chunker
 *
 * Splits documents at natural semantic boundaries:
 * - Paragraphs (double newlines)
 * - Section headings (markdown/document headings)
 * - Sentence boundaries (when paragraphs exceed max tokens)
 */

import { v4 as uuidv4 } from 'uuid';
import { encode } from 'gpt-tokenizer';
import {
  DocumentChunker,
  ChunkingOptions,
  ChunkingResult,
  DocumentChunk,
  DocumentSection,
  DEFAULT_CHUNKING_OPTIONS,
} from './types.js';

/**
 * Semantic chunker implementation
 *
 * Respects natural document structure: paragraphs, sections, and sentences.
 */
export const semanticChunker: DocumentChunker = {
  strategy: 'semantic',

  async chunk(
    text: string,
    objectId: string,
    options?: Partial<ChunkingOptions>
  ): Promise<ChunkingResult> {
    const startTime = Date.now();

    const opts: ChunkingOptions = {
      ...DEFAULT_CHUNKING_OPTIONS,
      ...options,
      strategy: 'semantic',
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
      // Detect sections in the document
      const sections = detectSections(text);

      // Split into paragraphs
      const paragraphs = splitIntoParagraphs(text);

      // Group paragraphs into chunks respecting token limits
      const chunks = groupParagraphsIntoChunks(
        paragraphs,
        sections,
        objectId,
        opts
      );

      const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

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

/**
 * Detect section headings in text
 */
function detectSections(text: string): DocumentSection[] {
  const sections: DocumentSection[] = [];

  // Find markdown headings
  const mdHeadingRegex = /^(#{1,6})\s+(.+)$/gm;
  let match;

  while ((match = mdHeadingRegex.exec(text)) !== null) {
    const hashes = match[1];
    const title = match[2];
    if (hashes && title) {
      sections.push({
        title: title.trim(),
        level: hashes.length,
        startChar: match.index,
        endChar: match.index + match[0].length,
      });
    }
  }

  // Find setext headings (underlined)
  const setextH1 = /^(.+)\n[=]{2,}$/gm;
  while ((match = setextH1.exec(text)) !== null) {
    const title = match[1];
    if (title) {
      sections.push({
        title: title.trim(),
        level: 1,
        startChar: match.index,
        endChar: match.index + match[0].length,
      });
    }
  }

  const setextH2 = /^(.+)\n[-]{2,}$/gm;
  while ((match = setextH2.exec(text)) !== null) {
    const title = match[1];
    if (title) {
      sections.push({
        title: title.trim(),
        level: 2,
        startChar: match.index,
        endChar: match.index + match[0].length,
      });
    }
  }

  // Sort by position
  sections.sort((a, b) => a.startChar - b.startChar);

  // Set endChar for each section to the start of the next section
  for (let i = 0; i < sections.length - 1; i++) {
    const current = sections[i];
    const next = sections[i + 1];
    if (current && next) {
      current.endChar = next.startChar;
    }
  }
  const lastSection = sections[sections.length - 1];
  if (lastSection) {
    lastSection.endChar = text.length;
  }

  return sections;
}

/**
 * Split text into paragraphs
 */
function splitIntoParagraphs(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Split on double newlines (paragraph breaks)
  const parts = text.split(/\n\s*\n/);

  let currentPos = 0;
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      const startChar = text.indexOf(part, currentPos);
      paragraphs.push({
        text: trimmed,
        startChar,
        endChar: startChar + part.length,
        tokenCount: encode(trimmed).length,
      });
      currentPos = startChar + part.length;
    }
  }

  return paragraphs;
}

interface Paragraph {
  text: string;
  startChar: number;
  endChar: number;
  tokenCount: number;
}

/**
 * Group paragraphs into chunks respecting token limits
 */
function groupParagraphsIntoChunks(
  paragraphs: Paragraph[],
  sections: DocumentSection[],
  objectId: string,
  options: ChunkingOptions
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  let currentChunkParagraphs: Paragraph[] = [];
  let currentTokenCount = 0;
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    // Check if adding this paragraph would exceed the limit
    if (currentTokenCount + paragraph.tokenCount > options.maxTokens) {
      // If current chunk has content, finalize it
      if (currentChunkParagraphs.length > 0) {
        chunks.push(
          createChunkFromParagraphs(
            currentChunkParagraphs,
            sections,
            objectId,
            chunkIndex++,
            chunks.length === 0,
            false
          )
        );
        currentChunkParagraphs = [];
        currentTokenCount = 0;
      }

      // If single paragraph exceeds max, split it by sentences
      if (paragraph.tokenCount > options.maxTokens) {
        const sentenceChunks = splitParagraphBySentences(
          paragraph,
          sections,
          objectId,
          chunkIndex,
          options
        );
        chunks.push(...sentenceChunks);
        chunkIndex += sentenceChunks.length;
        continue;
      }
    }

    // Add paragraph to current chunk
    currentChunkParagraphs.push(paragraph);
    currentTokenCount += paragraph.tokenCount;
  }

  // Finalize last chunk
  if (currentChunkParagraphs.length > 0) {
    chunks.push(
      createChunkFromParagraphs(
        currentChunkParagraphs,
        sections,
        objectId,
        chunkIndex++,
        chunks.length === 0,
        true
      )
    );
  }

  // Mark last chunk
  const lastChunk = chunks[chunks.length - 1];
  if (lastChunk) {
    lastChunk.metadata.hasOverlapAfter = false;
  }

  return chunks;
}

/**
 * Split a large paragraph by sentences
 */
function splitParagraphBySentences(
  paragraph: Paragraph,
  sections: DocumentSection[],
  objectId: string,
  startIndex: number,
  options: ChunkingOptions
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  // Split on sentence boundaries
  const sentences = paragraph.text.match(/[^.!?]+[.!?]+\s*/g) || [paragraph.text];

  let currentText = '';
  let currentTokenCount = 0;
  let chunkIndex = startIndex;

  for (const sentence of sentences) {
    const sentenceTokens = encode(sentence).length;

    if (currentTokenCount + sentenceTokens > options.maxTokens && currentText) {
      // Finalize current chunk
      const section = findSectionForPosition(paragraph.startChar, sections);
      chunks.push({
        id: uuidv4(),
        objectId,
        chunkIndex: chunkIndex++,
        content: currentText.trim(),
        tokenCount: currentTokenCount,
        sectionTitle: section?.title,
        chunkingStrategy: 'semantic',
        metadata: {
          hasOverlapBefore: chunks.length > 0,
          hasOverlapAfter: true,
          wordCount: countWords(currentText),
        },
        createdAt: new Date(),
      });
      currentText = '';
      currentTokenCount = 0;
    }

    currentText += sentence;
    currentTokenCount += sentenceTokens;
  }

  // Final chunk from remaining text
  if (currentText.trim()) {
    const section = findSectionForPosition(paragraph.startChar, sections);
    chunks.push({
      id: uuidv4(),
      objectId,
      chunkIndex: chunkIndex++,
      content: currentText.trim(),
      tokenCount: currentTokenCount,
      sectionTitle: section?.title,
      chunkingStrategy: 'semantic',
      metadata: {
        hasOverlapBefore: chunks.length > 0,
        hasOverlapAfter: false,
        wordCount: countWords(currentText),
      },
      createdAt: new Date(),
    });
  }

  return chunks;
}

/**
 * Create a chunk from multiple paragraphs
 */
function createChunkFromParagraphs(
  paragraphs: Paragraph[],
  sections: DocumentSection[],
  objectId: string,
  chunkIndex: number,
  isFirst: boolean,
  isLast: boolean
): DocumentChunk {
  const content = paragraphs.map(p => p.text).join('\n\n');
  const tokenCount = paragraphs.reduce((sum, p) => sum + p.tokenCount, 0);

  // Find section for the first paragraph
  const firstParagraph = paragraphs[0];
  const section = firstParagraph
    ? findSectionForPosition(firstParagraph.startChar, sections)
    : undefined;

  return {
    id: uuidv4(),
    objectId,
    chunkIndex,
    content,
    tokenCount,
    sectionTitle: section?.title,
    chunkingStrategy: 'semantic',
    metadata: {
      hasOverlapBefore: !isFirst,
      hasOverlapAfter: !isLast,
      wordCount: countWords(content),
      paragraphCount: paragraphs.length,
    },
    createdAt: new Date(),
  };
}

/**
 * Find the section that contains a given character position
 */
function findSectionForPosition(
  position: number,
  sections: DocumentSection[]
): DocumentSection | undefined {
  // Find the last section that starts before this position
  for (let i = sections.length - 1; i >= 0; i--) {
    const section = sections[i];
    if (section && section.startChar <= position) {
      return section;
    }
  }
  return undefined;
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Export section detection for use by other modules
 */
export { detectSections };
