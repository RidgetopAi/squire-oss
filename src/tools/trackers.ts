/**
 * Trackers Tools
 *
 * LLM tools for creating and managing flexible structured data trackers.
 */

import {
  createTracker,
  listTrackers,
  addRecord,
  updateRecord,
  queryRecords,
  trackerSummary,
  archiveTracker,
} from '../services/analytics/trackers.js';
import type { ToolHandler, ToolSpec } from './types.js';

// =============================================================================
// CREATE TRACKER TOOL
// =============================================================================

interface CreateTrackerArgs {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  fields: Array<{
    name: string;
    type: 'text' | 'number' | 'date' | 'status' | 'boolean';
    required?: boolean;
    description?: string;
    options?: string[];
  }>;
  is_pinned?: boolean;
}

async function handleCreateTracker(args: CreateTrackerArgs): Promise<string> {
  const { name, description, category, tags, fields, is_pinned } = args;

  if (!name || name.trim().length === 0) {
    return JSON.stringify({ error: 'Tracker name is required' });
  }

  if (!fields || fields.length === 0) {
    return JSON.stringify({ error: 'At least one field is required' });
  }

  return createTracker({
    name: name.trim(),
    description: description?.trim(),
    category: category?.trim(),
    tags,
    fields,
    is_pinned,
  });
}

// =============================================================================
// LIST TRACKERS TOOL
// =============================================================================

interface ListTrackersArgs {
  category?: string;
}

async function handleListTrackers(args: ListTrackersArgs | null): Promise<string> {
  const { category } = args ?? {};
  return listTrackers(category);
}

// =============================================================================
// ADD TRACKER RECORD TOOL
// =============================================================================

interface AddTrackerRecordArgs {
  tracker_name: string;
  data: Record<string, any>;
  status?: string;
  priority?: number;
  due_at?: string;
  notes?: string;
  tags?: string[];
}

async function handleAddTrackerRecord(args: AddTrackerRecordArgs): Promise<string> {
  const { tracker_name, data, status, priority, due_at, notes, tags } = args;

  if (!tracker_name || tracker_name.trim().length === 0) {
    return JSON.stringify({ error: 'Tracker name is required' });
  }

  if (!data || Object.keys(data).length === 0) {
    return JSON.stringify({ error: 'Data is required (at least one field)' });
  }

  return addRecord({
    tracker_name: tracker_name.trim(),
    data,
    status,
    priority,
    due_at,
    notes: notes?.trim(),
    tags,
  });
}

// =============================================================================
// UPDATE TRACKER RECORD TOOL
// =============================================================================

interface UpdateTrackerRecordArgs {
  record_id: string;
  data?: Record<string, any>;
  status?: string;
  priority?: number;
  due_at?: string | null;
  notes?: string | null;
  tags?: string[];
}

async function handleUpdateTrackerRecord(args: UpdateTrackerRecordArgs): Promise<string> {
  const { record_id, data, status, priority, due_at, notes, tags } = args;

  if (!record_id || record_id.trim().length === 0) {
    return JSON.stringify({ error: 'Record ID is required' });
  }

  const updates: any = {};
  if (data !== undefined) updates.data = data;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (due_at !== undefined) updates.due_at = due_at;
  if (notes !== undefined) updates.notes = notes;
  if (tags !== undefined) updates.tags = tags;

  return updateRecord(record_id.trim(), updates);
}

// =============================================================================
// QUERY TRACKER TOOL
// =============================================================================

interface QueryTrackerArgs {
  tracker_name: string;
  status?: string;
  filter?: Record<string, any>;
  limit?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

async function handleQueryTracker(args: QueryTrackerArgs): Promise<string> {
  const { tracker_name, status, filter, limit, sort_by, sort_dir } = args;

  if (!tracker_name || tracker_name.trim().length === 0) {
    return JSON.stringify({ error: 'Tracker name is required', records: [] });
  }

  return queryRecords({
    tracker_name: tracker_name.trim(),
    status,
    filter,
    limit,
    sort_by,
    sort_dir,
  });
}

// =============================================================================
// TRACKER SUMMARY TOOL
// =============================================================================

interface TrackerSummaryArgs {
  tracker_name: string;
}

async function handleTrackerSummary(args: TrackerSummaryArgs): Promise<string> {
  const { tracker_name } = args;

  if (!tracker_name || tracker_name.trim().length === 0) {
    return JSON.stringify({ error: 'Tracker name is required' });
  }

  return trackerSummary(tracker_name.trim());
}

// =============================================================================
// ARCHIVE TRACKER TOOL
// =============================================================================

interface ArchiveTrackerArgs {
  tracker_name: string;
}

async function handleArchiveTracker(args: ArchiveTrackerArgs): Promise<string> {
  const { tracker_name } = args;

  if (!tracker_name || tracker_name.trim().length === 0) {
    return JSON.stringify({ error: 'Tracker name is required' });
  }

  return archiveTracker(tracker_name.trim());
}

// =============================================================================
// TOOL SPECS EXPORT
// =============================================================================

export const tools: ToolSpec[] = [
  {
    name: 'create_tracker',
    description:
      'Create a new tracker with defined fields for structured data tracking. Use this when the user wants to start tracking something new with specific data fields (e.g., sales pipeline, project punch list, contact list, campaign tracker). Think of this as creating a lightweight database table for a specific situation.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the tracker (e.g., "March Padness", "Q1 Sales Pipeline")',
        },
        description: {
          type: 'string',
          description: 'Optional description of what this tracker is for',
        },
        category: {
          type: 'string',
          description: 'Optional category for organization (e.g., "sales", "projects", "contacts")',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for categorization',
        },
        fields: {
          type: 'array',
          description: 'Array of field definitions that define the schema for records in this tracker',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Field name (e.g., "dealer", "contact", "status", "amount")',
              },
              type: {
                type: 'string',
                enum: ['text', 'number', 'date', 'status', 'boolean'],
                description: 'Field type: text (string), number (numeric value), date (ISO date), status (predefined options), boolean (true/false)',
              },
              required: {
                type: 'boolean',
                description: 'Whether this field is required when adding records (default: false)',
              },
              description: {
                type: 'string',
                description: 'Optional description of what this field represents',
              },
              options: {
                type: 'array',
                items: { type: 'string' },
                description: 'For status fields: array of allowed values (e.g., ["pitched", "committed", "closed", "no-interest"])',
              },
            },
            required: ['name', 'type'],
          },
        },
        is_pinned: {
          type: 'boolean',
          description: 'Pin this tracker to the top of lists (default: false)',
        },
      },
      required: ['name', 'fields'],
    },
    handler: handleCreateTracker as ToolHandler,
  },
  {
    name: 'list_trackers',
    description:
      'List all active trackers. Use when the user asks what trackers exist, what he\'s tracking, or wants an overview of his tracking systems.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional: filter by category',
        },
      },
      required: [],
    },
    handler: handleListTrackers as ToolHandler,
  },
  {
    name: 'add_tracker_record',
    description:
      'Add a new record/entry to a tracker. Use when the user says things like "add [dealer name] to March Padness", "log a new entry", or provides data to track. The data object should contain field values matching the tracker\'s field definitions.',
    parameters: {
      type: 'object',
      properties: {
        tracker_name: {
          type: 'string',
          description: 'Name of the tracker to add the record to (supports fuzzy matching)',
        },
        data: {
          type: 'object',
          description: 'Object containing field values (e.g., {"dealer": "Carpet Plus", "status": "pitched", "amount": 2500}). Field names should match the tracker\'s field definitions.',
        },
        status: {
          type: 'string',
          description: 'Record status (default: "active"). Common values: active, completed, archived, cancelled',
        },
        priority: {
          type: 'number',
          description: 'Priority level from 1 (highest) to 5 (lowest). Default: 3',
        },
        due_at: {
          type: 'string',
          description: 'Optional due date in ISO format (e.g., "2024-03-15T00:00:00Z")',
        },
        notes: {
          type: 'string',
          description: 'Optional additional notes about this record',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for this specific record',
        },
      },
      required: ['tracker_name', 'data'],
    },
    handler: handleAddTrackerRecord as ToolHandler,
  },
  {
    name: 'update_tracker_record',
    description:
      'Update an existing tracker record. Use when the user says "mark [dealer] as closed", "update the amount for [dealer]", or wants to change data in an existing record. You need the record ID from a previous query.',
    parameters: {
      type: 'object',
      properties: {
        record_id: {
          type: 'string',
          description: 'UUID of the record to update (obtained from query_tracker results)',
        },
        data: {
          type: 'object',
          description: 'Object containing field values to update. Will be merged with existing data.',
        },
        status: {
          type: 'string',
          description: 'Update the record status (active, completed, archived, cancelled)',
        },
        priority: {
          type: 'number',
          description: 'Update priority (1-5)',
        },
        due_at: {
          type: 'string',
          description: 'Update due date (ISO format) or null to clear',
        },
        notes: {
          type: 'string',
          description: 'Update notes or null to clear',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Update tags',
        },
      },
      required: ['record_id'],
    },
    handler: handleUpdateTrackerRecord as ToolHandler,
  },
  {
    name: 'query_tracker',
    description:
      'Query and filter records in a tracker. Use when the user asks questions like "who haven\'t I contacted?", "show me all closed deals", "what\'s still open?", "show me my March Padness tracker". This is the main tool for answering questions about tracker data.',
    parameters: {
      type: 'object',
      properties: {
        tracker_name: {
          type: 'string',
          description: 'Name of the tracker to query (supports fuzzy matching)',
        },
        status: {
          type: 'string',
          description: 'Filter by record status (e.g., "active", "completed")',
        },
        filter: {
          type: 'object',
          description: 'JSONB filter on data fields. Example: {"status": "pitched"} to find records where the status field equals "pitched". Supports exact matches.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of records to return (default: 50)',
        },
        sort_by: {
          type: 'string',
          description: 'Field to sort by. Can be a data field name (e.g., "amount", "dealer") or system field (created_at, updated_at, due_at, priority). Default: created_at',
        },
        sort_dir: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction: asc (ascending) or desc (descending). Default: desc',
        },
      },
      required: ['tracker_name'],
    },
    handler: handleQueryTracker as ToolHandler,
  },
  {
    name: 'tracker_summary',
    description:
      'Get aggregate statistics and summary for a tracker. Use when the user wants a high-level overview: total records, breakdown by status, recent activity, etc. Great for answering "how\'s my [tracker] looking?" or "give me a summary of [tracker]".',
    parameters: {
      type: 'object',
      properties: {
        tracker_name: {
          type: 'string',
          description: 'Name of the tracker to summarize (supports fuzzy matching)',
        },
      },
      required: ['tracker_name'],
    },
    handler: handleTrackerSummary as ToolHandler,
  },
  {
    name: 'archive_tracker',
    description:
      'Archive a tracker when it\'s no longer needed. Use when the user says the tracker is done, completed, or he wants to remove it from active tracking.',
    parameters: {
      type: 'object',
      properties: {
        tracker_name: {
          type: 'string',
          description: 'Name of the tracker to archive',
        },
      },
      required: ['tracker_name'],
    },
    handler: handleArchiveTracker as ToolHandler,
  },
];
