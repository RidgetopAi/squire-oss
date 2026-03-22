/**
 * Task Classifier for Model Routing
 *
 * Rule-based classification to determine which model tier to use.
 * Analyzes user input to route to appropriate model.
 */

import type { ModelTier } from './models.js';

// === Classification Keywords ===

/**
 * Keywords that indicate complex/coding tasks → smart tier (Sonnet)
 */
const SMART_KEYWORDS = [
  // Coding actions
  'edit', 'fix', 'implement', 'debug', 'refactor', 'create', 'write', 'change',
  'update', 'build', 'add', 'remove', 'delete', 'modify', 'patch',
  // Complex operations
  'analyze', 'design', 'architect', 'plan', 'explain how', 'help me understand',
  // Git operations that modify
  'commit', 'push', 'merge', 'rebase',
  // File modifications
  'file_write', 'file_edit', 'bash_execute',
];

/**
 * Keywords that indicate search/retrieval tasks → fast tier (Grok)
 */
const FAST_KEYWORDS = [
  // Search operations
  'find', 'search', 'list', 'show', 'what', 'where', 'which', 'grep', 'glob',
  // Retrieval
  'get', 'fetch', 'lookup', 'check', 'recent', 'latest',
  // Read-only operations
  'read', 'view', 'display', 'print', 'cat',
  // Simple queries
  'how many', 'count', 'status',
];

/**
 * Patterns that strongly indicate smart tier regardless of keywords
 */
const SMART_PATTERNS = [
  /fix\s+(the|this|a)\s+bug/i,
  /implement\s+/i,
  /refactor\s+/i,
  /create\s+(a|the|new)\s+/i,
  /write\s+(a|the|some)\s+/i,
  /add\s+(a|the|new)\s+/i,
  /debug\s+/i,
  /help\s+me\s+(build|create|implement|fix)/i,
];

/**
 * Patterns that strongly indicate fast tier
 */
const FAST_PATTERNS = [
  /^(find|search|list|show|what|where|which)\s+/i,
  /how\s+many\s+/i,
  /^(get|check)\s+(the\s+)?(status|recent|latest)/i,
];

// === Classification Logic ===

/**
 * Classify a user message to determine model tier
 *
 * @param input - The user's message
 * @returns The recommended model tier
 */
export function classifyTask(input: string): ModelTier {
  const lowerInput = input.toLowerCase();

  // Check strong patterns first (highest priority)
  for (const pattern of SMART_PATTERNS) {
    if (pattern.test(input)) {
      return 'smart';
    }
  }

  for (const pattern of FAST_PATTERNS) {
    if (pattern.test(input)) {
      return 'fast';
    }
  }

  // Count keyword matches
  let smartScore = 0;
  let fastScore = 0;

  for (const keyword of SMART_KEYWORDS) {
    if (lowerInput.includes(keyword)) {
      smartScore++;
    }
  }

  for (const keyword of FAST_KEYWORDS) {
    if (lowerInput.includes(keyword)) {
      fastScore++;
    }
  }

  // If clear winner by keywords, use that
  if (smartScore > fastScore && smartScore > 0) {
    return 'smart';
  }

  if (fastScore > smartScore && fastScore > 0) {
    return 'fast';
  }

  // Default to smart for safety (handles complex/ambiguous cases better)
  return 'smart';
}

/**
 * Get classification reasoning for debugging
 *
 * @param input - The user's message
 * @returns Object with tier and reasoning
 */
export function classifyWithReasoning(input: string): { tier: ModelTier; reason: string } {
  const lowerInput = input.toLowerCase();

  // Check patterns
  for (const pattern of SMART_PATTERNS) {
    if (pattern.test(input)) {
      return { tier: 'smart', reason: `Matched smart pattern: ${pattern}` };
    }
  }

  for (const pattern of FAST_PATTERNS) {
    if (pattern.test(input)) {
      return { tier: 'fast', reason: `Matched fast pattern: ${pattern}` };
    }
  }

  // Count keywords
  const smartMatches = SMART_KEYWORDS.filter(k => lowerInput.includes(k));
  const fastMatches = FAST_KEYWORDS.filter(k => lowerInput.includes(k));

  if (smartMatches.length > fastMatches.length && smartMatches.length > 0) {
    return { tier: 'smart', reason: `Smart keywords: ${smartMatches.join(', ')}` };
  }

  if (fastMatches.length > smartMatches.length && fastMatches.length > 0) {
    return { tier: 'fast', reason: `Fast keywords: ${fastMatches.join(', ')}` };
  }

  return { tier: 'smart', reason: 'Default to smart (no clear signals)' };
}
