/**
 * Scratchpad Tools
 *
 * LLM tools for Squire's short-term working memory.
 * Stores active threads, observations, questions, ideas, and contextual notes.
 */

import {
  createEntry,
  listEntries,
  resolveEntry,
  resolveEntryByContent,
  type ScratchpadEntryType,
} from '../services/scratchpad.js';
import type { ToolHandler, ToolSpec } from './types.js';

// =============================================================================
// SCRATCHPAD WRITE TOOL
// =============================================================================

interface ScratchpadWriteArgs {
  entry_type: ScratchpadEntryType;
  content: string;
  priority?: number;
  expires_in_hours?: number;
  metadata?: Record<string, unknown>;
}

async function handleScratchpadWrite(args: ScratchpadWriteArgs): Promise<string> {
  const { entry_type, content, priority, expires_in_hours, metadata } = args;

  if (!entry_type) {
    return JSON.stringify({ error: 'entry_type is required', entry: null });
  }

  const validTypes: ScratchpadEntryType[] = ['thread', 'observation', 'question', 'idea', 'context'];
  if (!validTypes.includes(entry_type)) {
    return JSON.stringify({
      error: `Invalid entry_type. Must be one of: ${validTypes.join(', ')}`,
      entry: null,
    });
  }

  if (!content || content.trim().length === 0) {
    return JSON.stringify({ error: 'content is required', entry: null });
  }

  if (priority !== undefined && (priority < 1 || priority > 5)) {
    return JSON.stringify({ error: 'priority must be between 1 and 5', entry: null });
  }

  try {
    const entry = await createEntry({
      entry_type,
      content: content.trim(),
      priority,
      expires_in_hours,
      metadata,
    });

    return JSON.stringify({
      message: `${entry_type} entry created successfully`,
      entry: {
        id: entry.id,
        entry_type: entry.entry_type,
        content: entry.content,
        priority: entry.priority,
        created_at: entry.created_at,
        expires_at: entry.expires_at,
        metadata: entry.metadata,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to create scratchpad entry: ${message}`, entry: null });
  }
}

// =============================================================================
// SCRATCHPAD READ TOOL
// =============================================================================

interface ScratchpadReadArgs {
  entry_type?: ScratchpadEntryType;
  include_resolved?: boolean;
  limit?: number;
}

async function handleScratchpadRead(args: ScratchpadReadArgs | null): Promise<string> {
  const { entry_type, include_resolved = false, limit = 20 } = args ?? {};

  try {
    const entries = await listEntries({
      entry_type,
      include_resolved,
      limit,
    });

    if (entries.length === 0) {
      const typeFilter = entry_type ? ` of type "${entry_type}"` : '';
      return JSON.stringify({
        message: `No active scratchpad entries${typeFilter}`,
        entries: [],
      });
    }

    // Format entries for LLM consumption
    const formattedEntries = entries.map((entry) => ({
      id: entry.id,
      entry_type: entry.entry_type,
      content: entry.content,
      priority: entry.priority,
      created_at: entry.created_at,
      expires_at: entry.expires_at,
      resolved_at: entry.resolved_at,
      metadata: entry.metadata,
    }));

    // Group by type for easier reading
    const byType: Record<string, typeof formattedEntries> = {};
    for (const entry of formattedEntries) {
      const typeKey = entry.entry_type;
      if (!byType[typeKey]) {
        byType[typeKey] = [];
      }
      byType[typeKey]!.push(entry);
    }

    return JSON.stringify({
      count: entries.length,
      by_type: byType,
      entries: formattedEntries,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to read scratchpad: ${message}`, entries: [] });
  }
}

// =============================================================================
// SCRATCHPAD RESOLVE TOOL
// =============================================================================

interface ScratchpadResolveArgs {
  entry_id?: string;
  content_match?: string;
}

async function handleScratchpadResolve(args: ScratchpadResolveArgs): Promise<string> {
  const { entry_id, content_match } = args;

  if (!entry_id && !content_match) {
    return JSON.stringify({
      error: 'Either entry_id or content_match is required',
      entry: null,
    });
  }

  try {
    let entry;

    if (entry_id) {
      entry = await resolveEntry(entry_id);
    } else if (content_match) {
      entry = await resolveEntryByContent(content_match);
    }

    if (!entry) {
      const identifier = entry_id ? `ID "${entry_id}"` : `content matching "${content_match}"`;
      return JSON.stringify({
        error: `No active scratchpad entry found with ${identifier}`,
        entry: null,
      });
    }

    return JSON.stringify({
      message: `${entry.entry_type} entry resolved successfully`,
      entry: {
        id: entry.id,
        entry_type: entry.entry_type,
        content: entry.content,
        resolved_at: entry.resolved_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to resolve scratchpad entry: ${message}`, entry: null });
  }
}

// =============================================================================
// TOOL SPECS EXPORT
// =============================================================================

export const tools: ToolSpec[] = [
  {
    name: 'scratchpad_write',
    description:
      'Write an entry to the scratchpad - your short-term working memory. Use for tracking active threads, observations you want to remember but not blurt out, questions to ask later, ideas for improvements, or short-term context that may expire.',
    parameters: {
      type: 'object',
      properties: {
        entry_type: {
          type: 'string',
          enum: ['thread', 'observation', 'question', 'idea', 'context'],
          description:
            'Type of entry: "thread" for active things being tracked, "observation" for things noticed but not to share immediately, "question" for questions to ask when timing is right, "idea" for feature/improvement ideas, "context" for short-term situational context',
        },
        content: {
          type: 'string',
          description: 'The content of the scratchpad entry',
        },
        priority: {
          type: 'number',
          description: 'Priority 1-5 where 1 is highest priority (default: 3)',
        },
        expires_in_hours: {
          type: 'number',
          description:
            'Hours until this entry auto-expires (useful for "context" entries like "Today: in Lynchburg")',
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata (tags, related entities, custom data)',
        },
      },
      required: ['entry_type', 'content'],
    },
    handler: handleScratchpadWrite as ToolHandler,
  },
  {
    name: 'scratchpad_read',
    description:
      'Read current scratchpad entries. Use this to recall what you are tracking, pending questions, observations, ideas, or current context. By default shows only active (non-resolved, non-expired) entries.',
    parameters: {
      type: 'object',
      properties: {
        entry_type: {
          type: 'string',
          enum: ['thread', 'observation', 'question', 'idea', 'context'],
          description: 'Filter by entry type (optional)',
        },
        include_resolved: {
          type: 'boolean',
          description: 'Include resolved entries (default: false)',
        },
        limit: {
          type: 'number',
          description: 'Maximum entries to return (default: 20)',
        },
      },
      required: [],
    },
    handler: handleScratchpadRead as ToolHandler,
  },
  {
    name: 'scratchpad_resolve',
    description:
      'Mark a scratchpad entry as resolved/done. Use when a thread is closed, a question has been answered, or an observation is no longer relevant. You can resolve by entry ID or by matching content.',
    parameters: {
      type: 'object',
      properties: {
        entry_id: {
          type: 'string',
          description: 'The UUID of the entry to resolve',
        },
        content_match: {
          type: 'string',
          description: 'Partial content match to find and resolve the entry (case-insensitive)',
        },
      },
      required: [],
    },
    handler: handleScratchpadResolve as ToolHandler,
  },
];
