/**
 * Commitment Tools
 *
 * LLM tools for managing user commitments/tasks.
 * Allows the model to list open commitments and mark them complete.
 */

import {
  listCommitments,
  resolveCommitment,
  findMatchingCommitments,
  type Commitment,
  type ResolutionType,
} from '../services/commitments.js';
import {
  listReminders,
  markReminderAcknowledged,
  type Reminder,
} from '../services/reminders.js';
import { pool } from '../db/pool.js';
import { config } from '../config/index.js';
import type { ToolHandler, ToolSpec } from './types.js';

// =============================================================================
// REMINDER SEARCH HELPER
// =============================================================================

interface ReminderMatch {
  reminder: Reminder;
  similarity: number;
}

async function findMatchingReminders(
  text: string,
  options: { limit?: number } = {}
): Promise<ReminderMatch[]> {
  const { limit = 5 } = options;

  // Search reminders by text similarity using ILIKE
  // Reminders have short, simple titles that work well with text search
  const textResult = await pool.query<Reminder>(
    `SELECT * FROM reminders
     WHERE status IN ('pending', 'sent')
       AND (title ILIKE $1 OR title ILIKE $2)
     ORDER BY scheduled_for DESC
     LIMIT $3`,
    [`%${text}%`, `%${text.split(' ').join('%')}%`, limit]
  );

  return textResult.rows.map((r) => ({
    reminder: r,
    similarity: 0.7, // Text match gets decent similarity
  }));
}

// =============================================================================
// HELPERS
// =============================================================================

function formatCommitment(c: Commitment) {
  const dueLabel = c.due_at
    ? c.due_at.toLocaleDateString('en-US', {
        timeZone: config.timezone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : 'No due date';

  const isOverdue = c.due_at && new Date(c.due_at) < new Date();

  return {
    id: c.id,
    title: c.title,
    description: c.description,
    status: c.status,
    due_at: c.due_at?.toISOString() ?? null,
    due_label: dueLabel,
    is_overdue: isOverdue,
    tags: c.tags,
  };
}

// =============================================================================
// LIST OPEN COMMITMENTS TOOL
// =============================================================================

interface ListOpenCommitmentsArgs {
  include_overdue?: boolean;
  limit?: number;
}

async function handleListOpenCommitments(args: ListOpenCommitmentsArgs | null): Promise<string> {
  const { limit = 20 } = args ?? {};

  try {
    // Get open commitments
    const commitments = await listCommitments({
      status: ['open', 'in_progress'],
      limit,
    });

    // Get pending/sent reminders (exclude commitment-linked reminders to avoid duplicates)
    const allReminders = await listReminders({
      status: ['pending', 'sent'],
      limit,
    });
    const reminders = allReminders.filter((r) => r.commitment_id === null);

    const formattedCommitments = commitments.map((c) => ({
      ...formatCommitment(c),
      type: 'commitment',
    }));

    const formattedReminders = reminders.map((r) => ({
      id: r.id,
      title: r.title ?? 'Untitled reminder',
      description: r.body,
      status: r.status,
      due_at: r.scheduled_for?.toISOString() ?? null,
      due_label: r.scheduled_for
        ? r.scheduled_for.toLocaleDateString('en-US', {
            timeZone: config.timezone,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        : 'No time set',
      is_overdue: r.scheduled_for && new Date(r.scheduled_for) < new Date(),
      type: 'reminder',
    }));

    const allItems = [...formattedCommitments, ...formattedReminders];

    if (allItems.length === 0) {
      return JSON.stringify({
        message: 'No open commitments, tasks, or reminders',
        count: 0,
        items: [],
      });
    }

    const overdueCount = allItems.filter((c) => c.is_overdue).length;

    return JSON.stringify({
      count: allItems.length,
      commitment_count: formattedCommitments.length,
      reminder_count: formattedReminders.length,
      overdue_count: overdueCount,
      usage_note: 'Use complete_commitment with id or title_match to mark items done. Works for both commitments and reminders.',
      items: allItems,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to list items: ${message}`, items: [] });
  }
}

// Exported in tools array below

// =============================================================================
// COMPLETE COMMITMENT TOOL
// =============================================================================

interface CompleteCommitmentArgs {
  commitment_id?: string;
  title_match?: string;
  resolution_type?: ResolutionType;
}

async function handleCompleteCommitment(args: CompleteCommitmentArgs | null): Promise<string> {
  const { commitment_id, title_match, resolution_type = 'completed' } = args ?? {};

  if (!commitment_id && !title_match) {
    return JSON.stringify({
      error: 'Either commitment_id or title_match is required',
      resolved: null,
    });
  }

  try {
    let targetId: string | null = null;
    let targetType: 'commitment' | 'reminder' = 'commitment';

    // If we have a direct ID, try commitment first, then reminder
    if (commitment_id) {
      targetId = commitment_id;
      // We'll try commitment first in the resolution step
    } else if (title_match) {
      // Search commitments first
      const commitmentMatches = await findMatchingCommitments(title_match, {
        limit: 3,
        minSimilarity: 0.4,
      });

      // Also search reminders
      const reminderMatches = await findMatchingReminders(title_match, {
        limit: 3,
      });

      // Combine and sort by similarity
      type Match = { id: string; title: string; similarity: number; type: 'commitment' | 'reminder' };
      const allMatches: Match[] = [
        ...commitmentMatches.map((m) => ({
          id: m.id,
          title: m.title,
          similarity: m.similarity,
          type: 'commitment' as const,
        })),
        ...reminderMatches.map((m) => ({
          id: m.reminder.id,
          title: m.reminder.title ?? 'Untitled reminder',
          similarity: m.similarity,
          type: 'reminder' as const,
        })),
      ].sort((a, b) => b.similarity - a.similarity);

      if (allMatches.length === 0) {
        return JSON.stringify({
          error: `No open commitment or reminder found matching "${title_match}"`,
          resolved: null,
          suggestion: 'Use list_open_commitments to see all open items',
        });
      }

      const bestMatch = allMatches[0]!;
      const secondMatch = allMatches[1];

      // Use best match if it's clearly the winner
      const isClearWinner =
        allMatches.length === 1 ||
        bestMatch.similarity >= 0.6 ||
        (secondMatch && bestMatch.similarity - secondMatch.similarity >= 0.15);

      if (!isClearWinner && allMatches.length > 1) {
        return JSON.stringify({
          error: 'Multiple similar items found. Which one did you mean?',
          matches: allMatches.slice(0, 5).map((m) => ({
            id: m.id,
            title: m.title,
            type: m.type,
            similarity: Math.round(m.similarity * 100) + '%',
          })),
          resolved: null,
        });
      }

      targetId = bestMatch.id;
      targetType = bestMatch.type;
    }

    if (!targetId) {
      return JSON.stringify({
        error: 'Could not determine which item to complete',
        resolved: null,
      });
    }

    // Try to resolve based on type
    if (targetType === 'reminder' || commitment_id) {
      // If it's a reminder OR we have a direct ID (try both)
      if (targetType === 'reminder') {
        const reminder = await markReminderAcknowledged(targetId);
        if (reminder) {
          return JSON.stringify({
            message: `Marked reminder "${reminder.title}" as done`,
            resolved: {
              id: reminder.id,
              title: reminder.title,
              type: 'reminder',
              status: 'acknowledged',
            },
          });
        }
      }
    }

    // Try commitment resolution
    const resolved = await resolveCommitment(targetId, {
      resolution_type,
    });

    if (resolved) {
      return JSON.stringify({
        message: `Marked "${resolved.title}" as ${resolution_type}`,
        resolved: {
          id: resolved.id,
          title: resolved.title,
          type: 'commitment',
          status: resolved.status,
          resolution_type: resolved.resolution_type,
          resolved_at: resolved.resolved_at?.toISOString(),
        },
      });
    }

    // Last resort: try as reminder if commitment failed
    const reminder = await markReminderAcknowledged(targetId);
    if (reminder) {
      return JSON.stringify({
        message: `Marked reminder "${reminder.title}" as done`,
        resolved: {
          id: reminder.id,
          title: reminder.title,
          type: 'reminder',
          status: 'acknowledged',
        },
      });
    }

    return JSON.stringify({
      error: `Item ${targetId} not found or already completed`,
      resolved: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to complete item: ${message}`, resolved: null });
  }
}

// =============================================================================
// TOOL SPECS EXPORT
// =============================================================================

export const tools: ToolSpec[] = [
  {
    name: 'list_open_commitments',
    description:
      'List the user\'s open commitments, tasks, and pending reminders. Use this when the user asks "what do I have to do?", "what tasks are open?", "show my commitments", "what reminders do I have?", or when you need to find something to mark complete.',
    parameters: {
      type: 'object',
      properties: {
        include_overdue: {
          type: 'boolean',
          description: 'Include overdue commitments (default: true)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of commitments to return (default: 20)',
        },
      },
      required: [],
    },
    handler: handleListOpenCommitments as ToolHandler,
  },
  {
    name: 'complete_commitment',
    description:
      'Mark a commitment, task, or reminder as complete/done. Use this when the user says they finished something, completed a task, did a reminder, or wants to mark something done. Searches both commitments AND reminders. You can specify by ID or by title match. Examples: "mark the dentist appointment done", "I finished that", "that call is done".',
    parameters: {
      type: 'object',
      properties: {
        commitment_id: {
          type: 'string',
          description: 'The UUID of the commitment to complete (from list_open_commitments)',
        },
        title_match: {
          type: 'string',
          description: 'A phrase to match against commitment titles (used if commitment_id not provided)',
        },
        resolution_type: {
          type: 'string',
          enum: ['completed', 'canceled', 'no_longer_relevant', 'superseded'],
          description: 'How the commitment was resolved (default: completed)',
        },
      },
      required: [],
    },
    handler: handleCompleteCommitment as ToolHandler,
  },
];
