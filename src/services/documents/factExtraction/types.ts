/**
 * Fact Extraction Types
 *
 * Phase 6: Document Intelligence - LLM-based extraction of facts, entities,
 * dates, and relationships from document chunks.
 */

// === FACT STATUS ===

const FACT_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'merged',
  'auto_approved',
] as const;

export type FactStatus = (typeof FACT_STATUSES)[number];

// === FACT TYPES ===

export const FACT_TYPES = [
  'biographical',
  'event',
  'relationship',
  'preference',
  'statement',
  'date',
  'location',
  'organization',
] as const;

export type FactType = (typeof FACT_TYPES)[number];

// === ENTITY TYPES (aligned with existing entities.ts) ===

export const ENTITY_TYPES = [
  'person',
  'project',
  'concept',
  'place',
  'organization',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

// === EXTRACTED ENTITY ===

/**
 * An entity extracted from a document chunk
 */
export interface ExtractedFactEntity {
  /** Entity name (normalized) */
  name: string;

  /** Entity type */
  type: EntityType;

  /** Role in the context (e.g., "subject", "employer", "spouse") */
  role?: string;

  /** Extraction confidence 0-1 */
  confidence: number;

  /** Raw text as it appeared in document */
  mentionText?: string;
}

// === EXTRACTED DATE ===

/**
 * Date type categories
 */
export const DATE_TYPES = [
  'event_date',      // When something happened
  'deadline',        // Due date
  'anniversary',     // Recurring significant date
  'birth_date',      // Birthday
  'death_date',      // Memorial
  'start_date',      // Beginning of period
  'end_date',        // End of period
  'reference',       // General date reference
] as const;

export type DateType = (typeof DATE_TYPES)[number];

/**
 * A date extracted from a document chunk
 */
export interface ExtractedFactDate {
  /** Normalized ISO date string (YYYY-MM-DD) */
  date: string;

  /** Date type/purpose */
  type: DateType;

  /** Extraction confidence 0-1 */
  confidence: number;

  /** Raw text as it appeared in document */
  rawText: string;

  /** Whether this is a recurring date (annual) */
  isRecurring?: boolean;
}

// === EXTRACTED RELATIONSHIP ===

/**
 * A relationship between two entities
 */
export interface ExtractedRelationship {
  /** Subject entity name */
  subject: string;

  /** Relationship type/predicate (e.g., "works_at", "married_to", "manages") */
  predicate: string;

  /** Object entity name */
  object: string;

  /** Extraction confidence 0-1 */
  confidence: number;

  /** Human-readable description */
  description?: string;
}

// === EXTRACTED FACT ===

/**
 * A complete fact extracted from a document chunk
 */
export interface ExtractedFact {
  /** Unique ID (UUID) */
  id: string;

  /** Source chunk ID */
  chunkId: string;

  /** Source document object ID */
  objectId: string;

  /** Fact type */
  factType: FactType;

  /** The extracted fact as a clear statement */
  content: string;

  /** Original text from chunk that led to extraction */
  rawText: string;

  /** Extraction confidence 0-1 */
  confidence: number;

  /** Review status */
  status: FactStatus;

  /** When reviewed */
  reviewedAt?: Date;

  /** Reviewer notes */
  reviewerNotes?: string;

  /** Entities mentioned in this fact */
  entities: ExtractedFactEntity[];

  /** Dates extracted from this fact */
  dates: ExtractedFactDate[];

  /** Relationships between entities */
  relationships: ExtractedRelationship[];

  /** Source page number (if available) */
  sourcePage?: number;

  /** Source section title (if available) */
  sourceSection?: string;

  /** Start position in chunk */
  positionStart?: number;

  /** End position in chunk */
  positionEnd?: number;

  /** Created memory ID (after approval) */
  memoryId?: string;

  /** If merged, the fact this was merged into */
  mergedIntoId?: string;

  /** LLM model used for extraction */
  extractionModel?: string;

  /** Extraction prompt version */
  extractionPromptVersion?: string;

  /** Additional metadata */
  metadata: Record<string, unknown>;

  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

// === EXTRACTION OPTIONS ===

/**
 * Options for fact extraction
 */
export interface FactExtractionOptions {
  /** Minimum confidence threshold to include fact (default: 0.5) */
  minConfidence?: number;

  /** Auto-approve facts above this confidence (default: 0.9) */
  autoApproveThreshold?: number;

  /** Include entity extraction (default: true) */
  extractEntities?: boolean;

  /** Include date extraction (default: true) */
  extractDates?: boolean;

  /** Include relationship extraction (default: true) */
  extractRelationships?: boolean;

  /** Maximum facts to extract per chunk (default: 10) */
  maxFactsPerChunk?: number;

  /** Fact types to extract (default: all) */
  factTypes?: FactType[];

  /** Custom extraction prompt (advanced) */
  customPrompt?: string;
}

/**
 * Default extraction options
 */
export const DEFAULT_EXTRACTION_OPTIONS: Required<FactExtractionOptions> = {
  minConfidence: 0.5,
  autoApproveThreshold: 0.9,
  extractEntities: true,
  extractDates: true,
  extractRelationships: true,
  maxFactsPerChunk: 10,
  factTypes: [...FACT_TYPES],
  customPrompt: '',
};

// === EXTRACTION RESULT ===

/**
 * Result of extracting facts from a single chunk
 */
export interface ChunkExtractionResult {
  /** Whether extraction succeeded */
  success: boolean;

  /** Chunk ID processed */
  chunkId: string;

  /** Facts extracted */
  facts: ExtractedFact[];

  /** Total entities across all facts */
  totalEntities: number;

  /** Total dates across all facts */
  totalDates: number;

  /** Total relationships across all facts */
  totalRelationships: number;

  /** Processing duration in ms */
  processingDurationMs: number;

  /** Error if extraction failed */
  error?: string;
}

/**
 * Result of batch extraction from a document
 */
export interface DocumentExtractionResult {
  /** Whether all chunks were processed */
  success: boolean;

  /** Document object ID */
  objectId: string;

  /** Batch ID for tracking */
  batchId: string;

  /** Total chunks processed */
  chunksProcessed: number;

  /** Total facts extracted */
  factsExtracted: number;

  /** Facts auto-approved */
  factsAutoApproved: number;

  /** Per-chunk results */
  chunkResults: ChunkExtractionResult[];

  /** Total processing duration in ms */
  totalDurationMs: number;

  /** Errors encountered */
  errors: string[];
}

// === DATABASE ROW TYPES ===

/**
 * Row type matching the extracted_facts table
 */
export interface ExtractedFactRow {
  id: string;
  chunk_id: string;
  object_id: string;
  fact_type: FactType;
  content: string;
  raw_text: string;
  confidence: number;
  status: FactStatus;
  reviewed_at: Date | null;
  reviewer_notes: string | null;
  entities: ExtractedFactEntity[];
  dates: ExtractedFactDate[];
  relationships: ExtractedRelationship[];
  source_page: number | null;
  source_section: string | null;
  position_start: number | null;
  position_end: number | null;
  memory_id: string | null;
  merged_into_id: string | null;
  extraction_model: string | null;
  extraction_prompt_version: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Row type matching the fact_extraction_batches table
 */
export interface FactExtractionBatchRow {
  id: string;
  object_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_chunks: number;
  processed_chunks: number;
  facts_extracted: number;
  facts_auto_approved: number;
  started_at: Date | null;
  completed_at: Date | null;
  error_message: string | null;
  failed_chunks: string[];
  config: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

// === CONVERSION HELPERS ===

/**
 * Convert database row to ExtractedFact
 */
export function rowToFact(row: ExtractedFactRow): ExtractedFact {
  return {
    id: row.id,
    chunkId: row.chunk_id,
    objectId: row.object_id,
    factType: row.fact_type,
    content: row.content,
    rawText: row.raw_text,
    confidence: Number(row.confidence),
    status: row.status,
    reviewedAt: row.reviewed_at ?? undefined,
    reviewerNotes: row.reviewer_notes ?? undefined,
    entities: row.entities ?? [],
    dates: row.dates ?? [],
    relationships: row.relationships ?? [],
    sourcePage: row.source_page ?? undefined,
    sourceSection: row.source_section ?? undefined,
    positionStart: row.position_start ?? undefined,
    positionEnd: row.position_end ?? undefined,
    memoryId: row.memory_id ?? undefined,
    mergedIntoId: row.merged_into_id ?? undefined,
    extractionModel: row.extraction_model ?? undefined,
    extractionPromptVersion: row.extraction_prompt_version ?? undefined,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

