/**
 * Lists Service
 * 
 * User-created lists (checklists, simple lists, ranked lists) with optional entity relationships.
 * Supports item management, completion tracking, ordering, and export.
 */

import { pool } from '../db/pool.js';
import { generateEmbedding } from '../providers/embeddings.js';

// =============================================================================
// TYPES
// =============================================================================

export type ListType = 'checklist' | 'simple' | 'ranked';
export type SortType = 'manual' | 'created' | 'priority' | 'due_date';

export interface List {
  id: string;
  name: string;
  description: string | null;
  list_type: ListType;
  primary_entity_id: string | null;
  category: string | null;
  tags: string[];
  is_pinned: boolean;
  color: string | null;
  default_sort: SortType;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

export interface ListItem {
  id: string;
  list_id: string;
  content: string;
  notes: string | null;
  is_completed: boolean;
  completed_at: Date | null;
  priority: number;
  due_at: Date | null;
  entity_id: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

export interface ListWithItems extends List {
  items: ListItem[];
}

export interface CreateListInput {
  name: string;
  description?: string;
  list_type?: ListType;
  primary_entity_id?: string;
  category?: string;
  tags?: string[];
  is_pinned?: boolean;
  color?: string;
  default_sort?: SortType;
}

export interface UpdateListInput {
  name?: string;
  description?: string | null;
  list_type?: ListType;
  primary_entity_id?: string | null;
  category?: string | null;
  tags?: string[];
  is_pinned?: boolean;
  color?: string | null;
  default_sort?: SortType;
}

export interface AddItemInput {
  content: string;
  notes?: string;
  priority?: number;
  due_at?: Date;
  entity_id?: string;
  sort_order?: number; // If not provided, appends to end
}

export interface UpdateItemInput {
  content?: string;
  notes?: string | null;
  is_completed?: boolean;
  priority?: number;
  due_at?: Date | null;
  entity_id?: string | null;
  sort_order?: number;
}

export interface ListListsOptions {
  limit?: number;
  offset?: number;
  list_type?: ListType;
  category?: string;
  entity_id?: string;
  is_pinned?: boolean;
  include_archived?: boolean;
}

export interface CompletionStats {
  completed: number;
  total: number;
  percentage: number;
}

export interface ExportListOptions {
  format: 'json' | 'markdown' | 'csv' | 'txt';
  include_completed?: boolean;
  only_completed?: boolean;
  include_metadata?: boolean;
}

// =============================================================================
// LIST OPERATIONS
// =============================================================================

/**
 * Create a new list
 */
export async function createList(input: CreateListInput): Promise<List> {
  const {
    name,
    description,
    list_type = 'checklist',
    primary_entity_id,
    category,
    tags = [],
    is_pinned = false,
    color,
    default_sort = 'manual',
  } = input;

  // Generate embedding for semantic search
  const textForEmbedding = description ? `${name}. ${description}` : name;
  const embedding = await generateEmbedding(textForEmbedding);
  const embeddingStr = `[${embedding.join(',')}]`;

  const result = await pool.query(
    `INSERT INTO lists (
      name, description, list_type, primary_entity_id,
      category, tags, is_pinned, color, default_sort, embedding
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      name,
      description ?? null,
      list_type,
      primary_entity_id ?? null,
      category ?? null,
      tags,
      is_pinned,
      color ?? null,
      default_sort,
      embeddingStr,
    ]
  );

  return result.rows[0] as List;
}

/**
 * Get a single list by ID
 */
export async function getList(id: string): Promise<List | null> {
  const result = await pool.query('SELECT * FROM lists WHERE id = $1', [id]);
  return (result.rows[0] as List) ?? null;
}

/**
 * Get a list with its items
 */
export async function getListWithItems(id: string): Promise<ListWithItems | null> {
  const list = await getList(id);
  if (!list) return null;

  const items = await getListItems(id);
  return { ...list, items };
}

/**
 * Update a list
 */
export async function updateList(id: string, input: UpdateListInput): Promise<List | null> {
  const updates: string[] = [];
  const params: (string | string[] | boolean | null)[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    params.push(input.name);
    paramIndex++;

    // Re-generate embedding
    const list = await getList(id);
    if (list) {
      const textForEmbedding = input.description !== undefined
        ? `${input.name}. ${input.description ?? ''}`
        : list.description
          ? `${input.name}. ${list.description}`
          : input.name;
      const embedding = await generateEmbedding(textForEmbedding);
      updates.push(`embedding = $${paramIndex}`);
      params.push(`[${embedding.join(',')}]`);
      paramIndex++;
    }
  }

  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex}`);
    params.push(input.description);
    paramIndex++;
  }

  if (input.list_type !== undefined) {
    updates.push(`list_type = $${paramIndex}`);
    params.push(input.list_type);
    paramIndex++;
  }

  if (input.primary_entity_id !== undefined) {
    updates.push(`primary_entity_id = $${paramIndex}`);
    params.push(input.primary_entity_id);
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

  if (input.default_sort !== undefined) {
    updates.push(`default_sort = $${paramIndex}`);
    params.push(input.default_sort);
    paramIndex++;
  }

  if (updates.length === 0) {
    return getList(id);
  }

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const result = await pool.query(
    `UPDATE lists SET ${updates.join(', ')} WHERE id = $${paramIndex} AND archived_at IS NULL RETURNING *`,
    params
  );

  return (result.rows[0] as List) ?? null;
}

/**
 * Archive a list (soft delete)
 */
export async function archiveList(id: string): Promise<void> {
  await pool.query(
    'UPDATE lists SET archived_at = NOW(), updated_at = NOW() WHERE id = $1',
    [id]
  );
}

/**
 * Hard delete a list (cascade deletes items)
 */
export async function deleteList(id: string): Promise<void> {
  await pool.query('DELETE FROM lists WHERE id = $1', [id]);
}

// =============================================================================
// LIST QUERIES
// =============================================================================

/**
 * List lists with filtering options
 */
export async function listLists(options: ListListsOptions = {}): Promise<(List & { item_count: number; completed_count: number })[]> {
  const {
    limit = 50,
    offset = 0,
    list_type,
    category,
    entity_id,
    is_pinned,
    include_archived = false,
  } = options;

  const conditions: string[] = [];
  const params: (string | boolean | number)[] = [];
  let paramIndex = 1;

  if (!include_archived) {
    conditions.push('l.archived_at IS NULL');
  }

  if (list_type) {
    conditions.push(`l.list_type = $${paramIndex}`);
    params.push(list_type);
    paramIndex++;
  }

  if (category) {
    conditions.push(`l.category = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  if (entity_id) {
    conditions.push(`l.primary_entity_id = $${paramIndex}`);
    params.push(entity_id);
    paramIndex++;
  }

  if (is_pinned !== undefined) {
    conditions.push(`l.is_pinned = $${paramIndex}`);
    params.push(is_pinned);
    paramIndex++;
  }

  let query = `
    SELECT l.*,
      COALESCE(counts.item_count, 0)::int AS item_count,
      COALESCE(counts.completed_count, 0)::int AS completed_count
    FROM lists l
    LEFT JOIN (
      SELECT
        list_id,
        COUNT(*) AS item_count,
        COUNT(*) FILTER (WHERE is_completed = TRUE) AS completed_count
      FROM list_items
      WHERE archived_at IS NULL
      GROUP BY list_id
    ) counts ON counts.list_id = l.id
  `;

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY l.is_pinned DESC, l.updated_at DESC';
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows as (List & { item_count: number; completed_count: number })[];
}

/**
 * Search lists semantically
 */
export async function searchLists(
  query: string,
  limit: number = 20
): Promise<(List & { similarity: number })[]> {
  const embedding = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(',')}]`;

  const result = await pool.query(
    `SELECT *, 1 - (embedding <=> $1) AS similarity
     FROM lists
     WHERE archived_at IS NULL
       AND 1 - (embedding <=> $1) > 0.3
     ORDER BY similarity DESC
     LIMIT $2`,
    [embeddingStr, limit]
  );

  return result.rows as (List & { similarity: number })[];
}

/**
 * Get lists by entity
 */
export async function getListsByEntity(entityId: string): Promise<List[]> {
  const result = await pool.query(
    `SELECT * FROM lists 
     WHERE archived_at IS NULL AND primary_entity_id = $1
     ORDER BY updated_at DESC`,
    [entityId]
  );
  return result.rows as List[];
}

/**
 * Find list by name (fuzzy match)
 */
export async function findListByName(name: string): Promise<List | null> {
  // First try exact match
  let result = await pool.query(
    `SELECT * FROM lists WHERE archived_at IS NULL AND LOWER(name) = LOWER($1) LIMIT 1`,
    [name]
  );

  if (result.rows.length > 0) {
    return result.rows[0] as List;
  }

  // Then try semantic search
  const matches = await searchLists(name, 1);
  const match = matches[0];
  if (match && match.similarity > 0.7) {
    return match;
  }

  return null;
}

// =============================================================================
// ITEM OPERATIONS
// =============================================================================

/**
 * Get all items for a list
 */
async function getListItems(listId: string): Promise<ListItem[]> {
  const list = await getList(listId);
  if (!list) return [];

  let orderBy: string;
  switch (list.default_sort) {
    case 'created':
      orderBy = 'created_at DESC';
      break;
    case 'priority':
      orderBy = 'priority DESC, sort_order ASC';
      break;
    case 'due_date':
      orderBy = 'COALESCE(due_at, \'9999-12-31\'::timestamptz) ASC, sort_order ASC';
      break;
    case 'manual':
    default:
      orderBy = 'sort_order ASC';
  }

  const result = await pool.query(
    `SELECT * FROM list_items 
     WHERE list_id = $1 AND archived_at IS NULL
     ORDER BY ${orderBy}`,
    [listId]
  );

  return result.rows as ListItem[];
}

/**
 * Add an item to a list
 */
export async function addItem(listId: string, input: AddItemInput): Promise<ListItem> {
  const { content, notes, priority = 0, due_at, entity_id, sort_order } = input;

  // If no sort_order provided, get next available
  let order = sort_order;
  if (order === undefined) {
    const maxResult = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM list_items WHERE list_id = $1 AND archived_at IS NULL',
      [listId]
    );
    order = maxResult.rows[0].next_order;
  }

  const result = await pool.query(
    `INSERT INTO list_items (list_id, content, notes, priority, due_at, entity_id, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [listId, content, notes ?? null, priority, due_at ?? null, entity_id ?? null, order]
  );

  // Update list's updated_at
  await pool.query('UPDATE lists SET updated_at = NOW() WHERE id = $1', [listId]);

  return result.rows[0] as ListItem;
}

/**
 * Get a single item
 */
export async function getItem(itemId: string): Promise<ListItem | null> {
  const result = await pool.query('SELECT * FROM list_items WHERE id = $1', [itemId]);
  return (result.rows[0] as ListItem) ?? null;
}

/**
 * Update an item
 */
export async function updateItem(itemId: string, input: UpdateItemInput): Promise<ListItem | null> {
  const updates: string[] = [];
  const params: (string | boolean | number | Date | null)[] = [];
  let paramIndex = 1;

  if (input.content !== undefined) {
    updates.push(`content = $${paramIndex}`);
    params.push(input.content);
    paramIndex++;
  }

  if (input.notes !== undefined) {
    updates.push(`notes = $${paramIndex}`);
    params.push(input.notes);
    paramIndex++;
  }

  if (input.is_completed !== undefined) {
    updates.push(`is_completed = $${paramIndex}`);
    params.push(input.is_completed);
    paramIndex++;

    if (input.is_completed) {
      updates.push(`completed_at = NOW()`);
    } else {
      updates.push(`completed_at = NULL`);
    }
  }

  if (input.priority !== undefined) {
    updates.push(`priority = $${paramIndex}`);
    params.push(input.priority);
    paramIndex++;
  }

  if (input.due_at !== undefined) {
    updates.push(`due_at = $${paramIndex}`);
    params.push(input.due_at);
    paramIndex++;
  }

  if (input.entity_id !== undefined) {
    updates.push(`entity_id = $${paramIndex}`);
    params.push(input.entity_id);
    paramIndex++;
  }

  if (input.sort_order !== undefined) {
    updates.push(`sort_order = $${paramIndex}`);
    params.push(input.sort_order);
    paramIndex++;
  }

  if (updates.length === 0) {
    return getItem(itemId);
  }

  updates.push(`updated_at = NOW()`);
  params.push(itemId);

  const result = await pool.query(
    `UPDATE list_items SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  );

  // Update parent list's updated_at
  if (result.rows[0]) {
    await pool.query('UPDATE lists SET updated_at = NOW() WHERE id = $1', [result.rows[0].list_id]);
  }

  return (result.rows[0] as ListItem) ?? null;
}

/**
 * Remove an item (archive)
 */
export async function removeItem(itemId: string): Promise<void> {
  const item = await getItem(itemId);
  if (item) {
    await pool.query(
      'UPDATE list_items SET archived_at = NOW(), updated_at = NOW() WHERE id = $1',
      [itemId]
    );
    await pool.query('UPDATE lists SET updated_at = NOW() WHERE id = $1', [item.list_id]);
  }
}

/**
 * Hard delete an item
 */
export async function deleteItem(itemId: string): Promise<void> {
  const item = await getItem(itemId);
  if (item) {
    await pool.query('DELETE FROM list_items WHERE id = $1', [itemId]);
    await pool.query('UPDATE lists SET updated_at = NOW() WHERE id = $1', [item.list_id]);
  }
}

/**
 * Reorder items in a list
 */
export async function reorderItems(listId: string, itemIds: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < itemIds.length; i++) {
      await client.query(
        'UPDATE list_items SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND list_id = $3',
        [i, itemIds[i], listId]
      );
    }

    await client.query('UPDATE lists SET updated_at = NOW() WHERE id = $1', [listId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// CHECKLIST OPERATIONS
// =============================================================================

/**
 * Toggle item completion
 */
export async function toggleItem(itemId: string): Promise<ListItem | null> {
  const item = await getItem(itemId);
  if (!item) return null;

  return updateItem(itemId, { is_completed: !item.is_completed });
}

/**
 * Mark item as complete
 */
export async function completeItem(itemId: string): Promise<ListItem | null> {
  return updateItem(itemId, { is_completed: true });
}

/**
 * Mark item as incomplete
 */
export async function uncompleteItem(itemId: string): Promise<ListItem | null> {
  return updateItem(itemId, { is_completed: false });
}

/**
 * Get completion stats for a list
 */
export async function getCompletionStats(listId: string): Promise<CompletionStats> {
  const result = await pool.query(
    `SELECT 
       COUNT(*) FILTER (WHERE is_completed = TRUE) AS completed,
       COUNT(*) AS total
     FROM list_items
     WHERE list_id = $1 AND archived_at IS NULL`,
    [listId]
  );

  const completed = parseInt(result.rows[0].completed, 10);
  const total = parseInt(result.rows[0].total, 10);
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, total, percentage };
}

/**
 * Complete all items in a list
 */
export async function completeAllItems(listId: string): Promise<void> {
  await pool.query(
    `UPDATE list_items 
     SET is_completed = TRUE, completed_at = NOW(), updated_at = NOW()
     WHERE list_id = $1 AND archived_at IS NULL AND is_completed = FALSE`,
    [listId]
  );
  await pool.query('UPDATE lists SET updated_at = NOW() WHERE id = $1', [listId]);
}

/**
 * Clear (archive) completed items
 */
export async function clearCompletedItems(listId: string): Promise<number> {
  const result = await pool.query(
    `UPDATE list_items 
     SET archived_at = NOW(), updated_at = NOW()
     WHERE list_id = $1 AND is_completed = TRUE AND archived_at IS NULL
     RETURNING id`,
    [listId]
  );
  await pool.query('UPDATE lists SET updated_at = NOW() WHERE id = $1', [listId]);
  return result.rowCount ?? 0;
}

// =============================================================================
// EXPORT
// =============================================================================

/**
 * Export a single list
 */
export async function exportList(listId: string, options: ExportListOptions): Promise<string> {
  const list = await getListWithItems(listId);
  if (!list) {
    throw new Error(`List not found: ${listId}`);
  }

  let items = list.items;

  // Filter items
  if (options.only_completed) {
    items = items.filter(item => item.is_completed);
  } else if (options.include_completed === false) {
    items = items.filter(item => !item.is_completed);
  }

  switch (options.format) {
    case 'markdown':
      return exportListAsMarkdown(list, items, options.include_metadata);
    case 'csv':
      return exportListAsCsv(list, items);
    case 'txt':
      return exportListAsTxt(list, items);
    case 'json':
    default:
      return JSON.stringify({ ...list, items }, null, 2);
  }
}

/**
 * Export all lists
 */
export async function exportAllLists(options: ExportListOptions): Promise<string> {
  const lists = await listLists({ limit: 10000 });
  const results: string[] = [];

  for (const list of lists) {
    const exported = await exportList(list.id, options);
    results.push(exported);
  }

  if (options.format === 'json') {
    return `[${results.join(',')}]`;
  }

  return results.join('\n\n---\n\n');
}

function exportListAsMarkdown(list: List, items: ListItem[], includeMetadata?: boolean): string {
  const lines: string[] = [`# ${list.name}`];

  if (list.description) {
    lines.push('', list.description);
  }

  if (includeMetadata) {
    lines.push('');
    lines.push(`- **Type:** ${list.list_type}`);
    lines.push(`- **Created:** ${list.created_at.toISOString()}`);
    if (list.category) lines.push(`- **Category:** ${list.category}`);
    if (list.tags.length > 0) lines.push(`- **Tags:** ${list.tags.join(', ')}`);
  }

  lines.push('');

  for (const item of items) {
    const checkbox = list.list_type === 'checklist'
      ? item.is_completed ? '[x]' : '[ ]'
      : '-';
    
    let line = `${checkbox} ${item.content}`;
    
    if (item.due_at) {
      line += ` (due: ${item.due_at.toISOString().split('T')[0]})`;
    }
    
    lines.push(line);
    
    if (item.notes) {
      lines.push(`  - ${item.notes}`);
    }
  }

  return lines.join('\n');
}

function exportListAsCsv(list: List, items: ListItem[]): string {
  const headers = ['list_name', 'item_id', 'content', 'is_completed', 'priority', 'due_at', 'notes', 'created_at'];
  const rows = items.map(item => [
    escapeCsvField(list.name),
    item.id,
    escapeCsvField(item.content),
    item.is_completed ? 'true' : 'false',
    item.priority.toString(),
    item.due_at?.toISOString() ?? '',
    escapeCsvField(item.notes ?? ''),
    item.created_at.toISOString(),
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

function exportListAsTxt(list: List, items: ListItem[]): string {
  const lines: string[] = [list.name, '='.repeat(list.name.length), ''];

  for (const item of items) {
    const idx = items.indexOf(item);
    const prefix = list.list_type === 'ranked' ? `${idx + 1}.` : '-';
    const status = list.list_type === 'checklist' && item.is_completed ? ' [DONE]' : '';
    lines.push(`${prefix} ${item.content}${status}`);
  }

  return lines.join('\n');
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
