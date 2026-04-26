/**
 * Expression-Time Safety Filter (Phase 5)
 *
 * Last line of defense before memories surface in responses.
 * Even if junk memories make it to storage, this filter prevents
 * them from awkwardly appearing in conversation.
 *
 * Batch filters memories through LLM: "Would saying this now feel natural?"
 * Filter criteria: clearly true, stable, non-creepy, contextually relevant
 * Skip: vague debugging chatter, meta-AI nitpicking, ephemeral/uncertain info
 */

// === TYPES ===

export interface FilteredMemory {
  id: string;
  content: string;
  passed: boolean;
  reason?: string;
}

export interface ExpressionFilterResult {
  filtered: FilteredMemory[];
  passedIds: string[];
  blockedIds: string[];
  blockedCount: number;
  passedCount: number;
}

export interface MemoryToFilter {
  id: string;
  content: string;
}

// === HEURISTIC FILTERS ===

/**
 * Quick heuristic pre-filter to skip obvious safe memories
 * Returns true if memory should SKIP LLM filter (definitely safe)
 *
 * Philosophy: be generous. Losing a real memory is worse than keeping noise.
 */
export function shouldSkipFilter(content: string): boolean {
  const lower = content.toLowerCase();

  // Biographical facts - always safe
  const biographicalPatterns = [
    /\buser'?s?\s+name\s+is\b/i,
    /\buser\s+is\s+from\b/i,
    /\buser'?s?\s+(wife|husband|spouse|partner)\s+is\b/i,
    /\buser'?s?\s+(son|daughter|child|kid)\b/i,
    /\buser\s+lives\s+in\b/i,
    /\buser\s+was\s+born\b/i,
    /\buser'?s?\s+(mother|father|mom|dad|brother|sister)\b/i,
    /\buser'?s?\s+(dog|cat|pet)\b/i,
    /\buser\s+(works?|is)\s+(as|a|an|in)\b/i,
    /\buser\s+is\s+a\s+fan\s+of\b/i,
    /\buser'?s?\s+(favorite|favourite)\b/i,
    /\buser\s+prefers?\b/i,
  ];

  if (biographicalPatterns.some((p) => p.test(lower))) {
    return true;
  }

  // Plans, goals, ambitions - always safe
  const planPatterns = [
    /\buser\s+(wants?|plans?|aims?|hopes?|intends?)\s+to\s+(?!be reminded)/i,
    /\buser\s+built\b/i,
    /\buser\s+created\b/i,
    /\buser\s+developed\b/i,
    /\buser'?s?\s+goal\b/i,
    /\buser'?s?\s+vision\b/i,
  ];

  if (planPatterns.some((p) => p.test(content))) {
    return true;
  }

  // Work context - clients, industry, deals - always safe
  const workPatterns = [
    /\buser'?s?\s+work\b/i,
    /\buser'?s?\s+(job|role|position|career)\b/i,
    /\bflooring\s+(rep|representative|sales)\b/i,
    /\bclient|customer|account\b/i,
  ];

  if (workPatterns.some((p) => p.test(lower))) {
    return true;
  }

  // Life events - always safe
  const lifeEventPatterns = [
    /\buser\s+(applied|interviewed|got|lost|started|quit|moved|married|divorced)\b/i,
    /\bdid\s+not\s+get\s+(a|the)\s+job\b/i,
  ];

  if (lifeEventPatterns.some((p) => p.test(lower))) {
    return true;
  }

  return false;
}

/**
 * Quick heuristic pre-filter to block obvious junk
 * Returns true if memory should be BLOCKED without LLM call
 */
export function shouldBlockWithoutFilter(content: string): boolean {
  const lower = content.toLowerCase();

  // Meta-AI debugging patterns - always block
  const metaAiPatterns = [
    /\b(fix|debug|implement|refactor)\s+(the|this|a)\s+(bug|error|issue|code)\b/i,
    /\b(run|running)\s+(the\s+)?(tests?|build|compile)\b/i,
    /\bworking\s+on\s+(fixing|debugging|implementing)\b/i,
    /\b(typescript|javascript|react|sql)\s+error\b/i,
  ];

  if (metaAiPatterns.some((p) => p.test(lower))) {
    return true;
  }

  // Time-specific reminders and errands - always block
  const reminderPatterns = [
    /\breminder\s+(for|at|to)\s+.*(am|pm|\d{1,2}:\d{2})/i,
    /\bremind(ed)?\s+(me|the user)\s+.*(am|pm|\d{1,2}:\d{2})/i,
    /\buser\s+(wants?|needs?)\s+(a\s+)?reminder\b/i,
    /\bhas\s+a\s+reminder\s+(set|for)\b/i,
    /\b(start|turn on)\s+the\s+(oven|lights?|stove|dryer|washer)\b/i,
    /\bchange\s+(the\s+)?laundry\b/i,
    /\bfill\s+(the\s+)?(dog\s+food|water)\s+(containers?|bowls?)\b/i,
    /\breminder\s+set\s+for\s+\d+\s+minutes?\b/i,
  ];

  if (reminderPatterns.some((p) => p.test(lower))) {
    return true;
  }

  return false;
}

