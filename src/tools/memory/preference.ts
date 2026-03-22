/**
 * Preference Tools - agent self-tuning preferences
 *
 * Tools for managing agent preferences about working style.
 * - preference_update: Update a preference
 * - preference_get: Get current preferences
 */

import { getPreference, getAllPreferences, updatePreference } from '../../services/memory/index.js';
import type { ToolHandler, ToolSpec } from '../types.js';
import type { PreferenceUpdateArgs, PreferenceGetArgs } from './types.js';

// === preference_update ===

const preferenceUpdateHandler: ToolHandler<PreferenceUpdateArgs> = async (args) => {
  try {
    const { key, value, reasoning } = args;
    const pref = await updatePreference(key, value, reasoning);
    return JSON.stringify({
      message: 'Preference updated',
      key: pref.key,
      value: pref.value,
      confidence: pref.confidence,
    });
  } catch (error) {
    return `Failed to update preference: ${error instanceof Error ? error.message : String(error)}`;
  }
};

// === preference_get ===

const preferenceGetHandler: ToolHandler<PreferenceGetArgs> = async (args) => {
  try {
    const { key } = args || {};

    if (key) {
      const pref = await getPreference(key);
      if (!pref) {
        return `No preference found for key: ${key}`;
      }
      return JSON.stringify({
        key: pref.key,
        value: pref.value,
        reasoning: pref.reasoning,
        confidence: pref.confidence,
      });
    }

    const prefs = await getAllPreferences();
    if (prefs.length === 0) {
      return 'No preferences set yet.';
    }

    const formatted = prefs
      .map((p) => `- ${p.key}: ${p.value} (confidence: ${p.confidence.toFixed(1)})`)
      .join('\n');

    return `Current preferences:\n${formatted}`;
  } catch (error) {
    return `Failed to get preferences: ${error instanceof Error ? error.message : String(error)}`;
  }
};

// === Tool Specs ===

export const tools: ToolSpec[] = [
  {
    name: 'preference_update',
    description:
      'Update a self-tuning preference about working style. Preferences help you remember how Brian likes things done.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Preference key (e.g., "response_length", "code_style", "humor_level")',
        },
        value: {
          type: 'string',
          description: 'The preference value',
        },
        reasoning: {
          type: 'string',
          description: 'Why this preference was set (optional)',
        },
      },
      required: ['key', 'value'],
    },
    handler: preferenceUpdateHandler as ToolHandler,
  },
  {
    name: 'preference_get',
    description:
      'Get current preferences. Call without key to get all preferences, or with key to get a specific one.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Specific preference key to get (optional - omit for all)',
        },
      },
      required: [],
    },
    handler: preferenceGetHandler as ToolHandler,
  },
];
