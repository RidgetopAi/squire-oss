/**
 * Goal Worker - Background autonomous execution of Squire's personal goals
 * 
 * Runs as a Courier task. Picks the highest-priority active goal,
 * spins up an AgentEngine with a goal-focused prompt, lets it work
 * for up to 15 turns, then logs what happened.
 */

import { getNextGoal, markGoalWorkedOn, addGoalNote } from '../../planning/goals.js';
import { AgentEngine } from '../../agent/index.js';
import { notify } from '../notifier.js';
import { createEntry } from '../../storage/scratchpad.js';
import type { CourierTask, TaskResult } from './index.js';
import { config } from '../../../config/index.js';

// Time cap: configurable, defaults to 5 minutes
const MAX_EXECUTION_MS = config.goalWorker.maxExecutionMs;

// Track last execution to throttle to hourly even though Courier ticks every 30min
let lastExecutionAt: Date | null = null;

export const goalWorkerTask: CourierTask = {
  name: 'goal-worker',
  enabled: true,
  async execute(): Promise<TaskResult> {
    try {
      // Check if goal worker is enabled
      if (!config.goalWorker.enabled) {
        return { success: true, message: 'Goal worker disabled' };
      }

      // Throttle: skip if we ran less than intervalMs ago
      if (lastExecutionAt) {
        const elapsed = Date.now() - lastExecutionAt.getTime();
        if (elapsed < config.goalWorker.intervalMs) {
          const minutesLeft = Math.round((config.goalWorker.intervalMs - elapsed) / 60000);
          console.log(`[GoalWorker] Throttled - ${minutesLeft}min until next run`);
          return { success: true, message: `Throttled - ${minutesLeft}min remaining` };
        }
      }

      // 1. Get next goal to work on
      const goal = await getNextGoal();
      
      if (!goal) {
        console.log('[GoalWorker] No active goals to work on');
        return { success: true, message: 'No active goals' };
      }

      console.log(`[GoalWorker] Working on goal: "${goal.title}" (priority ${goal.priority})`);
      lastExecutionAt = new Date();
      
      // 2. Mark as being worked on
      await markGoalWorkedOn(goal.id);

      // 3. Build the goal-focused prompt
      const previousNotes = goal.notes.length > 0
        ? '\n\nPrevious progress notes:\n' + goal.notes.map(n => `- [${n.timestamp}] ${n.content}`).join('\n')
        : '';

      const prompt = `You are working on one of your personal goals during a background execution session. No human is present - you are working autonomously.

## Your Goal
**${goal.title}** (${goal.goal_type}, priority ${goal.priority}/5)

${goal.description}
${previousNotes}

## Instructions
1. Think about what progress you can make on this goal right now
2. Use your available tools (coding tools, search, scratchpad, notes) to make concrete progress
3. Be practical - do real work, not just planning
4. When done, use squire_goal_note to log what you accomplished
5. If the goal is complete, use squire_goal_update to mark it completed with an outcome

## Guardrails
- You have up to 15 tool calls
- Focus on this one goal only
- Be conservative with file modifications - prefer drafting in your scratchpad
- For significant code changes, note what you'd change rather than changing it directly

Begin working on your goal now.`;

      // 4. Run the agent with a timeout
      const engine = new AgentEngine({
        conversationId: `goal-worker-${goal.id}-${Date.now()}`,
        maxTurns: config.goalWorker.maxTurns,
        tier: 'fast',
        callbacks: {
          onStateChange: (state, turn) => console.log(`[GoalWorker] State: ${state}, Turn: ${turn}`),
          onToolCall: (name) => console.log(`[GoalWorker] Tool: ${name}`),
          onError: (err) => console.error(`[GoalWorker] Error:`, err),
        },
      });

      // Race the engine against timeout
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          engine.cancel();
          resolve(null);
        }, MAX_EXECUTION_MS);
      });

      const result = await Promise.race([
        engine.run(prompt),
        timeoutPromise,
      ]);

      // 5. Log what happened
      if (result === null) {
        // Timed out
        await addGoalNote(goal.id, `[Auto] Background session timed out after ${MAX_EXECUTION_MS / 1000}s`);
        console.log('[GoalWorker] Session timed out');
        return { success: true, message: `Goal "${goal.title}" - timed out` };
      }

      const summary = result.success 
        ? `Completed ${result.turnCount} turns. ${result.content.substring(0, 200)}`
        : `Failed: ${result.error || 'Unknown error'}`;

      // Auto-add a note about the session
      await addGoalNote(goal.id, `[Auto] Background session: ${result.turnCount} turns, state: ${result.state}. ${result.content.substring(0, 300)}`);

      // 6. Write to scratchpad so main Squire knows what happened
      try {
        await createEntry({
          entry_type: 'thread',
          content: `[Goal Worker] Completed work on "${goal.title}" (${result.turnCount} turns, ${result.state}). ${result.content.substring(0, 300)}`,
          priority: 2, // High priority so it gets noticed
          metadata: { goalId: goal.id, turns: result.turnCount, state: result.state }
        });
        console.log('[GoalWorker] Wrote progress to scratchpad');
      } catch (scratchpadError) {
        console.error('[GoalWorker] Scratchpad write failed:', scratchpadError);
      }

      // 7. Notify via Telegram (brief summary)
      const notifyMessage = `🎯 *Goal Worker*\nWorked on: _${goal.title}_\nTurns: ${result.turnCount} | Status: ${result.state}\n${result.content.substring(0, 200)}`;
      
      try {
        await notify(notifyMessage, { channels: ['telegram'] });
      } catch (notifyError) {
        console.error('[GoalWorker] Notification failed:', notifyError);
      }

      return {
        success: result.success,
        message: summary,
        data: { goalId: goal.id, turns: result.turnCount, state: result.state },
      };
    } catch (error) {
      console.error('[GoalWorker] Error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
};
