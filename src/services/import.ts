import { pool } from '../db/pool.js';
import { generateEmbedding } from '../providers/embeddings.js';
import { calculateSalience } from './salience.js';
import { extractAndStoreEntities } from './entities.js';
import { Memory } from './memories.js';

export interface ImportMemory {
  content: string;
  occurred_at?: string;
  source?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: number;
  memories: Array<{
    id: string;
    content: string;
    salience: number;
    entities: number;
  }>;
  errorDetails: string[];
}

export interface ImportOptions {
  /** Skip duplicate content check */
  allowDuplicates?: boolean;
  /** Skip entity extraction (faster) */
  skipEntities?: boolean;
  /** Minimum content length to import */
  minLength?: number;
  /** Log progress callback */
  onProgress?: (current: number, total: number, content: string) => void;
}

/**
 * Check if a memory with similar content already exists
 */
async function isDuplicate(content: string): Promise<boolean> {
  // Check for exact match first
  const exactResult = await pool.query(
    `SELECT id FROM memories WHERE content = $1 LIMIT 1`,
    [content]
  );
  if (exactResult.rows.length > 0) {
    return true;
  }

  // Check for high similarity match (>95%)
  const embedding = await generateEmbedding(content);
  const embeddingStr = `[${embedding.join(',')}]`;

  const similarResult = await pool.query(
    `SELECT id FROM memories
     WHERE embedding IS NOT NULL
       AND 1 - (embedding <=> $1::vector) > 0.95
     LIMIT 1`,
    [embeddingStr]
  );

  return similarResult.rows.length > 0;
}

/**
 * Import a single memory
 */
async function importSingleMemory(
  input: ImportMemory,
  options: ImportOptions
): Promise<{ memory: Memory; entityCount: number } | null> {
  const {
    content,
    occurred_at,
    source = 'import',
    tags = [],
    metadata = {},
  } = input;

  // Check for duplicates
  if (!options.allowDuplicates) {
    const duplicate = await isDuplicate(content);
    if (duplicate) {
      return null;
    }
  }

  // Generate embedding
  const embedding = await generateEmbedding(content);
  const embeddingStr = `[${embedding.join(',')}]`;

  // Calculate salience
  const salience = calculateSalience(content);

  // Parse occurred_at if provided
  const occurredAt = occurred_at ? new Date(occurred_at) : null;

  // Build source metadata with tags
  const sourceMetadata = {
    ...metadata,
    import_tags: tags,
    imported_at: new Date().toISOString(),
  };

  // First, store raw observation
  const rawObsResult = await pool.query(
    `INSERT INTO raw_observations (content, content_type, source, source_metadata, occurred_at)
     VALUES ($1, 'text', $2, $3, $4)
     RETURNING id`,
    [content, source, JSON.stringify(sourceMetadata), occurredAt]
  );
  const rawObservationId = rawObsResult.rows[0]?.id as string;

  // Create the memory
  const result = await pool.query(
    `INSERT INTO memories (
      raw_observation_id, content, content_type, source, source_metadata,
      embedding, salience_score, salience_factors, occurred_at, processing_status, processed_at
    )
     VALUES ($1, $2, 'text', $3, $4, $5, $6, $7, $8, 'processed', NOW())
     RETURNING *`,
    [
      rawObservationId,
      content,
      source,
      JSON.stringify(sourceMetadata),
      embeddingStr,
      salience.score,
      JSON.stringify(salience.factors),
      occurredAt,
    ]
  );

  const memory = result.rows[0] as Memory;

  // Extract entities if not skipped
  let entityCount = 0;
  if (!options.skipEntities) {
    const extraction = await extractAndStoreEntities(memory.id, content);
    entityCount = extraction.entities.length;
  }

  return { memory, entityCount };
}

/**
 * Parse import file content (supports JSONL or JSON array)
 */
export function parseImportFile(content: string): ImportMemory[] {
  const trimmed = content.trim();

  // Try parsing as JSON array first
  if (trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as ImportMemory[];
    } catch {
      // Fall through to JSONL
    }
  }

  // Parse as JSONL (one JSON object per line)
  const memories: ImportMemory[] = [];
  const lines = trimmed.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) {
      continue; // Skip empty lines and comments
    }

    try {
      const parsed = JSON.parse(trimmedLine) as ImportMemory;
      if (parsed.content) {
        memories.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return memories;
}

/**
 * Import multiple memories from parsed data
 */
export async function importMemories(
  memories: ImportMemory[],
  options: ImportOptions = {}
): Promise<ImportResult> {
  const { minLength = 10, onProgress } = options;

  const result: ImportResult = {
    total: memories.length,
    imported: 0,
    skipped: 0,
    errors: 0,
    memories: [],
    errorDetails: [],
  };

  for (const [i, memory] of memories.entries()) {
    // Progress callback
    if (onProgress) {
      const preview = memory.content.length > 50
        ? memory.content.substring(0, 50) + '...'
        : memory.content;
      onProgress(i + 1, memories.length, preview);
    }

    // Skip if too short
    if (memory.content.length < minLength) {
      result.skipped++;
      continue;
    }

    try {
      const imported = await importSingleMemory(memory, options);

      if (imported) {
        result.imported++;
        result.memories.push({
          id: imported.memory.id,
          content: memory.content.substring(0, 100),
          salience: imported.memory.salience_score,
          entities: imported.entityCount,
        });
      } else {
        result.skipped++; // Duplicate
      }
    } catch (error) {
      result.errors++;
      result.errorDetails.push(
        `Error importing "${memory.content.substring(0, 50)}...": ${error}`
      );
    }
  }

  return result;
}

/**
 * Get import statistics
 */
export async function getImportStats(): Promise<{
  totalImported: number;
  bySources: Record<string, number>;
  dateRange: { oldest: Date | null; newest: Date | null };
}> {
  const countResult = await pool.query(`
    SELECT source, COUNT(*) as count
    FROM memories
    WHERE source NOT IN ('cli', 'api')
    GROUP BY source
  `);

  const bySources: Record<string, number> = {};
  let totalImported = 0;
  for (const row of countResult.rows) {
    bySources[row.source] = parseInt(row.count, 10);
    totalImported += parseInt(row.count, 10);
  }

  const dateResult = await pool.query(`
    SELECT
      MIN(occurred_at) as oldest,
      MAX(occurred_at) as newest
    FROM memories
    WHERE occurred_at IS NOT NULL
  `);

  const dates = dateResult.rows[0];

  return {
    totalImported,
    bySources,
    dateRange: {
      oldest: dates.oldest ? new Date(dates.oldest) : null,
      newest: dates.newest ? new Date(dates.newest) : null,
    },
  };
}
