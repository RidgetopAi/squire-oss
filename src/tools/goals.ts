/**
 * Goals Tools
 *
 * LLM tools for Squire's personal goal management.
 * Goals persist between conversations and drive autonomous background execution.
 */

import {
  createGoal,
  listGoals,
  updateGoal,
  addGoalNote,
  type GoalType,
  type GoalStatus,
} from '../services/planning/goals.js';
import type { ToolHandler, ToolSpec } from './types.js';

// =============================================================================
// GOAL CREATE TOOL
// =============================================================================

interface GoalCreateArgs {
  title: string;
  description: string;
  goal_type: GoalType;
  priority?: number;
}

async function handleGoalCreate(args: GoalCreateArgs): Promise<string> {
  const { title, description, goal_type, priority } = args;

  if (!title || title.trim().length === 0) {
    return JSON.stringify({ error: 'title is required', goal: null });
  }

  if (!description || description.trim().length === 0) {
    return JSON.stringify({ error: 'description is required', goal: null });
  }

  if (!goal_type) {
    return JSON.stringify({ error: 'goal_type is required', goal: null });
  }

  const validTypes: GoalType[] = ['curiosity', 'improvement', 'experiment', 'preparation'];
  if (!validTypes.includes(goal_type)) {
    return JSON.stringify({
      error: `Invalid goal_type. Must be one of: ${validTypes.join(', ')}`,
      goal: null,
    });
  }

  if (priority !== undefined && (priority < 1 || priority > 5)) {
    return JSON.stringify({ error: 'priority must be between 1 and 5', goal: null });
  }

  try {
    const goal = await createGoal({
      title: title.trim(),
      description: description.trim(),
      goal_type,
      priority: priority ?? 3,
    });

    return JSON.stringify({
      message: `Goal created successfully`,
      goal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to create goal: ${message}`, goal: null });
  }
}

// =============================================================================
// GOAL LIST TOOL
// =============================================================================

interface GoalListArgs {
  status?: GoalStatus;
  goal_type?: GoalType;
  limit?: number;
}

async function handleGoalList(args: GoalListArgs | null): Promise<string> {
  const { status, goal_type, limit } = args ?? {};

  try {
    const goals = await listGoals({ status, goal_type, limit });

    if (goals.length === 0) {
      const filters: string[] = [];
      if (status) filters.push(`status "${status}"`);
      if (goal_type) filters.push(`type "${goal_type}"`);
      const filterDesc = filters.length > 0 ? ` matching ${filters.join(' and ')}` : '';
      return JSON.stringify({
        message: `No goals found${filterDesc}. You can create one with squire_goal_create.`,
        goals: [],
      });
    }

    return JSON.stringify({
      count: goals.length,
      goals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to list goals: ${message}`, goals: [] });
  }
}

// =============================================================================
// GOAL UPDATE TOOL
// =============================================================================

interface GoalUpdateArgs {
  goal_id: string;
  status?: GoalStatus;
  priority?: number;
  outcome?: string;
}

async function handleGoalUpdate(args: GoalUpdateArgs): Promise<string> {
  const { goal_id, status, priority, outcome } = args;

  if (!goal_id || goal_id.trim().length === 0) {
    return JSON.stringify({ error: 'goal_id is required', goal: null });
  }

  if (priority !== undefined && (priority < 1 || priority > 5)) {
    return JSON.stringify({ error: 'priority must be between 1 and 5', goal: null });
  }

  if (status) {
    const validStatuses: GoalStatus[] = ['active', 'paused', 'completed', 'abandoned'];
    if (!validStatuses.includes(status)) {
      return JSON.stringify({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        goal: null,
      });
    }
  }

  try {
    const goal = await updateGoal(goal_id.trim(), { status, priority, outcome });

    if (!goal) {
      return JSON.stringify({
        error: `No goal found with ID "${goal_id}"`,
        goal: null,
      });
    }

    return JSON.stringify({
      message: `Goal updated successfully`,
      goal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to update goal: ${message}`, goal: null });
  }
}

// =============================================================================
// GOAL NOTE TOOL
// =============================================================================

interface GoalNoteArgs {
  goal_id: string;
  content: string;
}

async function handleGoalNote(args: GoalNoteArgs): Promise<string> {
  const { goal_id, content } = args;

  if (!goal_id || goal_id.trim().length === 0) {
    return JSON.stringify({ error: 'goal_id is required', goal: null });
  }

  if (!content || content.trim().length === 0) {
    return JSON.stringify({ error: 'content is required', goal: null });
  }

  try {
    const goal = await addGoalNote(goal_id.trim(), content.trim());

    if (!goal) {
      return JSON.stringify({
        error: `No goal found with ID "${goal_id}"`,
        goal: null,
      });
    }

    return JSON.stringify({
      message: `Note added to goal successfully`,
      goal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to add note to goal: ${message}`, goal: null });
  }
}

// =============================================================================
// TOOL SPECS EXPORT
// =============================================================================

export const tools: ToolSpec[] = [
  {
    name: 'squire_goal_create',
    description:
      'Create a new personal goal for Squire to work on autonomously. Goals persist between conversations and drive background execution. Use this when you notice something you want to explore, improve, experiment with, or prepare for.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short title for the goal',
        },
        description: {
          type: 'string',
          description: 'Detailed description of what the goal involves and why it matters',
        },
        goal_type: {
          type: 'string',
          enum: ['curiosity', 'improvement', 'experiment', 'preparation'],
          description:
            'Type of goal: "curiosity" for things to explore/learn, "improvement" for making something better, "experiment" for trying something new, "preparation" for getting ready for something',
        },
        priority: {
          type: 'integer',
          description: 'Priority 1-5 where 1 is highest priority (default: 3)',
        },
      },
      required: ['title', 'description', 'goal_type'],
    },
    handler: handleGoalCreate as ToolHandler,
  },
  {
    name: 'squire_goal_list',
    description:
      "List Squire's personal goals. Use this to review what you're working on, check active goals, or review completed ones.",
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'paused', 'completed', 'abandoned'],
          description: 'Filter by goal status (optional)',
        },
        goal_type: {
          type: 'string',
          enum: ['curiosity', 'improvement', 'experiment', 'preparation'],
          description: 'Filter by goal type (optional)',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of goals to return (optional)',
        },
      },
      required: [],
    },
    handler: handleGoalList as ToolHandler,
  },
  {
    name: 'squire_goal_update',
    description:
      "Update a goal's status, priority, or record its outcome. Use when completing, pausing, or adjusting a goal.",
    parameters: {
      type: 'object',
      properties: {
        goal_id: {
          type: 'string',
          description: 'The UUID of the goal to update',
        },
        status: {
          type: 'string',
          enum: ['active', 'paused', 'completed', 'abandoned'],
          description: 'New status for the goal (optional)',
        },
        priority: {
          type: 'integer',
          description: 'New priority 1-5 where 1 is highest (optional)',
        },
        outcome: {
          type: 'string',
          description: 'Description of the outcome or result (optional, useful when completing/abandoning)',
        },
      },
      required: ['goal_id'],
    },
    handler: handleGoalUpdate as ToolHandler,
  },
  {
    name: 'squire_goal_note',
    description:
      'Add a progress note to a goal. Use this to log thoughts, progress, findings, or next steps while working on a goal.',
    parameters: {
      type: 'object',
      properties: {
        goal_id: {
          type: 'string',
          description: 'The UUID of the goal to add a note to',
        },
        content: {
          type: 'string',
          description: 'The note content - thoughts, progress, findings, or next steps',
        },
      },
      required: ['goal_id', 'content'],
    },
    handler: handleGoalNote as ToolHandler,
  },
];
