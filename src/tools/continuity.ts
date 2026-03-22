/**
 * Continuity Tools (Memory Upgrade Phase 2)
 *
 * LLM tools for managing continuity threads — ongoing life threads
 * that persist across sessions with emotional weight and follow-ups.
 */

import {
  getActiveThreads,
  updateThread,
  resolveThread,
  type ContinuityThreadStatus,
} from '../services/continuity.js';
import type { ToolHandler, ToolSpec } from './types.js';

// =============================================================================
// CONTINUITY READ
// =============================================================================

interface ContinuityReadArgs {
  status?: ContinuityThreadStatus;
  limit?: number;
}

async function handleContinuityRead(args: ContinuityReadArgs | null): Promise<string> {
  const { status, limit = 10 } = args ?? {};

  try {
    const threads = await getActiveThreads({
      status: status ?? 'active',
      limit,
    });

    if (threads.length === 0) {
      return JSON.stringify({
        message: `No ${status ?? 'active'} continuity threads`,
        threads: [],
      });
    }

    const formatted = threads.map((t) => ({
      id: t.id,
      title: t.title,
      type: t.thread_type,
      status: t.status,
      importance: t.importance,
      emotional_weight: t.emotional_weight,
      state: t.current_state_summary,
      last_transition: t.last_state_transition,
      followup_question: t.next_followup_question,
      followup_after: t.followup_after,
      last_discussed: t.last_discussed_at,
      tags: t.tags,
    }));

    return JSON.stringify({ count: threads.length, threads: formatted });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to read threads: ${message}`, threads: [] });
  }
}

// =============================================================================
// CONTINUITY UPDATE
// =============================================================================

interface ContinuityUpdateArgs {
  thread_id: string;
  status?: ContinuityThreadStatus;
  current_state_summary?: string;
  importance?: number;
  emotional_weight?: number;
  next_followup_question?: string;
}

async function handleContinuityUpdate(args: ContinuityUpdateArgs): Promise<string> {
  if (!args.thread_id) {
    return JSON.stringify({ error: 'thread_id is required' });
  }

  try {
    const thread = await updateThread(args.thread_id, {
      status: args.status,
      current_state_summary: args.current_state_summary,
      importance: args.importance,
      emotional_weight: args.emotional_weight,
      next_followup_question: args.next_followup_question,
    });

    if (!thread) {
      return JSON.stringify({ error: `Thread ${args.thread_id} not found` });
    }

    return JSON.stringify({
      message: 'Thread updated',
      thread: {
        id: thread.id,
        title: thread.title,
        status: thread.status,
        state: thread.current_state_summary,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to update thread: ${message}` });
  }
}

// =============================================================================
// CONTINUITY RESOLVE
// =============================================================================

interface ContinuityResolveArgs {
  thread_id: string;
  summary?: string;
}

async function handleContinuityResolve(args: ContinuityResolveArgs): Promise<string> {
  if (!args.thread_id) {
    return JSON.stringify({ error: 'thread_id is required' });
  }

  try {
    const thread = await resolveThread(args.thread_id, args.summary);

    if (!thread) {
      return JSON.stringify({ error: `Thread ${args.thread_id} not found` });
    }

    return JSON.stringify({
      message: `Thread "${thread.title}" resolved`,
      thread: {
        id: thread.id,
        title: thread.title,
        status: thread.status,
        resolved_at: thread.resolved_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to resolve thread: ${message}` });
  }
}

// =============================================================================
// TOOL SPECS
// =============================================================================

export const tools: ToolSpec[] = [
  {
    name: 'continuity_read',
    description:
      'Read active continuity threads — ongoing things in this person\'s life that you are tracking. Includes projects, emotional loads, health concerns, family matters, and goals. Use this to recall what they have going on.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'watching', 'dormant', 'resolved'],
          description: 'Filter by status (default: active)',
        },
        limit: {
          type: 'number',
          description: 'Max threads to return (default: 10)',
        },
      },
      required: [],
    },
    handler: handleContinuityRead as ToolHandler,
  },
  {
    name: 'continuity_update',
    description:
      'Update a continuity thread with new state information, importance changes, or follow-up questions. Use when someone shares progress on something you are tracking.',
    parameters: {
      type: 'object',
      properties: {
        thread_id: {
          type: 'string',
          description: 'UUID of the thread to update',
        },
        status: {
          type: 'string',
          enum: ['active', 'watching', 'dormant'],
          description: 'New status',
        },
        current_state_summary: {
          type: 'string',
          description: 'Updated summary of where things stand',
        },
        importance: {
          type: 'number',
          description: 'New importance level (1-10)',
        },
        emotional_weight: {
          type: 'number',
          description: 'New emotional weight (0-10)',
        },
        next_followup_question: {
          type: 'string',
          description: 'A natural question to ask next time this comes up',
        },
      },
      required: ['thread_id'],
    },
    handler: handleContinuityUpdate as ToolHandler,
  },
  {
    name: 'continuity_resolve',
    description:
      'Mark a continuity thread as resolved. Use when something is finished, completed, or no longer relevant.',
    parameters: {
      type: 'object',
      properties: {
        thread_id: {
          type: 'string',
          description: 'UUID of the thread to resolve',
        },
        summary: {
          type: 'string',
          description: 'Brief summary of how it was resolved',
        },
      },
      required: ['thread_id'],
    },
    handler: handleContinuityResolve as ToolHandler,
  },
];
