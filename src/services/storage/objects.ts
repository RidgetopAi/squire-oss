/**
 * Object Storage Service (Slice 7F)
 *
 * Manages files, images, and documents attached to memories and entities.
 * Supports local storage with metadata, tagging, and semantic search.
 */

import { pool } from '../../db/pool.js';
import { generateEmbedding } from '../../providers/embeddings.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// === TYPES ===

export const OBJECT_TYPES = ['image', 'document', 'audio', 'video', 'archive', 'other'] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export const STORAGE_TYPES = ['local', 's3', 'url'] as const;
export type StorageType = (typeof STORAGE_TYPES)[number];

export const OBJECT_SOURCES = ['upload', 'import', 'extract', 'generate'] as const;
export type ObjectSource = (typeof OBJECT_SOURCES)[number];

export const OBJECT_STATUSES = ['active', 'archived', 'deleted'] as const;
export type ObjectStatus = (typeof OBJECT_STATUSES)[number];

export const PROCESSING_STATUSES = ['pending', 'processing', 'completed', 'failed', 'skipped'] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const MEMORY_LINK_TYPES = ['attachment', 'source', 'reference', 'illustration'] as const;
export type MemoryLinkType = (typeof MEMORY_LINK_TYPES)[number];

export const ENTITY_LINK_TYPES = ['depicts', 'represents', 'created_by', 'about', 'owned_by'] as const;
export type EntityLinkType = (typeof ENTITY_LINK_TYPES)[number];

export const DETECTION_METHODS = ['manual', 'face_detection', 'mention', 'llm', 'import'] as const;
export type DetectionMethod = (typeof DETECTION_METHODS)[number];

export const TAG_SOURCES = ['user', 'auto', 'import'] as const;
export type TagSource = (typeof TAG_SOURCES)[number];

export interface StoredObject {
  id: string;
  name: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  hash_sha256: string | null;
  storage_type: StorageType;
  storage_path: string;
  object_type: ObjectType;
  extracted_text: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  embedding: number[] | null;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  processed_at: Date | null;
  thumbnail_path: string | null;
  source: ObjectSource;
  source_url: string | null;
  status: ObjectStatus;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ObjectMemoryLink {
  id: string;
  object_id: string;
  memory_id: string;
  link_type: MemoryLinkType;
  relevance: number;
  notes: string | null;
  created_at: Date;
}

export interface ObjectEntityLink {
  id: string;
  object_id: string;
  entity_id: string;
  link_type: EntityLinkType;
  confidence: number;
  notes: string | null;
  detection_method: DetectionMethod;
  created_at: Date;
}

export interface ObjectTag {
  id: string;
  object_id: string;
  tag: string;
  source: TagSource;
  created_at: Date;
}

export interface ObjectCollection {
  id: string;
  name: string;
  description: string | null;
  cover_object_id: string | null;
  object_count: number;
  created_at: Date;
  updated_at: Date;
}

// === CONFIGURATION ===

// Default storage directory (relative to project root)
const STORAGE_BASE = process.env['SQUIRE_STORAGE_PATH'] || './storage/objects';

/**
 * Ensure storage directory exists
 */
async function ensureStorageDir(subdir: string = ''): Promise<string> {
  const dir = path.join(STORAGE_BASE, subdir);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Calculate SHA-256 hash of a buffer
 */
function calculateHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Determine object type from mime type
 */
function getObjectTypeFromMime(mimeType: string): ObjectType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/pdf' ||
    mimeType.includes('document') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('presentation')
  ) {
    return 'document';
  }
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-tar' ||
    mimeType === 'application/gzip' ||
    mimeType === 'application/x-rar-compressed'
  ) {
    return 'archive';
  }
  return 'other';
}

// === OBJECT CRUD ===

export interface CreateObjectInput {
  name: string;
  filename: string;
  mimeType: string;
  data: Buffer;
  description?: string;
  source?: ObjectSource;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface CreateObjectResult {
  object: StoredObject;
  tags: ObjectTag[];
  isDuplicate: boolean;
  existingId?: string;
}

/**
 * Store a new object
 */
export async function createObject(input: CreateObjectInput): Promise<CreateObjectResult> {
  const {
    name,
    filename,
    mimeType,
    data,
    description,
    source = 'upload',
    sourceUrl,
    metadata = {},
  } = input;

  // Calculate hash for deduplication
  const hash = calculateHash(data);

  // Check for duplicate
  const dupCheck = await pool.query(
    `SELECT id FROM objects WHERE hash_sha256 = $1 AND status = 'active'`,
    [hash]
  );

  if (dupCheck.rows.length > 0) {
    const existingId = dupCheck.rows[0].id as string;
    const existing = await getObjectById(existingId);
    return {
      object: existing!,
      tags: await getObjectTags(existingId),
      isDuplicate: true,
      existingId,
    };
  }

  // Determine object type and storage path
  const objectType = getObjectTypeFromMime(mimeType);
  const datePrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
  const storageSubdir = `${objectType}/${datePrefix}`;
  await ensureStorageDir(storageSubdir);

  // Generate unique filename
  const ext = path.extname(filename) || '';
  const uniqueFilename = `${crypto.randomUUID()}${ext}`;
  const storagePath = path.join(storageSubdir, uniqueFilename);
  const fullPath = path.join(STORAGE_BASE, storagePath);

  // Write file to disk
  await fs.writeFile(fullPath, data);

  // Insert into database
  const result = await pool.query(
    `INSERT INTO objects (
      name, filename, mime_type, size_bytes, hash_sha256,
      storage_type, storage_path, object_type,
      description, metadata, source, source_url,
      processing_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      name,
      filename,
      mimeType,
      data.length,
      hash,
      'local',
      storagePath,
      objectType,
      description || null,
      JSON.stringify(metadata),
      source,
      sourceUrl || null,
      'pending',
    ]
  );

  const object = mapRowToObject(result.rows[0]);

  // Add tags if provided
  const tags: ObjectTag[] = [];
  if (input.tags && input.tags.length > 0) {
    for (const tag of input.tags) {
      const tagResult = await addTag(object.id, tag, 'user');
      if (tagResult) tags.push(tagResult);
    }
  }

  return { object, tags, isDuplicate: false };
}

/**
 * Get object by ID
 */
export async function getObjectById(id: string): Promise<StoredObject | null> {
  const result = await pool.query(`SELECT * FROM objects WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return mapRowToObject(result.rows[0]);
}

export interface ListObjectsOptions {
  limit?: number;
  offset?: number;
  objectType?: ObjectType;
  status?: ObjectStatus;
  processingStatus?: ProcessingStatus;
  tag?: string;
  search?: string;
}

/**
 * List objects with filtering
 */
export async function listObjects(options: ListObjectsOptions = {}): Promise<StoredObject[]> {
  const { limit = 50, offset = 0, objectType, status = 'active', processingStatus, tag, search } = options;

  let query = `SELECT o.* FROM objects o`;
  const params: unknown[] = [];
  const conditions: string[] = [];
  let paramIndex = 1;

  // Join for tag filtering
  if (tag) {
    query += ` JOIN object_tags t ON o.id = t.object_id`;
    conditions.push(`t.tag = $${paramIndex++}`);
    params.push(tag.toLowerCase());
  }

  // Status filter
  conditions.push(`o.status = $${paramIndex++}`);
  params.push(status);

  if (objectType) {
    conditions.push(`o.object_type = $${paramIndex++}`);
    params.push(objectType);
  }

  if (processingStatus) {
    conditions.push(`o.processing_status = $${paramIndex++}`);
    params.push(processingStatus);
  }

  if (search) {
    conditions.push(`(o.name ILIKE $${paramIndex} OR o.filename ILIKE $${paramIndex} OR o.description ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDER BY o.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows.map(mapRowToObject);
}

/**
 * Update object metadata
 */
export async function updateObject(
  id: string,
  updates: {
    name?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    status?: ObjectStatus;
  }
): Promise<StoredObject | null> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    params.push(updates.name);
  }

  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    params.push(updates.description);
  }

  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIndex++}`);
    params.push(JSON.stringify(updates.metadata));
  }

  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    params.push(updates.status);
    if (updates.status === 'deleted') {
      setClauses.push(`deleted_at = NOW()`);
    }
  }

  params.push(id);

  const result = await pool.query(
    `UPDATE objects SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  );

  if (result.rows.length === 0) return null;
  return mapRowToObject(result.rows[0]);
}

/**
 * Soft delete an object
 */
export async function deleteObject(id: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE objects SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status != 'deleted'
     RETURNING id`,
    [id]
  );
  return result.rows.length > 0;
}

/**
 * Get object file data
 */
export async function getObjectData(id: string): Promise<Buffer | null> {
  const obj = await getObjectById(id);
  if (!obj || obj.status === 'deleted') return null;

  if (obj.storage_type !== 'local') {
    throw new Error(`Storage type ${obj.storage_type} not yet supported for reading`);
  }

  const fullPath = path.join(STORAGE_BASE, obj.storage_path);
  try {
    return await fs.readFile(fullPath);
  } catch {
    return null;
  }
}

// === MEMORY LINKS ===

/**
 * Link an object to a memory
 */
export async function linkToMemory(
  objectId: string,
  memoryId: string,
  linkType: MemoryLinkType = 'attachment',
  options: { relevance?: number; notes?: string } = {}
): Promise<ObjectMemoryLink> {
  const { relevance = 0.5, notes } = options;

  const result = await pool.query(
    `INSERT INTO object_memory_links (object_id, memory_id, link_type, relevance, notes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (object_id, memory_id) DO UPDATE SET
       link_type = EXCLUDED.link_type,
       relevance = EXCLUDED.relevance,
       notes = EXCLUDED.notes
     RETURNING *`,
    [objectId, memoryId, linkType, relevance, notes || null]
  );

  return mapRowToMemoryLink(result.rows[0]);
}

/**
 * Remove link between object and memory
 */
export async function unlinkFromMemory(objectId: string, memoryId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM object_memory_links WHERE object_id = $1 AND memory_id = $2 RETURNING id`,
    [objectId, memoryId]
  );
  return result.rows.length > 0;
}

/**
 * Get objects linked to a memory
 */
export async function getObjectsForMemory(memoryId: string): Promise<(StoredObject & { link: ObjectMemoryLink })[]> {
  const result = await pool.query(
    `SELECT o.*, l.id as link_id, l.link_type, l.relevance, l.notes, l.created_at as link_created_at
     FROM objects o
     JOIN object_memory_links l ON o.id = l.object_id
     WHERE l.memory_id = $1 AND o.status = 'active'
     ORDER BY l.relevance DESC, o.created_at DESC`,
    [memoryId]
  );

  return result.rows.map((row) => ({
    ...mapRowToObject(row),
    link: {
      id: row.link_id,
      object_id: row.id,
      memory_id: memoryId,
      link_type: row.link_type,
      relevance: row.relevance,
      notes: row.notes,
      created_at: row.link_created_at,
    },
  }));
}

/**
 * Get memories linked to an object
 */
export async function getMemoriesForObject(objectId: string): Promise<ObjectMemoryLink[]> {
  const result = await pool.query(
    `SELECT * FROM object_memory_links WHERE object_id = $1 ORDER BY created_at DESC`,
    [objectId]
  );
  return result.rows.map(mapRowToMemoryLink);
}

// === ENTITY LINKS ===

/**
 * Link an object to an entity
 */
export async function linkToEntity(
  objectId: string,
  entityId: string,
  linkType: EntityLinkType = 'about',
  options: { confidence?: number; notes?: string; detectionMethod?: DetectionMethod } = {}
): Promise<ObjectEntityLink> {
  const { confidence = 0.5, notes, detectionMethod = 'manual' } = options;

  const result = await pool.query(
    `INSERT INTO object_entity_links (object_id, entity_id, link_type, confidence, notes, detection_method)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (object_id, entity_id, link_type) DO UPDATE SET
       confidence = EXCLUDED.confidence,
       notes = EXCLUDED.notes,
       detection_method = EXCLUDED.detection_method
     RETURNING *`,
    [objectId, entityId, linkType, confidence, notes || null, detectionMethod]
  );

  return mapRowToEntityLink(result.rows[0]);
}

/**
 * Remove link between object and entity
 */
export async function unlinkFromEntity(
  objectId: string,
  entityId: string,
  linkType?: EntityLinkType
): Promise<boolean> {
  let query = `DELETE FROM object_entity_links WHERE object_id = $1 AND entity_id = $2`;
  const params: unknown[] = [objectId, entityId];

  if (linkType) {
    query += ` AND link_type = $3`;
    params.push(linkType);
  }

  query += ` RETURNING id`;
  const result = await pool.query(query, params);
  return result.rows.length > 0;
}

/**
 * Get objects linked to an entity
 */
export async function getObjectsForEntity(entityId: string): Promise<(StoredObject & { link: ObjectEntityLink })[]> {
  const result = await pool.query(
    `SELECT o.*, l.id as link_id, l.link_type, l.confidence, l.notes, l.detection_method, l.created_at as link_created_at
     FROM objects o
     JOIN object_entity_links l ON o.id = l.object_id
     WHERE l.entity_id = $1 AND o.status = 'active'
     ORDER BY l.confidence DESC, o.created_at DESC`,
    [entityId]
  );

  return result.rows.map((row) => ({
    ...mapRowToObject(row),
    link: {
      id: row.link_id,
      object_id: row.id,
      entity_id: entityId,
      link_type: row.link_type,
      confidence: row.confidence,
      notes: row.notes,
      detection_method: row.detection_method,
      created_at: row.link_created_at,
    },
  }));
}

/**
 * Get entities linked to an object
 */
export async function getEntitiesForObject(objectId: string): Promise<ObjectEntityLink[]> {
  const result = await pool.query(
    `SELECT * FROM object_entity_links WHERE object_id = $1 ORDER BY confidence DESC, created_at DESC`,
    [objectId]
  );
  return result.rows.map(mapRowToEntityLink);
}

// === TAGS ===

/**
 * Add a tag to an object
 */
export async function addTag(
  objectId: string,
  tag: string,
  source: TagSource = 'user'
): Promise<ObjectTag | null> {
  const normalizedTag = tag.toLowerCase().trim();
  if (!normalizedTag) return null;

  try {
    const result = await pool.query(
      `INSERT INTO object_tags (object_id, tag, source)
       VALUES ($1, $2, $3)
       ON CONFLICT (object_id, tag) DO NOTHING
       RETURNING *`,
      [objectId, normalizedTag, source]
    );

    if (result.rows.length === 0) {
      // Tag already exists, fetch it
      const existing = await pool.query(
        `SELECT * FROM object_tags WHERE object_id = $1 AND tag = $2`,
        [objectId, normalizedTag]
      );
      return existing.rows.length > 0 ? mapRowToTag(existing.rows[0]) : null;
    }

    return mapRowToTag(result.rows[0]);
  } catch {
    return null;
  }
}

/**
 * Remove a tag from an object
 */
export async function removeTag(objectId: string, tag: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM object_tags WHERE object_id = $1 AND tag = $2 RETURNING id`,
    [objectId, tag.toLowerCase().trim()]
  );
  return result.rows.length > 0;
}

/**
 * Get tags for an object
 */
export async function getObjectTags(objectId: string): Promise<ObjectTag[]> {
  const result = await pool.query(
    `SELECT * FROM object_tags WHERE object_id = $1 ORDER BY tag`,
    [objectId]
  );
  return result.rows.map(mapRowToTag);
}

/**
 * Get all unique tags with counts
 */
export async function getAllTags(): Promise<{ tag: string; count: number }[]> {
  const result = await pool.query(
    `SELECT tag, COUNT(*) as count
     FROM object_tags t
     JOIN objects o ON t.object_id = o.id
     WHERE o.status = 'active'
     GROUP BY tag
     ORDER BY count DESC, tag`
  );
  return result.rows.map((row) => ({ tag: row.tag, count: parseInt(row.count, 10) }));
}

// === COLLECTIONS ===

/**
 * Create a collection
 */
export async function createCollection(
  name: string,
  description?: string
): Promise<ObjectCollection> {
  const result = await pool.query(
    `INSERT INTO object_collections (name, description)
     VALUES ($1, $2)
     RETURNING *`,
    [name, description || null]
  );
  return mapRowToCollection(result.rows[0]);
}

/**
 * Get collection by ID
 */
export async function getCollectionById(id: string): Promise<ObjectCollection | null> {
  const result = await pool.query(`SELECT * FROM object_collections WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return mapRowToCollection(result.rows[0]);
}

/**
 * List all collections
 */
export async function listCollections(): Promise<ObjectCollection[]> {
  const result = await pool.query(
    `SELECT * FROM object_collections ORDER BY updated_at DESC`
  );
  return result.rows.map(mapRowToCollection);
}

/**
 * Add object to collection
 */
export async function addToCollection(
  collectionId: string,
  objectId: string,
  position?: number
): Promise<boolean> {
  try {
    // Get next position if not specified
    if (position === undefined) {
      const posResult = await pool.query(
        `SELECT COALESCE(MAX(position), -1) + 1 as next_pos
         FROM object_collection_items WHERE collection_id = $1`,
        [collectionId]
      );
      position = posResult.rows[0].next_pos;
    }

    await pool.query(
      `INSERT INTO object_collection_items (collection_id, object_id, position)
       VALUES ($1, $2, $3)
       ON CONFLICT (collection_id, object_id) DO UPDATE SET position = EXCLUDED.position`,
      [collectionId, objectId, position]
    );

    // Update collection count
    await pool.query(
      `UPDATE object_collections SET
         object_count = (SELECT COUNT(*) FROM object_collection_items WHERE collection_id = $1),
         updated_at = NOW()
       WHERE id = $1`,
      [collectionId]
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Remove object from collection
 */
export async function removeFromCollection(collectionId: string, objectId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM object_collection_items WHERE collection_id = $1 AND object_id = $2 RETURNING id`,
    [collectionId, objectId]
  );

  if (result.rows.length > 0) {
    // Update collection count
    await pool.query(
      `UPDATE object_collections SET
         object_count = (SELECT COUNT(*) FROM object_collection_items WHERE collection_id = $1),
         updated_at = NOW()
       WHERE id = $1`,
      [collectionId]
    );
    return true;
  }
  return false;
}

/**
 * Get objects in a collection
 */
export async function getCollectionObjects(collectionId: string): Promise<StoredObject[]> {
  const result = await pool.query(
    `SELECT o.* FROM objects o
     JOIN object_collection_items i ON o.id = i.object_id
     WHERE i.collection_id = $1 AND o.status = 'active'
     ORDER BY i.position`,
    [collectionId]
  );
  return result.rows.map(mapRowToObject);
}

// === PROCESSING ===

/**
 * Update object processing status
 */
export async function updateProcessingStatus(
  id: string,
  status: ProcessingStatus,
  options: {
    extractedText?: string;
    thumbnailPath?: string;
    embedding?: number[];
    error?: string;
  } = {}
): Promise<StoredObject | null> {
  const setClauses: string[] = ['processing_status = $1', 'updated_at = NOW()'];
  const params: unknown[] = [status];
  let paramIndex = 2;

  if (status === 'completed' || status === 'failed') {
    setClauses.push(`processed_at = NOW()`);
  }

  if (options.extractedText !== undefined) {
    setClauses.push(`extracted_text = $${paramIndex++}`);
    params.push(options.extractedText);
  }

  if (options.thumbnailPath !== undefined) {
    setClauses.push(`thumbnail_path = $${paramIndex++}`);
    params.push(options.thumbnailPath);
  }

  if (options.embedding !== undefined) {
    setClauses.push(`embedding = $${paramIndex++}`);
    params.push(`[${options.embedding.join(',')}]`);
  }

  if (options.error !== undefined) {
    setClauses.push(`processing_error = $${paramIndex++}`);
    params.push(options.error);
  }

  params.push(id);

  const result = await pool.query(
    `UPDATE objects SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  );

  if (result.rows.length === 0) return null;
  return mapRowToObject(result.rows[0]);
}

/**
 * Generate embedding for an object (from description or extracted text)
 */
export async function generateObjectEmbedding(id: string): Promise<boolean> {
  const obj = await getObjectById(id);
  if (!obj) return false;

  const textToEmbed = obj.description || obj.extracted_text || obj.name;
  if (!textToEmbed) return false;

  try {
    const embedding = await generateEmbedding(textToEmbed);
    await updateProcessingStatus(id, obj.processing_status, { embedding });
    return true;
  } catch {
    return false;
  }
}

// === SEARCH ===

/**
 * Semantic search for objects
 */
export async function searchObjectsSemantic(
  query: string,
  options: { limit?: number; objectType?: ObjectType } = {}
): Promise<(StoredObject & { similarity: number })[]> {
  const { limit = 20, objectType } = options;

  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  let queryStr = `
    SELECT o.*, 1 - (o.embedding <=> $1::vector) as similarity
    FROM objects o
    WHERE o.status = 'active'
      AND o.embedding IS NOT NULL
  `;
  const params: unknown[] = [embeddingStr];
  let paramIndex = 2;

  if (objectType) {
    queryStr += ` AND o.object_type = $${paramIndex++}`;
    params.push(objectType);
  }

  queryStr += ` ORDER BY similarity DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await pool.query(queryStr, params);
  return result.rows.map((row) => ({
    ...mapRowToObject(row),
    similarity: parseFloat(row.similarity),
  }));
}

// === STATS ===

export interface ObjectStats {
  total: number;
  by_type: Record<ObjectType, number>;
  by_status: Record<ObjectStatus, number>;
  by_processing: Record<ProcessingStatus, number>;
  total_size_bytes: number;
  tag_count: number;
  collection_count: number;
  memory_links: number;
  entity_links: number;
}

/**
 * Get object statistics
 */
export async function getObjectStats(): Promise<ObjectStats> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE object_type = 'image') as images,
      COUNT(*) FILTER (WHERE object_type = 'document') as documents,
      COUNT(*) FILTER (WHERE object_type = 'audio') as audio,
      COUNT(*) FILTER (WHERE object_type = 'video') as video,
      COUNT(*) FILTER (WHERE object_type = 'archive') as archives,
      COUNT(*) FILTER (WHERE object_type = 'other') as other_type,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE status = 'archived') as archived,
      COUNT(*) FILTER (WHERE status = 'deleted') as deleted,
      COUNT(*) FILTER (WHERE processing_status = 'pending') as pending,
      COUNT(*) FILTER (WHERE processing_status = 'processing') as processing,
      COUNT(*) FILTER (WHERE processing_status = 'completed') as completed,
      COUNT(*) FILTER (WHERE processing_status = 'failed') as failed,
      COUNT(*) FILTER (WHERE processing_status = 'skipped') as skipped,
      COALESCE(SUM(size_bytes), 0) as total_size
    FROM objects
  `);

  const tagCountResult = await pool.query(`SELECT COUNT(DISTINCT tag) as count FROM object_tags`);
  const collectionResult = await pool.query(`SELECT COUNT(*) as count FROM object_collections`);
  const memoryLinksResult = await pool.query(`SELECT COUNT(*) as count FROM object_memory_links`);
  const entityLinksResult = await pool.query(`SELECT COUNT(*) as count FROM object_entity_links`);

  const row = result.rows[0];
  return {
    total: parseInt(row.total, 10),
    by_type: {
      image: parseInt(row.images, 10),
      document: parseInt(row.documents, 10),
      audio: parseInt(row.audio, 10),
      video: parseInt(row.video, 10),
      archive: parseInt(row.archives, 10),
      other: parseInt(row.other_type, 10),
    },
    by_status: {
      active: parseInt(row.active, 10),
      archived: parseInt(row.archived, 10),
      deleted: parseInt(row.deleted, 10),
    },
    by_processing: {
      pending: parseInt(row.pending, 10),
      processing: parseInt(row.processing, 10),
      completed: parseInt(row.completed, 10),
      failed: parseInt(row.failed, 10),
      skipped: parseInt(row.skipped, 10),
    },
    total_size_bytes: parseInt(row.total_size, 10),
    tag_count: parseInt(tagCountResult.rows[0].count, 10),
    collection_count: parseInt(collectionResult.rows[0].count, 10),
    memory_links: parseInt(memoryLinksResult.rows[0].count, 10),
    entity_links: parseInt(entityLinksResult.rows[0].count, 10),
  };
}

// === ROW MAPPERS ===

function mapRowToObject(row: Record<string, unknown>): StoredObject {
  return {
    id: row.id as string,
    name: row.name as string,
    filename: row.filename as string,
    mime_type: row.mime_type as string,
    size_bytes: parseInt(row.size_bytes as string, 10),
    hash_sha256: row.hash_sha256 as string | null,
    storage_type: row.storage_type as StorageType,
    storage_path: row.storage_path as string,
    object_type: row.object_type as ObjectType,
    extracted_text: row.extracted_text as string | null,
    description: row.description as string | null,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    embedding: row.embedding as number[] | null,
    processing_status: row.processing_status as ProcessingStatus,
    processing_error: row.processing_error as string | null,
    processed_at: row.processed_at ? new Date(row.processed_at as string) : null,
    thumbnail_path: row.thumbnail_path as string | null,
    source: row.source as ObjectSource,
    source_url: row.source_url as string | null,
    status: row.status as ObjectStatus,
    deleted_at: row.deleted_at ? new Date(row.deleted_at as string) : null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

function mapRowToMemoryLink(row: Record<string, unknown>): ObjectMemoryLink {
  return {
    id: row.id as string,
    object_id: row.object_id as string,
    memory_id: row.memory_id as string,
    link_type: row.link_type as MemoryLinkType,
    relevance: parseFloat(row.relevance as string),
    notes: row.notes as string | null,
    created_at: new Date(row.created_at as string),
  };
}

function mapRowToEntityLink(row: Record<string, unknown>): ObjectEntityLink {
  return {
    id: row.id as string,
    object_id: row.object_id as string,
    entity_id: row.entity_id as string,
    link_type: row.link_type as EntityLinkType,
    confidence: parseFloat(row.confidence as string),
    notes: row.notes as string | null,
    detection_method: row.detection_method as DetectionMethod,
    created_at: new Date(row.created_at as string),
  };
}

function mapRowToTag(row: Record<string, unknown>): ObjectTag {
  return {
    id: row.id as string,
    object_id: row.object_id as string,
    tag: row.tag as string,
    source: row.source as TagSource,
    created_at: new Date(row.created_at as string),
  };
}

function mapRowToCollection(row: Record<string, unknown>): ObjectCollection {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | null,
    cover_object_id: row.cover_object_id as string | null,
    object_count: parseInt(row.object_count as string, 10),
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}
