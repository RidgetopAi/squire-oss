/**
 * Ephemeral Document Processing Service
 *
 * Path 2 of Document Intelligence: Direct-to-LLM without permanent storage.
 * Extracts text from documents and sends directly to LLM for:
 * - Summarization
 * - Q&A
 * - Analysis
 *
 * Includes TTL-based caching for repeated queries on the same document.
 */

import { complete, type LLMMessage } from '../../providers/llm.js';
import { extractFromBuffer } from './extractor.js';
import { countTokens, truncateToTokens } from './chunker/fixedChunker.js';
import * as crypto from 'crypto';

// === TYPES ===

export interface EphemeralDocument {
  /** Hash of document content for cache key */
  hash: string;

  /** Extracted text */
  text: string;

  /** Token count */
  tokenCount: number;

  /** Original filename */
  filename: string;

  /** MIME type */
  mimeType: string;

  /** Extraction timestamp */
  extractedAt: Date;

  /** Metadata from extraction */
  metadata: {
    title?: string;
    author?: string;
    pageCount?: number;
    wordCount: number;
  };
}

export interface SummarizeOptions {
  /** Summary style: brief, detailed, bullet-points */
  style?: 'brief' | 'detailed' | 'bullet-points';

  /** Maximum tokens for summary (default: 500) */
  maxSummaryTokens?: number;

  /** Focus area for summary (optional) */
  focus?: string;
}

export interface SummarizeResult {
  summary: string;
  documentInfo: {
    filename: string;
    tokenCount: number;
    pageCount?: number;
  };
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cached: boolean;
}

export interface AskOptions {
  /** Maximum tokens for answer (default: 1000) */
  maxAnswerTokens?: number;

  /** Include citations in answer */
  includeCitations?: boolean;
}

export interface AskResult {
  answer: string;
  question: string;
  documentInfo: {
    filename: string;
    tokenCount: number;
  };
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cached: boolean;
}

// === CACHE ===

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple TTL cache for ephemeral results
 */
class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttlMs: number;

  constructor(ttlMinutes: number = 30) {
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  set(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.cache.clear();
  }

  /** Clean up expired entries */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  get size(): number {
    return this.cache.size;
  }
}

// Global caches (30 minute TTL)
const documentCache = new TTLCache<EphemeralDocument>(30);
const summaryCache = new TTLCache<SummarizeResult>(30);
const answerCache = new TTLCache<AskResult>(30);

// Prune caches periodically (every 5 minutes)
setInterval(() => {
  documentCache.prune();
  summaryCache.prune();
  answerCache.prune();
}, 5 * 60 * 1000);

// === HELPER FUNCTIONS ===

/**
 * Generate hash for document content
 */
function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

/**
 * Generate cache key for summaries
 */
function summaryKey(docHash: string, options: SummarizeOptions): string {
  return `sum:${docHash}:${options.style ?? 'brief'}:${options.focus ?? ''}`;
}

/**
 * Generate cache key for answers
 */
function answerKey(docHash: string, question: string): string {
  const questionHash = crypto.createHash('sha256').update(question).digest('hex').slice(0, 8);
  return `ask:${docHash}:${questionHash}`;
}

// === MAIN FUNCTIONS ===

/**
 * Extract document text for ephemeral processing
 *
 * Extracts text from a document buffer without storing to database.
 * Results are cached for the TTL period.
 */
export async function extractEphemeral(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<EphemeralDocument> {
  const hash = hashBuffer(buffer);

  // Check cache
  const cached = documentCache.get(hash);
  if (cached) {
    return cached;
  }

  // Extract text
  const result = await extractFromBuffer(buffer, mimeType);

  if (!result.success || !result.document) {
    throw new Error(result.error ?? 'Document extraction failed');
  }

  const doc: EphemeralDocument = {
    hash,
    text: result.document.text,
    tokenCount: countTokens(result.document.text),
    filename,
    mimeType,
    extractedAt: new Date(),
    metadata: {
      title: result.document.metadata.title,
      author: result.document.metadata.author,
      pageCount: result.document.metadata.pageCount,
      wordCount: result.document.metadata.wordCount,
    },
  };

  // Cache the extracted document
  documentCache.set(hash, doc);

  return doc;
}

/**
 * Summarize a document using LLM
 *
 * Extracts text and sends to LLM for summarization.
 * Results are cached.
 */
export async function summarizeDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  options: SummarizeOptions = {}
): Promise<SummarizeResult> {
  const { style = 'brief', maxSummaryTokens = 500, focus } = options;

  // Extract document
  const doc = await extractEphemeral(buffer, mimeType, filename);

  // Check summary cache
  const cacheKey = summaryKey(doc.hash, options);
  const cached = summaryCache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  // Build prompt based on style
  let styleInstructions = '';
  switch (style) {
    case 'brief':
      styleInstructions = 'Provide a concise summary in 2-3 sentences.';
      break;
    case 'detailed':
      styleInstructions = 'Provide a comprehensive summary covering all main points.';
      break;
    case 'bullet-points':
      styleInstructions = 'Summarize as a bulleted list of key points.';
      break;
  }

  const focusInstructions = focus ? `\n\nFocus particularly on: ${focus}` : '';

  // Truncate document if too long (leave room for prompt and response)
  const maxDocTokens = 30000; // Leave room for prompt overhead
  const docText = doc.tokenCount > maxDocTokens
    ? truncateToTokens(doc.text, maxDocTokens) + '\n\n[Document truncated due to length]'
    : doc.text;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are a document summarization assistant. ${styleInstructions}${focusInstructions}`,
    },
    {
      role: 'user',
      content: `Please summarize the following document:\n\n---\n\n${docText}`,
    },
  ];

  const result = await complete(messages, {
    maxTokens: maxSummaryTokens,
    temperature: 0.3, // Lower temperature for more focused summaries
  });

  const summarizeResult: SummarizeResult = {
    summary: result.content,
    documentInfo: {
      filename: doc.filename,
      tokenCount: doc.tokenCount,
      pageCount: doc.metadata.pageCount,
    },
    usage: result.usage,
    cached: false,
  };

  // Cache the result
  summaryCache.set(cacheKey, summarizeResult);

  return summarizeResult;
}

/**
 * Ask a question about a document
 *
 * Extracts text and sends to LLM with the question.
 * Results are cached per question.
 */
export async function askDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  question: string,
  options: AskOptions = {}
): Promise<AskResult> {
  const { maxAnswerTokens = 1000, includeCitations = true } = options;

  // Extract document
  const doc = await extractEphemeral(buffer, mimeType, filename);

  // Check answer cache
  const cacheKey = answerKey(doc.hash, question);
  const cached = answerCache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  // Build prompt
  const citationInstructions = includeCitations
    ? 'When possible, reference specific parts of the document to support your answer.'
    : '';

  // Truncate document if too long
  const maxDocTokens = 30000;
  const docText = doc.tokenCount > maxDocTokens
    ? truncateToTokens(doc.text, maxDocTokens) + '\n\n[Document truncated due to length]'
    : doc.text;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are a document analysis assistant. Answer questions based on the provided document. ${citationInstructions} If the document doesn't contain information to answer the question, say so clearly.`,
    },
    {
      role: 'user',
      content: `Document:\n\n---\n\n${docText}\n\n---\n\nQuestion: ${question}`,
    },
  ];

  const result = await complete(messages, {
    maxTokens: maxAnswerTokens,
    temperature: 0.4,
  });

  const askResult: AskResult = {
    answer: result.content,
    question,
    documentInfo: {
      filename: doc.filename,
      tokenCount: doc.tokenCount,
    },
    usage: result.usage,
    cached: false,
  };

  // Cache the result
  answerCache.set(cacheKey, askResult);

  return askResult;
}

// === CACHE MANAGEMENT ===

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  documents: number;
  summaries: number;
  answers: number;
} {
  return {
    documents: documentCache.size,
    summaries: summaryCache.size,
    answers: answerCache.size,
  };
}

/**
 * Clear all ephemeral caches
 */
export function clearCaches(): void {
  documentCache.clear();
  summaryCache.clear();
  answerCache.clear();
}

