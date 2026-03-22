/**
 * Salience Scoring Service (Slice 2)
 *
 * Heuristic-based salience scoring - no LLM required.
 * Important memories float to top, trivial memories fade in ranking.
 */

/**
 * Salience factor weights (from roadmap)
 * Total = 1.0
 */
const SALIENCE_WEIGHTS = {
  temporal_relevance: 0.20, // deadlines, dates
  relationship: 0.20, // people mentioned
  action_language: 0.20, // commitments, decisions
  explicit_marking: 0.15, // "remember", "important"
  self_reference: 0.15, // identity, feelings
  length_complexity: 0.10, // detail richness
} as const;

/**
 * Individual factor scores (0-10 scale)
 */
export interface SalienceFactors {
  temporal_relevance: number;
  relationship: number;
  action_language: number;
  explicit_marking: number;
  self_reference: number;
  length_complexity: number;
}

export interface SalienceResult {
  score: number;
  factors: SalienceFactors;
}

// === PATTERN DEFINITIONS ===

/**
 * Temporal patterns - dates, deadlines, time references
 */
const TEMPORAL_PATTERNS = [
  // Deadline/due language (standalone is enough)
  /\b(deadline|due\s+date|due\s+by|due\s+on)/i,
  // Days of week (any context)
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  // Days with context (stronger signal)
  /\b(on|by|before|after|this|next|until)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  // Time-sensitive language
  /\b(urgent|asap|immediately|time.?sensitive|critical|pressing)/i,
  // Date mentions
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
  /\b\d{1,2}(\/|-)\d{1,2}(\/|-)\d{2,4}/,
  // Relative time
  /\b(in\s+\d+\s+(day|week|hour|month)s?)/i,
  /\b(tomorrow|tonight|today|this\s+(morning|afternoon|evening|week|month))/i,
  // End of period
  /\b(end\s+of\s+(week|month|day|year|quarter))/i,
  // Decision deadlines
  /\b(decide\s+by|decide\s+before|decision\s+by)/i,
];

/**
 * Relationship patterns - people, meetings, social context
 */
const RELATIONSHIP_PATTERNS = [
  // Meeting/interaction language
  /\b(met\s+with|meeting\s+with|talked\s+to|spoke\s+with|called|emailed|messaged)\s+/i,
  // Relationship markers
  /\b(my\s+)?(wife|husband|partner|boss|manager|colleague|friend|mom|dad|mother|father|brother|sister|son|daughter)/i,
  // Professional relationships
  /\b(ceo|cto|cfo|vp|director|lead|manager|team|client|customer)\b/i,
  // Name patterns (capitalized words following social verbs)
  /\b(with|from|to)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?/,
  // Offered/proposed by someone
  /\b(offered|proposed|suggested|asked|invited)\s+(me|by)/i,
];

/**
 * Action language - commitments, decisions, changes
 */
const ACTION_PATTERNS = [
  // Decisions (to make or already made)
  /\b(decided|decision|choose|chose|selected|picked|decide\b)/i,
  /\b(going\s+to|will\s+(be|do|start|stop|try|take|accept|decline))/i,
  // Commitments
  /\b(promised|committed|agreed|pledged|must|need\s+to|have\s+to|should|ought\s+to)/i,
  // Changes
  /\b(changed|switching|moving\s+to|starting|stopping|quitting|leaving|joining)/i,
  // Offers and opportunities (major life events)
  /\b(offered\s+me|offered\s+a|got\s+an?\s+offer)/i,
  /\b(opportunity|promotion|raise|job\s+offer|position|role)\b/i,
  /\b(cto|ceo|cfo|vp|director|manager|lead)\s+(position|role|job)/i,
  // Accomplishments
  /\b(completed|finished|achieved|accomplished|shipped|launched|released)/i,
  // Plans
  /\b(planning|plan\s+to|intend|going\s+to|will\s+be)/i,
  // Life decisions
  /\b(accept|decline|reject|turn\s+down|take\s+the)/i,
];

/**
 * Explicit importance markers
 */
const EXPLICIT_PATTERNS = [
  /\b(important|remember|don'?t\s+forget|critical|crucial|essential|key|vital)/i,
  /\b(never\s+forget|always\s+remember|note\s+to\s+self)/i,
  /\b(!!!|!!|\*\*\*)/,
  /\b(priority|high.?priority|top\s+priority|urgent)/i,
  /\b(big\s+(deal|news|thing)|huge|major|significant)/i,
  /\b(life.?changing|game.?changer|breakthrough)/i,
];

/**
 * Self-reference patterns - identity, feelings, personal growth
 */
const SELF_REFERENCE_PATTERNS = [
  // Feelings
  /\b(i\s+feel|i\s+felt|feeling|i'?m\s+(happy|sad|excited|worried|anxious|scared|proud|grateful|frustrated|angry|confused))/i,
  // Identity
  /\b(i\s+am|i'?m\s+a|i\s+believe|my\s+(values?|beliefs?|principles?))/i,
  // Personal decisions
  /\b(i\s+decided|i\s+chose|i\s+realized|i\s+learned|i\s+discovered)/i,
  // Goals and aspirations
  /\b(my\s+goal|i\s+want|i\s+wish|i\s+hope|dream\s+of|aspire)/i,
  // Reflections
  /\b(i\s+think|i\s+thought|made\s+me\s+realize|it\s+hit\s+me)/i,
  // Personal experiences
  /\b(happened\s+to\s+me|i\s+experienced|my\s+(experience|journey|story))/i,
];

// === SCORING FUNCTIONS ===

/**
 * Count pattern matches and return a 0-10 score
 */
function scorePatterns(content: string, patterns: RegExp[]): number {
  let matches = 0;
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      matches++;
    }
  }
  // Scale: 0 matches = 0, 1 match = 4, 2 matches = 6, 3+ matches = 8-10
  if (matches === 0) return 0;
  if (matches === 1) return 4;
  if (matches === 2) return 6;
  if (matches === 3) return 8;
  return Math.min(10, 8 + matches - 3);
}

/**
 * Score temporal relevance (deadlines, dates, time-sensitivity)
 */
function scoreTemporal(content: string): number {
  return scorePatterns(content, TEMPORAL_PATTERNS);
}

/**
 * Score relationship markers (people, meetings, social context)
 */
function scoreRelationship(content: string): number {
  // Also check for capitalized proper names (simple heuristic)
  const namePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g;
  const names = content.match(namePattern) || [];
  // Filter out common words that happen to be capitalized
  const commonWords = new Set([
    'I',
    'The',
    'This',
    'That',
    'These',
    'Those',
    'What',
    'When',
    'Where',
    'Why',
    'How',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]);
  const actualNames = names.filter((n) => !commonWords.has(n));

  const patternScore = scorePatterns(content, RELATIONSHIP_PATTERNS);
  const nameBonus = Math.min(4, actualNames.length * 2);

  return Math.min(10, patternScore + nameBonus);
}

/**
 * Score action language (commitments, decisions, changes)
 */
function scoreAction(content: string): number {
  return scorePatterns(content, ACTION_PATTERNS);
}

/**
 * Score explicit importance markers
 */
function scoreExplicit(content: string): number {
  return scorePatterns(content, EXPLICIT_PATTERNS);
}

/**
 * Score self-reference (identity, feelings, personal)
 */
function scoreSelfReference(content: string): number {
  return scorePatterns(content, SELF_REFERENCE_PATTERNS);
}

/**
 * Score length/complexity (detail richness)
 * Longer, more detailed content tends to be more important
 */
function scoreLengthComplexity(content: string): number {
  const words = content.split(/\s+/).length;
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim()).length;

  // Short (< 10 words): 2
  // Medium (10-30 words): 5
  // Long (30-60 words): 7
  // Very long (60+ words): 9
  let lengthScore: number;
  if (words < 10) lengthScore = 2;
  else if (words < 30) lengthScore = 5;
  else if (words < 60) lengthScore = 7;
  else lengthScore = 9;

  // Bonus for multiple sentences (indicates structure)
  const sentenceBonus = Math.min(1, (sentences - 1) * 0.5);

  return Math.min(10, lengthScore + sentenceBonus);
}

// === MAIN SCORING FUNCTION ===

/**
 * Calculate salience score for content
 *
 * Returns a score from 0-10 and the breakdown of factors.
 * Higher salience = more important memory.
 */
export function calculateSalience(content: string): SalienceResult {
  const factors: SalienceFactors = {
    temporal_relevance: scoreTemporal(content),
    relationship: scoreRelationship(content),
    action_language: scoreAction(content),
    explicit_marking: scoreExplicit(content),
    self_reference: scoreSelfReference(content),
    length_complexity: scoreLengthComplexity(content),
  };

  // Calculate weighted score
  let score = 0;
  for (const [factor, weight] of Object.entries(SALIENCE_WEIGHTS)) {
    score += factors[factor as keyof SalienceFactors] * weight;
  }

  // Ensure score is in valid range
  score = Math.min(10.0, Math.max(0.0, score));

  // Round to 1 decimal place
  score = Math.round(score * 10) / 10;

  return { score, factors };
}
