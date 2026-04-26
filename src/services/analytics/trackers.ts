/**
 * Trackers Service
 *
 * Flexible structured data tracking system for situation-specific tracking needs.
 * Each tracker has user-defined fields and records with JSONB data storage.
 */

import { pool } from '../../db/pool.js';
import { generateEmbedding } from '../../providers/embeddings.js';

// =============================================================================
// TYPES
// =============================================================================

export type TrackerFieldType = 'text' | 'number' | 'date' | 'status' | 'boolean';

export interface TrackerField {
  name: string;
  type: TrackerFieldType;
  required?: boolean;
  description?: string;
  options?: string[]; // for status fields
}

export interface Tracker {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  fields: TrackerField[];
  is_pinned: boolean;
  is_archived: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface TrackerRecord {
  id: string;
  tracker_id: string;
  data: Record<string, any>;
  status: string;
  priority: number;
  due_at: Date | null;
  completed_at: Date | null;
  notes: string | null;
  tags: string[];
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTrackerArgs {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  fields: TrackerField[];
  is_pinned?: boolean;
}

export interface AddRecordArgs {
  tracker_id?: string;
  tracker_name?: string; // fuzzy match if no id
  data: Record<string, any>;
  status?: string;
  priority?: number;
  due_at?: string | Date;
  notes?: string;
  tags?: string[];
}

export interface UpdateRecordArgs {
  data?: Record<string, any>;
  status?: string;
  priority?: number;
  due_at?: string | Date | null;
  completed_at?: string | Date | null;
  notes?: string | null;
  tags?: string[];
}

export interface QueryRecordsArgs {
  tracker_id?: string;
  tracker_name?: string;
  status?: string;
  filter?: Record<string, any>; // filter by data fields
  limit?: number;
  sort_by?: string; // field name or created_at/updated_at/due_at
  sort_dir?: 'asc' | 'desc';
}

// =============================================================================
// TRACKER OPERATIONS
// =============================================================================

/**
 * Create a new tracker
 */
export async function createTracker(args: CreateTrackerArgs): Promise<string> {
  const {
    name,
    description,
    category,
    tags = [],
    fields,
    is_pinned = false,
  } = args;

  // Validate fields
  if (!fields || fields.length === 0) {
    return JSON.stringify({ error: 'At least one field is required' });
  }

  // Generate embedding for semantic search
  const textForEmbedding = description ? `${name}. ${description}` : name;
  const embedding = await generateEmbedding(textForEmbedding);
  const embeddingStr = `[${embedding.join(',')}]`;

  try {
    const result = await pool.query(
      `INSERT INTO trackers (
        name, description, category, tags, fields, is_pinned, embedding
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        name,
        description ?? null,
        category ?? null,
        tags,
        JSON.stringify(fields),
        is_pinned,
        embeddingStr,
      ]
    );

    const tracker = result.rows[0] as Tracker;
    return JSON.stringify({
      message: `Tracker "${name}" created successfully`,
      tracker: {
        id: tracker.id,
        name: tracker.name,
        description: tracker.description,
        category: tracker.category,
        fields: tracker.fields,
        is_pinned: tracker.is_pinned,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to create tracker: ${message}` });
  }
}

/**
 * List all non-archived trackers
 */
export async function listTrackers(category?: string): Promise<string> {
  try {
    const conditions: string[] = ['is_archived = FALSE'];
    const params: string[] = [];
    let paramIndex = 1;

    if (category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    const query = `
      SELECT t.*,
        COALESCE(counts.record_count, 0)::int AS record_count
      FROM trackers t
      LEFT JOIN (
        SELECT
          tracker_id,
          COUNT(*) AS record_count
        FROM tracker_records
        WHERE status != 'archived'
        GROUP BY tracker_id
      ) counts ON counts.tracker_id = t.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.is_pinned DESC, t.updated_at DESC
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return JSON.stringify({
        message: category ? `No trackers found in category "${category}"` : 'No trackers found',
        trackers: [],
      });
    }

    const trackers = result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      tags: row.tags,
      fields: row.fields,
      is_pinned: row.is_pinned,
      record_count: row.record_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return JSON.stringify({
      count: trackers.length,
      trackers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to list trackers: ${message}`, trackers: [] });
  }
}

/**
 * Get a single tracker by ID or name
 */
export async function getTracker(idOrName: string): Promise<Tracker | null> {
  // Try ID first (only if it looks like a UUID to avoid Postgres type errors)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(idOrName)) {
    const result = await pool.query(
      'SELECT * FROM trackers WHERE id = $1 AND is_archived = FALSE',
      [idOrName]
    );
    if (result.rows.length > 0) {
      return result.rows[0] as Tracker;
    }
  }

  // Try exact name match
  let result = await pool.query(
    'SELECT * FROM trackers WHERE LOWER(name) = LOWER($1) AND is_archived = FALSE',
    [idOrName]
  );

  if (result.rows.length > 0) {
    return result.rows[0] as Tracker;
  }

  // Try fuzzy name match
  result = await pool.query(
    'SELECT * FROM trackers WHERE LOWER(name) LIKE LOWER($1) AND is_archived = FALSE LIMIT 1',
    [`%${idOrName}%`]
  );

  if (result.rows.length > 0) {
    return result.rows[0] as Tracker;
  }

  return null;
}

/**
 * Archive a tracker
 */
export async function archiveTracker(idOrName: string): Promise<string> {
  try {
    const tracker = await getTracker(idOrName);
    if (!tracker) {
      return JSON.stringify({ error: `Tracker "${idOrName}" not found` });
    }

    await pool.query(
      'UPDATE trackers SET is_archived = TRUE, updated_at = NOW() WHERE id = $1',
      [tracker.id]
    );

    return JSON.stringify({
      message: `Tracker "${tracker.name}" archived successfully`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to archive tracker: ${message}` });
  }
}

// =============================================================================
// RECORD OPERATIONS
// =============================================================================

/**
 * Add a record to a tracker
 */
export async function addRecord(args: AddRecordArgs): Promise<string> {
  const {
    tracker_id,
    tracker_name,
    data,
    status = 'active',
    priority = 3,
    due_at,
    notes,
    tags = [],
  } = args;

  try {
    // Resolve tracker
    let tracker: Tracker | null = null;
    if (tracker_id) {
      tracker = await getTracker(tracker_id);
    } else if (tracker_name) {
      tracker = await getTracker(tracker_name);
    } else {
      return JSON.stringify({ error: 'Either tracker_id or tracker_name is required' });
    }

    if (!tracker) {
      return JSON.stringify({
        error: `Tracker "${tracker_id || tracker_name}" not found`,
      });
    }

    // Validate required fields
    const requiredFields = tracker.fields.filter(f => f.required);
    for (const field of requiredFields) {
      if (!(field.name in data) || data[field.name] === null || data[field.name] === undefined) {
        return JSON.stringify({
          error: `Required field "${field.name}" is missing`,
        });
      }
    }

    // Parse due_at if provided
    let dueDate: Date | null = null;
    if (due_at) {
      dueDate = typeof due_at === 'string' ? new Date(due_at) : due_at;
    }

    const result = await pool.query(
      `INSERT INTO tracker_records (
        tracker_id, data, status, priority, due_at, notes, tags
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        tracker.id,
        JSON.stringify(data),
        status,
        priority,
        dueDate,
        notes ?? null,
        tags,
      ]
    );

    // Update tracker's updated_at
    await pool.query('UPDATE trackers SET updated_at = NOW() WHERE id = $1', [tracker.id]);

    const record = result.rows[0] as TrackerRecord;
    return JSON.stringify({
      message: `Record added to tracker "${tracker.name}"`,
      record: {
        id: record.id,
        tracker_id: record.tracker_id,
        data: record.data,
        status: record.status,
        priority: record.priority,
        due_at: record.due_at,
        notes: record.notes,
        created_at: record.created_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to add record: ${message}` });
  }
}

/**
 * Update a record
 */
export async function updateRecord(recordId: string, updates: UpdateRecordArgs): Promise<string> {
  try {
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.data !== undefined) {
      // Merge with existing data
      const existing = await pool.query(
        'SELECT data FROM tracker_records WHERE id = $1',
        [recordId]
      );
      if (existing.rows.length === 0) {
        return JSON.stringify({ error: `Record "${recordId}" not found` });
      }
      const mergedData = { ...existing.rows[0].data, ...updates.data };
      updateFields.push(`data = $${paramIndex}`);
      params.push(JSON.stringify(mergedData));
      paramIndex++;
    }

    if (updates.status !== undefined) {
      updateFields.push(`status = $${paramIndex}`);
      params.push(updates.status);
      paramIndex++;

      // Auto-set completed_at if status is completed
      if (updates.status === 'completed' && updates.completed_at === undefined) {
        updateFields.push(`completed_at = NOW()`);
      }
    }

    if (updates.priority !== undefined) {
      updateFields.push(`priority = $${paramIndex}`);
      params.push(updates.priority);
      paramIndex++;
    }

    if (updates.due_at !== undefined) {
      const dueDate = updates.due_at === null ? null :
        typeof updates.due_at === 'string' ? new Date(updates.due_at) : updates.due_at;
      updateFields.push(`due_at = $${paramIndex}`);
      params.push(dueDate);
      paramIndex++;
    }

    if (updates.completed_at !== undefined) {
      const completedDate = updates.completed_at === null ? null :
        typeof updates.completed_at === 'string' ? new Date(updates.completed_at) : updates.completed_at;
      updateFields.push(`completed_at = $${paramIndex}`);
      params.push(completedDate);
      paramIndex++;
    }

    if (updates.notes !== undefined) {
      updateFields.push(`notes = $${paramIndex}`);
      params.push(updates.notes);
      paramIndex++;
    }

    if (updates.tags !== undefined) {
      updateFields.push(`tags = $${paramIndex}`);
      params.push(updates.tags);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return JSON.stringify({ error: 'No updates provided' });
    }

    updateFields.push(`updated_at = NOW()`);
    params.push(recordId);

    const result = await pool.query(
      `UPDATE tracker_records SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return JSON.stringify({ error: `Record "${recordId}" not found` });
    }

    const record = result.rows[0] as TrackerRecord;
    return JSON.stringify({
      message: 'Record updated successfully',
      record: {
        id: record.id,
        tracker_id: record.tracker_id,
        data: record.data,
        status: record.status,
        priority: record.priority,
        due_at: record.due_at,
        completed_at: record.completed_at,
        notes: record.notes,
        updated_at: record.updated_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to update record: ${message}` });
  }
}

/**
 * Delete a record (soft delete by setting status to archived)
 */
export async function deleteRecord(recordId: string): Promise<string> {
  try {
    const result = await pool.query(
      `UPDATE tracker_records SET status = 'archived', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [recordId]
    );

    if (result.rows.length === 0) {
      return JSON.stringify({ error: `Record "${recordId}" not found` });
    }

    return JSON.stringify({
      message: 'Record archived successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to delete record: ${message}` });
  }
}

/**
 * Query tracker records with filtering and sorting
 */
export async function queryRecords(args: QueryRecordsArgs): Promise<string> {
  const {
    tracker_id,
    tracker_name,
    status,
    filter,
    limit = 50,
    sort_by,
    sort_dir = 'desc',
  } = args;

  try {
    // Resolve tracker
    let tracker: Tracker | null = null;
    if (tracker_id) {
      tracker = await getTracker(tracker_id);
    } else if (tracker_name) {
      tracker = await getTracker(tracker_name);
    } else {
      return JSON.stringify({ error: 'Either tracker_id or tracker_name is required' });
    }

    if (!tracker) {
      return JSON.stringify({
        error: `Tracker "${tracker_id || tracker_name}" not found`,
        records: [],
      });
    }

    const conditions: string[] = ['tracker_id = $1'];
    const params: any[] = [tracker.id];
    let paramIndex = 2;

    if (status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    // JSONB filtering
    if (filter && Object.keys(filter).length > 0) {
      conditions.push(`data @> $${paramIndex}::jsonb`);
      params.push(JSON.stringify(filter));
      paramIndex++;
    }

    // Determine sort order
    let orderBy = 'created_at DESC'; // default
    if (sort_by) {
      if (['created_at', 'updated_at', 'due_at', 'priority'].includes(sort_by)) {
        orderBy = `${sort_by} ${sort_dir.toUpperCase()}`;
      } else {
        // Sort by data field
        orderBy = `data->>'${sort_by}' ${sort_dir.toUpperCase()}`;
      }
    }

    const query = `
      SELECT * FROM tracker_records
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return JSON.stringify({
        message: `No records found in tracker "${tracker.name}"`,
        tracker: {
          id: tracker.id,
          name: tracker.name,
          fields: tracker.fields,
        },
        records: [],
      });
    }

    const records = result.rows.map((row: any) => ({
      id: row.id,
      data: row.data,
      status: row.status,
      priority: row.priority,
      due_at: row.due_at,
      completed_at: row.completed_at,
      notes: row.notes,
      tags: row.tags,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return JSON.stringify({
      tracker: {
        id: tracker.id,
        name: tracker.name,
        description: tracker.description,
        fields: tracker.fields,
      },
      count: records.length,
      records,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to query records: ${message}`, records: [] });
  }
}

/**
 * Get tracker summary with aggregate statistics
 */
export async function trackerSummary(idOrName: string): Promise<string> {
  try {
    const tracker = await getTracker(idOrName);
    if (!tracker) {
      return JSON.stringify({ error: `Tracker "${idOrName}" not found` });
    }

    // Get aggregate stats
    const statsResult = await pool.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'archived') AS archived,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        COUNT(*) FILTER (WHERE due_at < NOW() AND status NOT IN ('completed', 'archived')) AS overdue,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS recent
      FROM tracker_records
      WHERE tracker_id = $1`,
      [tracker.id]
    );

    const stats = statsResult.rows[0];

    // Get recent records
    const recentResult = await pool.query(
      `SELECT * FROM tracker_records
       WHERE tracker_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [tracker.id]
    );

    const recentRecords = recentResult.rows.map((row: any) => ({
      id: row.id,
      data: row.data,
      status: row.status,
      created_at: row.created_at,
    }));

    return JSON.stringify({
      tracker: {
        id: tracker.id,
        name: tracker.name,
        description: tracker.description,
        category: tracker.category,
        fields: tracker.fields,
        created_at: tracker.created_at,
      },
      stats: {
        total: parseInt(stats.total, 10),
        active: parseInt(stats.active, 10),
        completed: parseInt(stats.completed, 10),
        archived: parseInt(stats.archived, 10),
        cancelled: parseInt(stats.cancelled, 10),
        overdue: parseInt(stats.overdue, 10),
        recent_week: parseInt(stats.recent, 10),
      },
      recent_records: recentRecords,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to get tracker summary: ${message}` });
  }
}
