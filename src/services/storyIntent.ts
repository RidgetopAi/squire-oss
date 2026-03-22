/**
 * Story Intent Service
 *
 * Detects when a user query is asking for a biographical narrative
 * (date meaning, origin story, relationship story, self story).
 *
 * Part of Phase 1: Story Engine - "Generate Not Retrieve" memory system
 */

import { complete, type LLMMessage } from '../providers/llm.js';

// === TYPES ===

export type StoryIntent =
  | { kind: 'none' }
  | { kind: 'date_meaning'; dateText: string }
  | { kind: 'origin_story'; topic?: string }
  | { kind: 'relationship_story'; personName: string | null }
  | { kind: 'self_story' };

interface StoryIntentDetection {
  kind: 'none' | 'date_meaning' | 'origin_story' | 'relationship_story' | 'self_story';
  dateText?: string;
  topic?: string;
  personName?: string | null;
}

// === INTENT DETECTION PROMPT ===

const STORY_INTENT_PROMPT = `You are analyzing user queries to detect if they are asking for personal biographical narratives.

Classify the query into ONE of these intents:

1. **date_meaning** - User asks what a specific date means to them personally
   Examples: "What does February 16th mean to me?", "What happened on my birthday?", "Why is March 3rd special?"
   Extract: dateText (the date mentioned)

2. **origin_story** - User asks about how something started, the beginning of a journey, or a pivotal moment
   Examples: "How did Squire start?", "Tell me about how I got into programming", "What was my first job like?"
   Extract: topic (what the origin story is about, if mentioned)

3. **relationship_story** - User asks about their relationship with a specific person
   Examples: "Tell me about Sarah", "How did I meet John?", "What's my history with mom?"
   Extract: personName (the person mentioned, or null if unclear)

4. **self_story** - User asks about themselves, their identity, or their journey in general
   Examples: "Who am I?", "Tell me about myself", "What makes me unique?", "What's my story?"

5. **none** - Query is NOT asking for a personal narrative/story
   Examples: "What's the weather?", "Set a reminder", "Add milk to my shopping list"

Respond with ONLY a JSON object:
{
  "kind": "none" | "date_meaning" | "origin_story" | "relationship_story" | "self_story",
  "dateText": "string (only for date_meaning)",
  "topic": "string (only for origin_story)",
  "personName": "string or null (only for relationship_story)"
}`;

// === HELPER FUNCTIONS ===

/**
 * Safely parse JSON from LLM response
 */
function safeParseJSON<T>(content: string): T | null {
  let jsonStr = content.trim();

  // Remove markdown code blocks if present
  jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  // Try to extract JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    try {
      const fixed = jsonStr.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(fixed) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Quick heuristic check for story-like queries
 * Returns true if the query might be asking for a story (worth LLM classification)
 */
function mightBeStoryQuery(query: string): boolean {
  const q = query.toLowerCase();

  // Date patterns
  const datePatterns = [
    /what does .+ mean to me/,
    /what happened on/,
    /why is .+ (special|significant|important)/,
    /tell me about .+ (day|date)/,
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d/i,
    /\d{1,2}\/\d{1,2}/,
  ];

  // Origin patterns
  const originPatterns = [
    /how did .+ (start|begin)/,
    /when did .+ (start|begin)/,
    /tell me (about )?how/,
    /what was my first/,
    /origin (of|story)/,
    /how i (got into|started|began)/,
  ];

  // Relationship patterns
  const relationshipPatterns = [
    /tell me about \w+/,
    /how did i meet/,
    /my (history|relationship) with/,
    /who is \w+ to me/,
  ];

  // Self patterns
  const selfPatterns = [
    /who am i/,
    /tell me about (myself|me)/,
    /what makes me/,
    /what.?s my story/,
    /my (identity|journey)/,
  ];

  const allPatterns = [
    ...datePatterns,
    ...originPatterns,
    ...relationshipPatterns,
    ...selfPatterns,
  ];

  return allPatterns.some((pattern) => pattern.test(q));
}

// === MAIN FUNCTION ===

/**
 * Detect if a query is asking for a biographical narrative
 *
 * Uses quick heuristics first, then LLM classification if needed.
 * This allows the Story Engine to handle the query differently from RAG.
 */
export async function detectStoryIntent(query: string): Promise<StoryIntent> {
  // Quick check - skip LLM for obviously non-story queries
  if (!mightBeStoryQuery(query)) {
    return { kind: 'none' };
  }

  try {
    const messages: LLMMessage[] = [
      { role: 'system', content: STORY_INTENT_PROMPT },
      { role: 'user', content: query },
    ];

    const result = await complete(messages, {
      temperature: 0.1,
      maxTokens: 150,
    });

    const parsed = safeParseJSON<StoryIntentDetection>(result.content);
    if (!parsed || !parsed.kind) {
      console.error('[StoryIntent] Failed to parse intent JSON:', result.content.substring(0, 200));
      return { kind: 'none' };
    }

    // Build the typed StoryIntent based on kind
    switch (parsed.kind) {
      case 'date_meaning':
        return {
          kind: 'date_meaning',
          dateText: parsed.dateText ?? '',
        };
      case 'origin_story':
        return {
          kind: 'origin_story',
          topic: parsed.topic,
        };
      case 'relationship_story':
        return {
          kind: 'relationship_story',
          personName: parsed.personName ?? null,
        };
      case 'self_story':
        return { kind: 'self_story' };
      default:
        return { kind: 'none' };
    }
  } catch (error) {
    console.error('[StoryIntent] Detection failed:', error);
    return { kind: 'none' };
  }
}

/**
 * Check if a StoryIntent indicates a story query (not 'none')
 */
export function isStoryIntent(intent: StoryIntent): boolean {
  return intent.kind !== 'none';
}

/**
 * Get a human-readable description of the intent
 */
export function describeIntent(intent: StoryIntent): string {
  switch (intent.kind) {
    case 'date_meaning':
      return `Date meaning query: "${intent.dateText}"`;
    case 'origin_story':
      return intent.topic
        ? `Origin story query about: ${intent.topic}`
        : 'Origin story query (general)';
    case 'relationship_story':
      return intent.personName
        ? `Relationship story about: ${intent.personName}`
        : 'Relationship story query';
    case 'self_story':
      return 'Self/identity story query';
    default:
      return 'Not a story query';
  }
}
