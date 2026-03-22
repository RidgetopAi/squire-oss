/**
 * Notes Service
 * 
 * User-authored notes with entity relationships for contextual retrieval.
 * Notes integrate with the memory graph through underlying memory records.
 */

import { pool } from '../db/pool.js';
import { generateEmbedding } from '../providers/embeddings.js';
import { createMemory } from './memories.js';

// =============================================================================
// TYPES
// =============================================================================

export type NoteSourceType = 'manual' | 'voice' | 'chat' | 'calendar_event';

export interface Note {
  id: string;
  title: string | null;
  content: string;
  memory_id: string | null;
  source_type: NoteSourceType;
  source_context: Record<string, unknown>;
  primary_entity_id: string | null;
  entity_ids: string[];
  category: string | null;
  tags: string[];
  is_pinned: boolean;
  color: string | null;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

export interface CreateNoteInput {
  title?: string;
  content: string;
  source_type?: NoteSourceType;
  source_context?: Record<string, unknown>;
  primary_entity_id?: string;
  entity_ids?: string[];
  category?: string;
  tags?: string[];
  is_pinned?: boolean;
  color?: string;
  create_memory?: boolean; // Default true - creates underlying memory
}

export interface UpdateNoteInput {
  title?: string | null;
  content?: string;
  primary_entity_id?: string | null;
  entity_ids?: string[];
  category?: string | null;
  tags?: string[];
  is_pinned?: boolean;
  color?: string | null;
}

export interface ListNotesOptions {
  limit?: number;
  offset?: number;
  category?: string;
  entity_id?: string;
  is_pinned?: boolean;
  include_archived?: boolean;
  tags?: string[];
}

export interface SearchNotesOptions {
  limit?: number;
  threshold?: number;
  entity_id?: string;
  category?: string;
}

export interface ExportOptions {
  format: 'json' | 'markdown' | 'csv';
  entity_id?: string;
  category?: string;
  include_archived?: boolean;
  include_metadata?: boolean;
}

export interface ExportResult {
  format: string;
  count: number;
  data: string;
}

// =============================================================================
// CORE OPERATIONS
// =============================================================================

/**
 * Create a new note with optional underlying memory
 */
export async function createNote(input: CreateNoteInput): Promise<Note> {
  const {
    title,
    content,
    source_type = 'manual',
    source_context = {},
    primary_entity_id,
    entity_ids = [],
    category,
    tags = [],
    is_pinned = false,
    color,
    create_memory = true,
  } = input;

  // Generate embedding for semantic search
  const textForEmbedding = title ? `${title}. ${content}` : content;
  const embedding = await generateEmbedding(textForEmbedding);
  const embeddingStr = `[${embedding.join(',')}]`;

  // Optionally create underlying memory for graph integration
  let memoryId: string | null = null;
  if (create_memory) {
    const result = await createMemory({
      content: textForEmbedding,
      content_type: 'note',
      source: source_type === 'calendar_event' ? 'calendar' : source_type,
      source_metadata: source_context,
    });
    memoryId = result.memory.id;
  }

  // Ensure primary entity is in entity_ids
  const allEntityIds = primary_entity_id && !entity_ids.includes(primary_entity_id)
    ? [primary_entity_id, ...entity_ids]
    : entity_ids;

  const result = await pool.query(
    `INSERT INTO notes (
      title, content, memory_id, source_type, source_context,
      primary_entity_id, entity_ids, category, tags, is_pinned, color, embedding
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      title ?? null,
      content,
      memoryId,
      source_type,
      JSON.stringify(source_context),
      primary_entity_id ?? null,
      allEntityIds,
      category ?? null,
      tags,
      is_pinned,
      color ?? null,
      embeddingStr,
    ]
  );

  return result.rows[0] as Note;
}

/**
 * Get a single note by ID
 */
export async function getNote(id: string): Promise<Note | null> {
  const result = await pool.query(
    'SELECT * FROM notes WHERE id = $1',
    [id]
  );
  return (result.rows[0] as Note) ?? null;
}

/**
 * Update a note
 */
export async function updateNote(id: string, input: UpdateNoteInput): Promise<Note | null> {
  const updates: string[] = [];
  const params: (string | string[] | boolean | null)[] = [];
  let paramIndex = 1;

  if (input.title !== undefined) {
    updates.push(`title = $${paramIndex}`);
    params.push(input.title);
    paramIndex++;
  }

  if (input.content !== undefined) {
    updates.push(`content = $${paramIndex}`);
    params.push(input.content);
    paramIndex++;

    // Re-generate embedding
    const note = await getNote(id);
    if (note) {
      const textForEmbedding = input.title !== undefined
        ? `${input.title ?? ''}. ${input.content}`
        : note.title
          ? `${note.title}. ${input.content}`
          : input.content;
      const embedding = await generateEmbedding(textForEmbedding);
      updates.push(`embedding = $${paramIndex}`);
      params.push(`[${embedding.join(',')}]`);
      paramIndex++;
    }
  }

  if (input.primary_entity_id !== undefined) {
    updates.push(`primary_entity_id = $${paramIndex}`);
    params.push(input.primary_entity_id);
    paramIndex++;
  }

  if (input.entity_ids !== undefined) {
    updates.push(`entity_ids = $${paramIndex}`);
    params.push(input.entity_ids);
    paramIndex++;
  }

  if (input.category !== undefined) {
    updates.push(`category = $${paramIndex}`);
    params.push(input.category);
    paramIndex++;
  }

  if (input.tags !== undefined) {
    updates.push(`tags = $${paramIndex}`);
    params.push(input.tags);
    paramIndex++;
  }

  if (input.is_pinned !== undefined) {
    updates.push(`is_pinned = $${paramIndex}`);
    params.push(input.is_pinned);
    paramIndex++;
  }

  if (input.color !== undefined) {
    updates.push(`color = $${paramIndex}`);
    params.push(input.color);
    paramIndex++;
  }

  if (updates.length === 0) {
    return getNote(id);
  }

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const result = await pool.query(
    `UPDATE notes SET ${updates.join(', ')} WHERE id = $${paramIndex} AND archived_at IS NULL RETURNING *`,
    params
  );

  return (result.rows[0] as Note) ?? null;
}

/**
 * Archive a note (soft delete)
 */
export async function archiveNote(id: string): Promise<void> {
  await pool.query(
    'UPDATE notes SET archived_at = NOW(), updated_at = NOW() WHERE id = $1',
    [id]
  );
}

/**
 * Hard delete a note
 */
export async function deleteNote(id: string): Promise<void> {
  await pool.query('DELETE FROM notes WHERE id = $1', [id]);
}

// =============================================================================
// QUERIES
// =============================================================================

/**
 * List notes with filtering options
 */
export async function listNotes(options: ListNotesOptions = {}): Promise<Note[]> {
  const {
    limit = 50,
    offset = 0,
    category,
    entity_id,
    is_pinned,
    include_archived = false,
    tags,
  } = options;

  const conditions: string[] = [];
  const params: (string | string[] | boolean | number)[] = [];
  let paramIndex = 1;

  if (!include_archived) {
    conditions.push('archived_at IS NULL');
  }

  if (category) {
    conditions.push(`category = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  if (entity_id) {
    conditions.push(`(primary_entity_id = $${paramIndex} OR $${paramIndex} = ANY(entity_ids))`);
    params.push(entity_id);
    paramIndex++;
  }

  if (is_pinned !== undefined) {
    conditions.push(`is_pinned = $${paramIndex}`);
    params.push(is_pinned);
    paramIndex++;
  }

  if (tags && tags.length > 0) {
    conditions.push(`tags && $${paramIndex}`);
    params.push(tags);
    paramIndex++;
  }

  let query = 'SELECT * FROM notes';
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY is_pinned DESC, updated_at DESC';
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows as Note[];
}

/**
 * Search notes semantically
 */
export async function searchNotes(
  query: string,
  options: SearchNotesOptions = {}
): Promise<(Note & { similarity: number })[]> {
  const { limit = 20, threshold = 0.3, entity_id, category } = options;

  const embedding = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(',')}]`;

  const conditions: string[] = ['archived_at IS NULL'];
  const params: (string | number)[] = [embeddingStr];
  let paramIndex = 2;

  if (entity_id) {
    conditions.push(`(primary_entity_id = $${paramIndex} OR $${paramIndex} = ANY(entity_ids))`);
    params.push(entity_id);
    paramIndex++;
  }

  if (category) {
    conditions.push(`category = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  params.push(threshold, limit);

  const result = await pool.query(
    `SELECT *, 1 - (embedding <=> $1) AS similarity
     FROM notes
     WHERE ${conditions.join(' AND ')}
       AND 1 - (embedding <=> $1) > $${paramIndex}
     ORDER BY similarity DESC
     LIMIT $${paramIndex + 1}`,
    params
  );

  return result.rows as (Note & { similarity: number })[];
}

/**
 * Get notes by entity
 */
export async function getNotesByEntity(entityId: string): Promise<Note[]> {
  const result = await pool.query(
    `SELECT * FROM notes 
     WHERE archived_at IS NULL 
       AND (primary_entity_id = $1 OR $1 = ANY(entity_ids))
     ORDER BY updated_at DESC`,
    [entityId]
  );
  return result.rows as Note[];
}

/**
 * Get pinned notes
 */
export async function getPinnedNotes(): Promise<Note[]> {
  const result = await pool.query(
    `SELECT * FROM notes
     WHERE archived_at IS NULL AND is_pinned = TRUE
     ORDER BY updated_at DESC`
  );
  return result.rows as Note[];
}

/**
 * Find a note by title (fuzzy match)
 * First tries exact match (case-insensitive), then semantic search
 */
export async function findNoteByTitle(title: string): Promise<Note | null> {
  // First try exact match on title
  let result = await pool.query(
    `SELECT * FROM notes WHERE archived_at IS NULL AND LOWER(title) = LOWER($1) LIMIT 1`,
    [title]
  );

  if (result.rows.length > 0) {
    return result.rows[0] as Note;
  }

  // Then try partial match on title
  result = await pool.query(
    `SELECT * FROM notes WHERE archived_at IS NULL AND LOWER(title) LIKE LOWER($1) LIMIT 1`,
    [`%${title}%`]
  );

  if (result.rows.length > 0) {
    return result.rows[0] as Note;
  }

  // Finally try semantic search
  const matches = await searchNotes(title, { limit: 1 });
  const match = matches[0];
  if (match && match.similarity > 0.7) {
    return match;
  }

  return null;
}

// =============================================================================
// ENTITY LINKING
// =============================================================================

/**
 * Link a note to an entity
 */
export async function linkNoteToEntity(
  noteId: string,
  entityId: string,
  isPrimary: boolean = false
): Promise<Note | null> {
  if (isPrimary) {
    const result = await pool.query(
      `UPDATE notes 
       SET primary_entity_id = $1,
           entity_ids = array_append(array_remove(entity_ids, $1), $1),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [entityId, noteId]
    );
    return (result.rows[0] as Note) ?? null;
  } else {
    const result = await pool.query(
      `UPDATE notes 
       SET entity_ids = array_append(array_remove(entity_ids, $1), $1),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [entityId, noteId]
    );
    return (result.rows[0] as Note) ?? null;
  }
}

/**
 * Unlink a note from an entity
 */
export async function unlinkNoteFromEntity(
  noteId: string,
  entityId: string
): Promise<Note | null> {
  const result = await pool.query(
    `UPDATE notes 
     SET entity_ids = array_remove(entity_ids, $1),
         primary_entity_id = CASE WHEN primary_entity_id = $1 THEN NULL ELSE primary_entity_id END,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [entityId, noteId]
  );
  return (result.rows[0] as Note) ?? null;
}

/**
 * Pin a note
 */
export async function pinNote(id: string): Promise<Note | null> {
  return updateNote(id, { is_pinned: true });
}

/**
 * Unpin a note
 */
export async function unpinNote(id: string): Promise<Note | null> {
  return updateNote(id, { is_pinned: false });
}

// =============================================================================
// EXPORT
// =============================================================================

/**
 * Export notes in various formats
 */
export async function exportNotes(options: ExportOptions): Promise<ExportResult> {
  const notes = await listNotes({
    entity_id: options.entity_id,
    category: options.category,
    include_archived: options.include_archived,
    limit: 10000, // High limit for export
  });

  let data: string;

  switch (options.format) {
    case 'markdown':
      data = exportAsMarkdown(notes, options.include_metadata);
      break;
    case 'csv':
      data = exportAsCsv(notes);
      break;
    case 'json':
    default:
      data = JSON.stringify(notes, null, 2);
      break;
  }

  return {
    format: options.format,
    count: notes.length,
    data,
  };
}

function exportAsMarkdown(notes: Note[], includeMetadata?: boolean): string {
  const lines: string[] = ['# Notes Export', '', `Exported: ${new Date().toISOString()}`, ''];

  for (const note of notes) {
    if (note.title) {
      lines.push(`## ${note.title}`);
    } else {
      lines.push(`## Note (${note.created_at.toISOString().split('T')[0]})`);
    }

    if (includeMetadata) {
      lines.push('');
      lines.push(`- **ID:** ${note.id}`);
      lines.push(`- **Created:** ${note.created_at.toISOString()}`);
      if (note.category) lines.push(`- **Category:** ${note.category}`);
      if (note.tags.length > 0) lines.push(`- **Tags:** ${note.tags.join(', ')}`);
      if (note.is_pinned) lines.push(`- **Pinned:** Yes`);
    }

    lines.push('');
    lines.push(note.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function exportAsCsv(notes: Note[]): string {
  const headers = ['id', 'title', 'content', 'category', 'tags', 'is_pinned', 'created_at', 'updated_at'];
  const rows = notes.map(note => [
    note.id,
    escapeCsvField(note.title ?? ''),
    escapeCsvField(note.content),
    note.category ?? '',
    note.tags.join(';'),
    note.is_pinned ? 'true' : 'false',
    note.created_at.toISOString(),
    note.updated_at.toISOString(),
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
