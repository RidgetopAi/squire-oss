/**
 * Memory Retrieval - Inject relevant lessons into agent context
 */

import { searchLessons, getAllLessons, incrementUseCount, type Lesson } from './lessons.js';
import { getAllPreferences, type Preference } from './preferences.js';

/**
 * Retrieve lessons relevant to the user's input
 */
export async function retrieveRelevantLessons(
  userInput: string,
  limit: number = 5
): Promise<Lesson[]> {
  try {
    // If input is short or generic, return top lessons by importance
    if (userInput.length < 20) {
      return getAllLessons(limit);
    }
    // Semantic search for relevant lessons
    return searchLessons(userInput, limit);
  } catch (error) {
    console.error('[Memory] Failed to retrieve lessons:', error);
    return [];
  }
}

/**
 * Format lessons for injection into system context
 */
export function formatLessonsForContext(lessons: Lesson[]): string {
  if (lessons.length === 0) return '';

  const formatted = lessons.map(l => {
    const cat = l.category ? `[${l.category}] ` : '';
    return `- ${cat}${l.content}`;
  }).join('\n');

  return `## Lessons from Experience\n\nThings I've learned that may be relevant:\n${formatted}`;
}

/**
 * Format preferences for injection into system context
 */
export function formatPreferencesForContext(preferences: Preference[]): string {
  if (preferences.length === 0) return '';

  // Only include high-confidence preferences
  const highConfidence = preferences.filter(p => p.confidence >= 0.6);
  if (highConfidence.length === 0) return '';

  const formatted = highConfidence.map(p => `- ${p.key}: ${p.value}`).join('\n');

  return `## Working Preferences\n\n${formatted}`;
}

/**
 * Build full memory context for agent
 */
export async function buildMemoryContext(userInput: string): Promise<string> {
  try {
    const [lessons, preferences] = await Promise.all([
      retrieveRelevantLessons(userInput, 5),
      getAllPreferences(),
    ]);

    // Track lesson usage
    for (const lesson of lessons) {
      await incrementUseCount(lesson.id).catch(() => {});
    }

    const parts: string[] = [];

    const lessonsContext = formatLessonsForContext(lessons);
    if (lessonsContext) parts.push(lessonsContext);

    const prefsContext = formatPreferencesForContext(preferences);
    if (prefsContext) parts.push(prefsContext);

    return parts.join('\n\n');
  } catch (error) {
    console.error('[Memory] Failed to build memory context:', error);
    return '';
  }
}
