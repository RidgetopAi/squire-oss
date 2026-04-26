/**
 * Chat Extraction Service
 *
 * Extracts memories from chat conversations during consolidation.
 * Analyzes user messages to identify facts, decisions, goals, and preferences
 * worth remembering long-term.
 */

import { pool } from '../../db/pool.js';
import { complete, type LLMMessage } from '../../providers/llm.js';
import { createMemory } from '../knowledge/memories.js';
import { processMemoryForBeliefs } from '../knowledge/beliefs.js';
import { classifyMemoryCategories, linkMemoryToCategories, getSummary, updateSummary, type CategoryClassification } from '../summaries.js';
import { processMessagesForResolutions, type ResolutionCandidate } from '../planning/resolution.js';
import { getUserIdentity, setInitialIdentity } from '../identity.js';
import { invalidateStoryCache } from '../story/storyEngine.js';
import { checkReinforcement } from '../reinforcement.js';
import { createContinuityEntry } from '../storage/scratchpad.js';
import { findOrCreateThreadFromTransition } from '../continuity.js';

// === TYPES ===

export interface ExtractedMemory {
  content: string;
  type: 'fact' | 'decision' | 'goal' | 'event' | 'preference';
  salience_hint: number;
  confidence?: number; // 0.0-1.0, added in Phase 3 for tiering
  state_transitions?: StateTransitionSignal[];
}

// === STATE TRANSITIONS (Memory Upgrade Phase 1) ===

export type StateTransition = 'planned' | 'started' | 'blocked' | 'completed' | 'abandoned' | 'deferred';

export interface StateTransitionSignal {
  transition: StateTransition;
  subject: string;
  confidence: number;
}

// === SALIENCE CALIBRATION ===

/**
 * Calibrate salience score for biographical/origin content
 * 
 * The LLM extraction often undervalues origin stories and life-changing moments.
 * This function boosts salience for content that matches biographical patterns.
 * 
 * Part of Phase 0: "Generate Not Retrieve" memory system
 */
function calibrateSalienceForBiographical(
  mem: ExtractedMemory,
  classifications?: Array<{ category: string; relevance: number }>
): number {
  const base = mem.salience_hint ?? 5;
  const content = mem.content.toLowerCase();

  // Check classifications if provided
  const hasPersonality = classifications?.some(
    (c) => c.category === 'personality' && c.relevance >= 0.6
  ) ?? false;
  const hasRelationships = classifications?.some(
    (c) => c.category === 'relationships' && c.relevance >= 0.6
  ) ?? false;

  // Identity and core personality facts → highest salience
  if (hasPersonality && (mem.type === 'fact' || mem.type === 'event')) {
    // User's name, core identity → 10
    if (content.includes("user's name is") || content.includes('name is')) {
      return 10;
    }
    return Math.max(base, 9);
  }

  // Origin story patterns - these should NEVER be filtered out
  const originPatterns = [
    'first time',
    'where it all started',
    'origin story',
    'this is how',
    'this is why',
    'changed my life',
    'life-changing',
    'pivotal moment',
    'turning point',
    'when i realized',
    'when i decided',
    'the day i',
    'the moment i',
    'began my journey',
    'started my',
    'how i got into',
    'how it all began',
  ];

  const hasOriginPattern = originPatterns.some((p) => content.includes(p));
  if (hasOriginPattern && (mem.type === 'event' || mem.type === 'fact')) {
    return Math.max(base, 9);
  }

  // Significant dates with emotional/biographical meaning
  const datePatterns = [
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
    /\b(birthday|anniversary|wedding|graduation|funeral|passed away|died)\b/i,
  ];
  
  const hasSignificantDate = datePatterns.some((p) => p.test(content));
  if (hasSignificantDate && (mem.type === 'event' || mem.type === 'fact')) {
    return Math.max(base, 8);
  }

  // Relationship-defining content → high salience
  if (hasRelationships && mem.type === 'event') {
    return Math.max(base, 8);
  }

  // Key life facts: age, occupation, location
  const lifeFactPatterns = [
    /\b\d+\s*years?\s*old\b/i,
    /works?\s+(at|for)\b/i,
    /lives?\s+in\b/i,
    /(wife|husband|spouse|partner|daughter|son|child|mother|father|parent)/i,
  ];
  
  const hasLifeFact = lifeFactPatterns.some((p) => p.test(content));
  if (hasLifeFact && mem.type === 'fact') {
    return Math.max(base, 8);
  }

  // Goals and aspirations → moderately high
  if (mem.type === 'goal') {
    return Math.max(base, 7);
  }

  return base;
}

// === EVENT DATE EXTRACTION ===

/**
 * Extract a normalized date from event-type memory content
 * 
 * Part of Phase 2: Memory Graph Traversal
 * Enables date-based seeds for Story Engine queries like "What does February 16th mean to me?"
 */
function extractEventDate(content: string): Date | null {
  const text = content.toLowerCase();

  // Month names and abbreviations
  const months: Record<string, number> = {
    january: 0, jan: 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8, sept: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11,
  };

  // Pattern: "Month Day, Year" or "Month Day Year" (e.g., "February 16, 2025")
  const fullDateMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/i
  );
  if (fullDateMatch && fullDateMatch[1] && fullDateMatch[2] && fullDateMatch[3]) {
    const month = months[fullDateMatch[1].toLowerCase()];
    const day = parseInt(fullDateMatch[2], 10);
    const year = parseInt(fullDateMatch[3], 10);
    if (month !== undefined && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return new Date(year, month, day);
    }
  }

  // Pattern: "MM/DD/YYYY" or "M/D/YYYY"
  const numericMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (numericMatch && numericMatch[1] && numericMatch[2] && numericMatch[3]) {
    const month = parseInt(numericMatch[1], 10) - 1;
    const day = parseInt(numericMatch[2], 10);
    const year = parseInt(numericMatch[3], 10);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return new Date(year, month, day);
    }
  }

  // Pattern: "YYYY-MM-DD" (ISO format)
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch && isoMatch[1] && isoMatch[2] && isoMatch[3]) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return new Date(year, month, day);
    }
  }

  return null;
}

export interface ConversationForExtraction {
  id: string;
  client_id: string | null;
  message_count: number;
  created_at: Date;
}

export interface PendingMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sequence_number: number;
  created_at: Date;
}

export interface ExtractionResult {
  conversationsProcessed: number;
  messagesProcessed: number;
  memoriesCreated: number;
  commitmentsCreated: number;
  commitmentsResolved: number;
  resolutionsPending: ResolutionCandidate[];
  remindersCreated: number;
  beliefsCreated: number;
  beliefsReinforced: number;
  skippedEmpty: number;
  errors: string[];
}

// === CONVERSATION MODE (Phase 1) ===

/**
 * Conversation modes for routing extraction and context injection
 * 
 * - personal: Personal life, relationships, health, emotions, family
 * - work: Professional tasks, projects, career, job-related
 * - meta_ai: Conversations about Squire/AI development, debugging, coding WITH the AI
 * - other: General conversation not fitting above categories
 */
export type ConversationMode = 'personal' | 'work' | 'meta_ai' | 'other';

export interface ConversationModeResult {
  mode: ConversationMode;
  confidence: number;
  reasoning: string;
}

// === EXTRACTION PROMPT ===

/**
 * Phase 2: Episodic Consolidation + Phase 3: Confidence Scoring
 * 
 * Treats each conversation batch as an "episode" - extracts only the key takeaways
 * that the user would want remembered tomorrow, not every pattern match.
 * 
 * MAX 3 MEMORIES per episode to prevent noise accumulation.
 * Each memory includes a confidence score for tiering (hypothesis vs solid).
 */
const EXTRACTION_SYSTEM_PROMPT = `You are analyzing a conversation episode to extract what the user would want remembered TOMORROW.

Treat this conversation as a small episode. Extract only the KEY TAKEAWAYS - things that would still matter next week.

=== RULES ===
1. Output AT MOST 3 memories per episode (pick the most important)
2. Prefer "wrap-up" statements: "Ok, I'll do X", "So the plan is...", "I've decided to..."
3. Skip mid-process debugging, problem-solving chatter, and vague statements
4. Only encode if it would still make sense and be useful next week

=== CONFIDENCE SCORING (0.0 to 1.0) ===
For each memory, add a "confidence" field indicating how certain/stable the information is:

- 0.9-1.0: DEFINITELY TRUE - explicitly stated, stable facts, core identity
  Examples: "My name is Brian", "I'm 56 years old", "I work at TechCorp"
  
- 0.7-0.9: LIKELY TRUE - clearly implied, strong decisions, clear intent
  Examples: "I've decided to take the job", "We're moving to Austin next month"
  
- 0.5-0.7: POSSIBLY TRUE - might change, conditional, exploratory
  Examples: "I'm thinking about switching careers", "Maybe I'll try yoga"
  
- 0.3-0.5: UNCERTAIN - contextual, ephemeral, could easily change
  Examples: "I'm stressed about the deadline", "I might go to the gym later"

=== PRIORITIZE ===
- User conclusions: "I've decided to...", "I'm going to...", "The plan is..."
- Clear future intent with specifics (dates, names, actions)
- Identity facts: name, relationships, job, age, location
- Origin stories and life-changing moments

=== DEPRIORITIZE (often skip entirely) ===
- Questions without conclusions
- Mid-debugging statements: "fix this", "try that", "let me check"
- "We should X" without "I will do X"
- Vague problem descriptions
- Repetitive back-and-forth

=== IDENTITY EXTRACTION (always highest priority) ===
When the user introduces themselves (e.g., "I'm Brian", "My name is Sarah"):
→ Extract: "The user's name is [NAME]" with salience_hint: 10, confidence: 0.95
Key relationships with names:
→ "My wife is Sarah" → salience_hint: 8, confidence: 0.9

Always use "The user" format for identity facts.

=== EXAMPLES ===

Example episode (debugging session):
User: This bug is driving me crazy
User: Let me try restarting the server
User: Hmm, that didn't work
User: Oh wait, I think I found it - the config was wrong
User: Ok fixed it, moving on

Output:
[]
(Reason: No durable takeaways - just mid-process debugging)

Example episode (personal + conclusion):
User: Hello I'm Brian
User: I've been thinking about whether to take that new job
User: You know what, I've decided I'm going to accept the offer at TechCorp

Output:
[
  {"content": "The user's name is Brian", "type": "fact", "salience_hint": 10, "confidence": 0.95},
  {"content": "The user has decided to accept a job offer at TechCorp", "type": "decision", "salience_hint": 8, "confidence": 0.85}
]
(Reason: Identity is near-certain; decision is strong but could theoretically change)

Example episode (exploratory):
User: I'm thinking about learning Spanish
User: Maybe I'll sign up for a class next month
User: Or maybe I'll just use an app

Output:
[
  {"content": "The user is considering learning Spanish", "type": "goal", "salience_hint": 5, "confidence": 0.5}
]
(Reason: Exploratory thought, not a firm decision - low confidence)

If there's nothing worth remembering tomorrow, return: []

=== STATE TRANSITIONS ===
If the user mentions something changing state, include a "state_transitions" array on the response object (sibling to the memories array).
Each entry: {"transition": "planned|started|blocked|completed|abandoned|deferred", "subject": "what changed", "confidence": 0.0-1.0}
Only include clear transitions. If none, omit the field entirely.

Examples of state transitions:
- "I started the deck project" → {"transition": "started", "subject": "deck project", "confidence": 0.9}
- "The quarterly report is done" → {"transition": "completed", "subject": "quarterly report", "confidence": 0.95}
- "I'm stuck on the permit application" → {"transition": "blocked", "subject": "permit application", "confidence": 0.8}
- "I've decided not to do the kitchen remodel" → {"transition": "abandoned", "subject": "kitchen remodel", "confidence": 0.85}
- "I'm putting the garden on hold until spring" → {"transition": "deferred", "subject": "garden", "confidence": 0.9}

When state transitions are present, return a JSON object: {"memories": [...], "state_transitions": [...]}
When NO state transitions are detected, return just the memories array: [...]

IMPORTANT: Return ONLY valid JSON (array or object), no markdown, no explanation. MAX 3 memories. Include confidence for each.`;

// === CONVERSATION MODE CLASSIFIER (Phase 1) ===

const CONVERSATION_MODE_PROMPT = `Classify this conversation transcript into exactly ONE mode.

MODES:
- "personal": About the user's personal life, family, relationships, health, emotions, hobbies, daily life
- "work": About professional tasks, career, job projects, business, workplace topics  
- "meta_ai": Conversations about AI development, debugging code, building/fixing Squire, coding WITH the AI assistant
- "other": General topics that don't fit the above categories

CRITICAL DISTINCTION:
- If the user is DEBUGGING or DEVELOPING an AI/software project WITH the AI assistant → meta_ai
- If the user is DISCUSSING their work life, job, or career with the AI → work
- "Fix the bug", "help me debug this", "run the tests", "implement this feature" → meta_ai
- "I have a meeting tomorrow", "need to finish the report", "my boss wants..." → work

Return JSON:
{
  "mode": "personal" | "work" | "meta_ai" | "other",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Examples:

Transcript: "User: My wife Sherrie and I are going to dinner tonight"
Output: {"mode": "personal", "confidence": 0.95, "reasoning": "Discussing personal life - spouse and evening plans"}

Transcript: "User: I need to ship this feature by Friday. User: Can you help fix the TypeScript error?"
Output: {"mode": "meta_ai", "confidence": 0.9, "reasoning": "User is debugging/developing code with the AI"}

Transcript: "User: I have a presentation at work tomorrow"
Output: {"mode": "work", "confidence": 0.9, "reasoning": "Discussing professional work activity"}

Transcript: "User: What's the weather like today?"
Output: {"mode": "other", "confidence": 0.85, "reasoning": "General question not fitting other categories"}

IMPORTANT: Return ONLY valid JSON, no markdown.`;

/**
 * Classify the conversation mode from a transcript
 * 
 * Phase 1 of memory extraction false-positive reduction.
 * Routes extraction differently based on conversation context.
 */
async function classifyConversationMode(
  transcript: string
): Promise<ConversationModeResult> {
  const defaultResult: ConversationModeResult = {
    mode: 'other',
    confidence: 0.5,
    reasoning: 'Default classification',
  };

  if (!transcript || transcript.trim().length < 10) {
    return defaultResult;
  }

  // Quick heuristic checks for obvious meta_ai conversations
  const lowerTranscript = transcript.toLowerCase();
  const metaAiPatterns = [
    /\b(fix|debug|implement|refactor|test|build|compile|deploy)\b.*\b(bug|error|issue|code|function|component|service)\b/i,
    /\b(typescript|javascript|react|node|sql|api|endpoint|schema|migration)\b/i,
    /\b(npm|yarn|git|commit|push|pull|branch|merge)\b/i,
    /\bsquire\b.*\b(app|project|feature|memory|extraction)\b/i,
    /\b(look at|read|check|update|modify)\b.*\.(ts|js|tsx|jsx|sql|json)\b/i,
  ];

  const isLikelyMetaAi = metaAiPatterns.some((p) => p.test(lowerTranscript));
  
  // If obviously meta_ai, skip LLM call
  if (isLikelyMetaAi) {
    return {
      mode: 'meta_ai',
      confidence: 0.85,
      reasoning: 'Heuristic: contains development/coding terminology',
    };
  }

  try {
    const messages: LLMMessage[] = [
      { role: 'system', content: CONVERSATION_MODE_PROMPT },
      { role: 'user', content: `Classify this transcript:\n\n${transcript.slice(0, 2000)}` },
    ];

    const response = await complete(messages, {
      temperature: 0.1,
      maxTokens: 150,
    });

    const content = response.content?.trim();
    if (!content) return defaultResult;

    // Parse JSON response
    let jsonStr = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as ConversationModeResult;

    // Validate mode
    const validModes: ConversationMode[] = ['personal', 'work', 'meta_ai', 'other'];
    if (!validModes.includes(parsed.mode)) {
      return defaultResult;
    }

    return {
      mode: parsed.mode,
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
      reasoning: parsed.reasoning ?? 'LLM classification',
    };
  } catch (error) {
    console.error('[ChatExtraction] Mode classification failed:', error);
    return defaultResult;
  }
}

/**
 * Safely parse JSON from LLM response, handling common issues
 */
function safeParseJSON<T>(content: string): T | null {
  // Clean up the content
  let jsonStr = content.trim();

  // Remove markdown code blocks if present
  jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  // Try to extract JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  // Try parsing
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Try fixing common issues: trailing commas, unquoted keys
    try {
      // Remove trailing commas before } or ]
      const fixed = jsonStr.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(fixed) as T;
    } catch {
      return null;
    }
  }
}

// === CORE FUNCTIONS ===

/**
 * Get conversations with pending (unextracted) messages
 */
async function getPendingConversations(): Promise<ConversationForExtraction[]> {
  const result = await pool.query<ConversationForExtraction>(`
    SELECT DISTINCT c.id, c.client_id, c.message_count, c.created_at
    FROM conversations c
    JOIN chat_messages cm ON cm.conversation_id = c.id
    WHERE cm.extraction_status = 'pending'
      AND cm.role = 'user'  -- Only consider user messages
      AND c.status = 'active'
    ORDER BY c.created_at DESC
  `);

  return result.rows;
}

/**
 * Get pending user messages for a conversation
 */
async function getPendingMessages(
  conversationId: string
): Promise<PendingMessage[]> {
  const result = await pool.query<PendingMessage>(`
    SELECT id, conversation_id, role, content, sequence_number, created_at
    FROM chat_messages
    WHERE conversation_id = $1
      AND extraction_status = 'pending'
      AND role = 'user'
    ORDER BY sequence_number ASC
  `, [conversationId]);

  return result.rows;
}

/**
 * Build a transcript from messages for LLM analysis
 */
function buildTranscript(messages: PendingMessage[]): string {
  return messages
    .map((m) => `User: ${m.content}`)
    .join('\n');
}

interface ExtractionOutput {
  memories: ExtractedMemory[];
  stateTransitions: StateTransitionSignal[];
}

/**
 * Call LLM to extract memories from transcript
 */
async function extractFromTranscript(
  transcript: string
): Promise<ExtractionOutput> {
  if (!transcript.trim()) {
    return { memories: [], stateTransitions: [] };
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: transcript },
  ];

  try {
    const result = await complete(messages, {
      temperature: 0.2, // Low temperature for consistent extraction
      maxTokens: 2000,
    });

    // Parse JSON response
    const content = result.content.trim();

    // Handle empty response
    if (!content || content === '[]') {
      return { memories: [], stateTransitions: [] };
    }

    // Response may be an object with {memories, state_transitions} or a plain array
    let memories: ExtractedMemory[] = [];
    let stateTransitions: StateTransitionSignal[] = [];

    // Try object format first: {"memories": [...], "state_transitions": [...]}
    const objMatch = content.match(/\{[\s\S]*\}/);
    const arrMatch = content.match(/\[[\s\S]*\]/);

    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0]) as {
          memories?: ExtractedMemory[];
          state_transitions?: StateTransitionSignal[];
        };
        if (parsed.memories && Array.isArray(parsed.memories)) {
          memories = parsed.memories;
          stateTransitions = (parsed.state_transitions ?? []).filter(
            (st) => st.transition && st.subject && st.confidence >= 0.5
          );
        } else if (arrMatch) {
          // Object didn't have memories key — try array
          memories = JSON.parse(arrMatch[0]) as ExtractedMemory[];
        }
      } catch {
        // Object parse failed, try array
        if (arrMatch) {
          memories = JSON.parse(arrMatch[0]) as ExtractedMemory[];
        }
      }
    } else if (arrMatch) {
      memories = JSON.parse(arrMatch[0]) as ExtractedMemory[];
    }

    // Validate and filter memories
    const validated = memories.filter((m) =>
      m.content &&
      typeof m.content === 'string' &&
      m.content.length > 5 &&
      m.salience_hint >= 1 &&
      m.salience_hint <= 10
    );

    // Phase 2: Episodic Consolidation - enforce hard cap of 3 memories per episode
    // Sort by salience (highest first) to keep the most important ones
    const sorted = validated.sort((a, b) => b.salience_hint - a.salience_hint);
    const limited = sorted.slice(0, 3);

    if (validated.length > 3) {
      console.log(`[ChatExtraction] Episodic limit applied: ${validated.length} → 3 memories (dropped ${validated.length - 3})`);
    }

    if (stateTransitions.length > 0) {
      console.log(`[ChatExtraction] Detected ${stateTransitions.length} state transition(s): ${stateTransitions.map(st => `${st.subject} → ${st.transition}`).join(', ')}`);
    }

    return { memories: limited, stateTransitions };
  } catch (error) {
    console.error('[ChatExtraction] Failed to parse LLM response:', error);
    return { memories: [], stateTransitions: [] };
  }
}

/**
 * Mark messages as extracted
 */
async function markMessagesExtracted(
  conversationId: string,
  messageIds: string[]
): Promise<void> {
  if (messageIds.length === 0) return;

  await pool.query(`
    UPDATE chat_messages
    SET extraction_status = 'extracted',
        extracted_at = NOW()
    WHERE conversation_id = $1
      AND id = ANY($2)
  `, [conversationId, messageIds]);
}

/**
 * Mark messages as skipped (nothing to extract)
 */
async function markMessagesSkipped(
  conversationId: string,
  messageIds: string[]
): Promise<void> {
  if (messageIds.length === 0) return;

  await pool.query(`
    UPDATE chat_messages
    SET extraction_status = 'skipped',
        extracted_at = NOW()
    WHERE conversation_id = $1
      AND id = ANY($2)
  `, [conversationId, messageIds]);
}

/**
 * Extract memories from a single conversation
 */
async function extractFromConversation(
  conversation: ConversationForExtraction
): Promise<{
  memoriesCreated: number;
  commitmentsCreated: number;
  commitmentsResolved: number;
  resolutionsPending: ResolutionCandidate[];
  remindersCreated: number;
  beliefsCreated: number;
  beliefsReinforced: number;
  messagesProcessed: number;
  skipped: boolean;
  error?: string;
}> {
  const messages = await getPendingMessages(conversation.id);

  if (messages.length === 0) {
    return {
      memoriesCreated: 0,
      commitmentsCreated: 0,
      commitmentsResolved: 0,
      resolutionsPending: [],
      remindersCreated: 0,
      beliefsCreated: 0,
      beliefsReinforced: 0,
      messagesProcessed: 0,
      skipped: true,
    };
  }

  const messageIds = messages.map((m) => m.id);
  const transcript = buildTranscript(messages);

  try {
    // Phase 1: Classify conversation mode before extraction
    const modeResult = await classifyConversationMode(transcript);
    const conversationMode = modeResult.mode;
    console.log(`[ChatExtraction] Conversation mode: ${conversationMode} (${(modeResult.confidence * 100).toFixed(0)}% - ${modeResult.reasoning})`);

    // Extract memories via LLM (now also returns state transitions)
    const { memories: extracted, stateTransitions } = await extractFromTranscript(transcript);

    // Process state transitions into scratchpad (Phase 1) + continuity threads (Phase 2)
    for (const signal of stateTransitions) {
      try {
        // Phase 1: Scratchpad continuity entries (lightweight, fast)
        await createContinuityEntry(signal.subject, signal.transition, '', signal.confidence);
        // Phase 2: Structured continuity threads (first-class, persistent)
        await findOrCreateThreadFromTransition(signal, '');
        console.log(`[ChatExtraction] Created continuity entry + thread: ${signal.subject} → ${signal.transition}`);
      } catch (continuityError) {
        console.error('[ChatExtraction] Continuity processing failed:', continuityError);
      }
    }

    const remindersCreated = 0;

    // Check for resolution of existing commitments
    let commitmentsResolved = 0;
    const resolutionsPending: ResolutionCandidate[] = [];
    try {
      const resolutionResult = await processMessagesForResolutions(
        messages.map((m) => ({ id: m.id, content: m.content }))
      );
      commitmentsResolved = resolutionResult.resolved.length;
      resolutionsPending.push(...resolutionResult.pendingConfirmation.map((p) => p.candidate));

      if (resolutionResult.resolved.length > 0) {
        console.log(`[ChatExtraction] Auto-resolved ${resolutionResult.resolved.length} commitment(s)`);
      }
      if (resolutionResult.pendingConfirmation.length > 0) {
        console.log(`[ChatExtraction] ${resolutionResult.pendingConfirmation.length} resolution(s) need confirmation`);
      }
    } catch (resolutionError) {
      console.error('[ChatExtraction] Resolution detection failed:', resolutionError);
    }

    if (extracted.length === 0) {
      // Nothing worth remembering - mark as skipped (but we may have created reminders/resolutions)
      await markMessagesSkipped(conversation.id, messageIds);
      return {
        memoriesCreated: 0,
        commitmentsCreated: 0,
        commitmentsResolved,
        resolutionsPending,
        remindersCreated,
        beliefsCreated: 0,
        beliefsReinforced: 0,
        messagesProcessed: messages.length,
        skipped: remindersCreated === 0 && commitmentsResolved === 0,
      };
    }

    let memoriesCreated = 0;
    let commitmentsCreated = 0;
    let beliefsCreated = 0;
    let beliefsReinforced = 0;

    // Create memories from extracted content
    for (const mem of extracted) {
      try {
        // Create the memory with conversation mode and any matched state transitions
        const matchedTransitions = stateTransitions.filter(
          (st) => mem.content.toLowerCase().includes(st.subject.toLowerCase())
        );
        const { memory } = await createMemory({
          content: mem.content,
          source: 'chat',
          source_metadata: {
            conversation_id: conversation.id,
            extraction_type: mem.type,
            salience_hint: mem.salience_hint,
            conversation_mode: conversationMode,
            ...(matchedTransitions.length > 0 ? { state_transitions: matchedTransitions } : {}),
          },
        });

        // Update conversation_mode column (Phase 1)
        await pool.query(
          `UPDATE memories SET conversation_mode = $1 WHERE id = $2`,
          [conversationMode, memory.id]
        );

        // Phase 3: Set tier and confidence
        // High confidence (≥0.75) → solid tier immediately
        // Lower confidence → hypothesis tier (needs reinforcement to promote)
        const confidence = mem.confidence ?? 0.5;
        const tier = confidence >= 0.75 ? 'solid' : 'hypothesis';
        await pool.query(
          `UPDATE memories SET tier = $1, confidence = $2 WHERE id = $3`,
          [tier, confidence, memory.id]
        );
        if (tier === 'solid') {
          console.log(`[ChatExtraction] Memory created as SOLID (confidence: ${confidence.toFixed(2)}): "${mem.content.substring(0, 50)}..."`);
        }

        // Phase 3: Check for reinforcement from similar existing memories
        // If similar memories exist, boost confidence and potentially promote to solid
        if (tier === 'hypothesis') {
          try {
            const reinforcement = await checkReinforcement(memory.id, mem.content, confidence);
            if (reinforcement.wasPromoted) {
              console.log(`[ChatExtraction] Memory promoted via reinforcement: hypothesis → solid`);
            } else if (reinforcement.reinforcedBy.length > 0) {
              console.log(`[ChatExtraction] Memory reinforced by ${reinforcement.reinforcedBy.length} similar memories (confidence: ${confidence.toFixed(2)} → ${reinforcement.newConfidence.toFixed(2)})`);
            }
          } catch (reinforceError) {
            console.error('[ChatExtraction] Reinforcement check failed:', reinforceError);
          }
        }

        memoriesCreated++;

        // Invalidate relevant story cache entries (Phase 4)
        // Smart invalidation based on memory content
        try {
          invalidateStoryCache(mem.content);
        } catch {
          // Silent - cache invalidation is non-critical
        }

        // Classify memory for living summaries
        let classifications: CategoryClassification[] = [];
        try {
          classifications = await classifyMemoryCategories(mem.content);
          if (classifications.length > 0) {
            await linkMemoryToCategories(memory.id, classifications);
          }
        } catch (classifyError) {
          // Log but don't fail - summary classification is secondary
          console.error('[ChatExtraction] Summary classification failed:', classifyError);
        }

        // Apply salience calibration for biographical content (Phase 0)
        // This ensures origin stories, life-changing moments, and key facts
        // are never filtered out by min_salience thresholds
        try {
          const calibratedSalience = calibrateSalienceForBiographical(mem, classifications);
          if (calibratedSalience > memory.salience_score) {
            await pool.query(
              `UPDATE memories SET salience_score = $1 WHERE id = $2`,
              [calibratedSalience, memory.id]
            );
            console.log(`[ChatExtraction] Boosted salience for biographical content: ${mem.salience_hint} → ${calibratedSalience}`);
          }
        } catch (calibrationError) {
          console.error('[ChatExtraction] Salience calibration failed:', calibrationError);
        }

        // Extract event_date for event-type memories (Phase 2)
        // Enables date-based graph traversal for Story Engine
        if (mem.type === 'event') {
          try {
            const eventDate = extractEventDate(mem.content);
            if (eventDate) {
              await pool.query(
                `UPDATE memories SET event_date = $1 WHERE id = $2`,
                [eventDate, memory.id]
              );
              console.log(`[ChatExtraction] Extracted event_date: ${eventDate.toISOString().split('T')[0]}`);
            }
          } catch (dateError) {
            console.error('[ChatExtraction] Event date extraction failed:', dateError);
          }
        }

        // Process for beliefs (decisions, preferences often become beliefs)
        if (mem.type === 'decision' || mem.type === 'preference' || mem.type === 'goal') {
          try {
            const beliefResult = await processMemoryForBeliefs(memory.id, mem.content);
            beliefsCreated += beliefResult.created.length;
            beliefsReinforced += beliefResult.reinforced.filter((r) => r.wasReinforced).length;
          } catch (beliefError) {
            // Log but don't fail - beliefs are secondary
            console.error('[ChatExtraction] Belief extraction failed:', beliefError);
          }
        }

        // Phase 2: Link memory to continuity threads via state transitions
        if (matchedTransitions.length > 0) {
          for (const st of matchedTransitions) {
            try {
              await findOrCreateThreadFromTransition(st, memory.id);
            } catch (threadError) {
              console.error('[ChatExtraction] Thread linking failed:', threadError);
            }
          }
        }

      } catch (memError) {
        console.error('[ChatExtraction] Failed to create memory:', memError);
      }
    }

    // Mark messages as extracted
    await markMessagesExtracted(conversation.id, messageIds);

    return {
      memoriesCreated,
      commitmentsCreated,
      commitmentsResolved,
      resolutionsPending,
      remindersCreated,
      beliefsCreated,
      beliefsReinforced,
      messagesProcessed: messages.length,
      skipped: false,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[ChatExtraction] Error processing conversation ${conversation.id}:`, error);

    return {
      memoriesCreated: 0,
      commitmentsCreated: 0,
      commitmentsResolved: 0,
      resolutionsPending: [],
      remindersCreated: 0,
      beliefsCreated: 0,
      beliefsReinforced: 0,
      messagesProcessed: 0,
      skipped: false,
      error: errorMsg,
    };
  }
}

/**
 * Main extraction function - processes all pending conversations
 * Called during consolidation
 */
export async function extractMemoriesFromChat(): Promise<ExtractionResult> {
  const result: ExtractionResult = {
    conversationsProcessed: 0,
    messagesProcessed: 0,
    memoriesCreated: 0,
    commitmentsCreated: 0,
    commitmentsResolved: 0,
    resolutionsPending: [],
    remindersCreated: 0,
    beliefsCreated: 0,
    beliefsReinforced: 0,
    skippedEmpty: 0,
    errors: [],
  };

  const conversations = await getPendingConversations();

  if (conversations.length === 0) {
    console.log('[ChatExtraction] No pending conversations to process');
    return result;
  }

  console.log(`[ChatExtraction] Processing ${conversations.length} conversation(s)...`);

  for (const conversation of conversations) {
    const convResult = await extractFromConversation(conversation);

    result.conversationsProcessed++;
    result.messagesProcessed += convResult.messagesProcessed;
    result.memoriesCreated += convResult.memoriesCreated;
    result.commitmentsCreated += convResult.commitmentsCreated;
    result.commitmentsResolved += convResult.commitmentsResolved;
    result.resolutionsPending.push(...convResult.resolutionsPending);
    result.remindersCreated += convResult.remindersCreated;
    result.beliefsCreated += convResult.beliefsCreated;
    result.beliefsReinforced += convResult.beliefsReinforced;

    if (convResult.skipped) {
      result.skippedEmpty++;
    }

    if (convResult.error) {
      result.errors.push(`Conversation ${conversation.id}: ${convResult.error}`);
    }
  }

  console.log(
    `[ChatExtraction] Complete: ${result.memoriesCreated} memories, ` +
    `${result.commitmentsCreated} commitments created, ${result.commitmentsResolved} resolved, ` +
    `${result.remindersCreated} reminders, ${result.beliefsCreated} beliefs, ${result.skippedEmpty} skipped`
  );

  return result;
}

/**
 * Real-time extraction for a single message
 * Called immediately when user sends a message (before LLM response)
 * Returns what was created so the UI can be updated
 */
export async function processMessageRealTime(message: string): Promise<{
  commitmentCreated: { id: string; title: string } | null;
  reminderCreated: { id: string; title: string; remind_at: string } | null;
  noteCreated: { id: string; title: string | null; content: string } | null;
  listCreated: { id: string; name: string } | null;
  listItemCreated: { id: string; list_id: string; list_name: string; content: string } | null;
  identityExtracted: { name: string; memoryId: string } | null;
}> {
  const result = {
    commitmentCreated: null as { id: string; title: string } | null,
    reminderCreated: null as { id: string; title: string; remind_at: string } | null,
    noteCreated: null as { id: string; title: string | null; content: string } | null,
    listCreated: null as { id: string; name: string } | null,
    listItemCreated: null as { id: string; list_id: string; list_name: string; content: string } | null,
    identityExtracted: null as { name: string; memoryId: string } | null,
  };

  // === IDENTITY & RELATIONSHIP DETECTION (HIGHEST PRIORITY) ===
  // Detect self-introductions and key relationships immediately
  await extractIdentityRealTime(message, result);
  await extractRelationshipsRealTime(message);

  return result;
}

// === REAL-TIME IDENTITY HELPERS ===

/**
 * LLM-based identity detection prompt
 * This replaces the fragile regex approach that kept matching words like "confident" and "originally"
 */
const IDENTITY_DETECTION_PROMPT = `You are analyzing a message to detect if the user is introducing themselves by name.

Your job is to determine:
1. Is the user stating their own name (self-introduction)?
2. If so, what is the name?

IMPORTANT DISTINCTIONS:
- "I'm Brian" = YES, user is introducing themselves as "Brian"
- "I'm confident we fixed it" = NO, "confident" is an adjective, not a name
- "I'm originally from Indiana" = NO, "originally" is an adverb, not a name
- "My name is Sarah" = YES, user is introducing themselves as "Sarah"
- "I'm so tired" = NO, "tired" is describing a state, not a name
- "I'm a developer" = NO, describing profession, not introducing name
- "Hello, I'm Brian from accounting" = YES, user is introducing themselves as "Brian"
- "I'm 56 years old" = NO, stating age, not name
- "Actually, I'm Robert" = YES, user is correcting/stating their name as "Robert"
- "I'm excited to help" = NO, expressing emotion, not introducing name
- "I'm working on it" = NO, describing activity, not introducing name

A name is a proper noun used to identify a person. It should:
- Be capitalized (when written properly)
- Be a plausible human first name
- Be used in a context where the user is identifying WHO they are, not WHAT they are doing/feeling

Return JSON:
{
  "is_self_introduction": boolean,
  "name": string | null,
  "confidence": number (0.0 to 1.0),
  "reasoning": string (brief explanation)
}

Examples:
Input: "Hey there, I'm Brian"
Output: {"is_self_introduction": true, "name": "Brian", "confidence": 0.95, "reasoning": "User greeting with name introduction"}

Input: "I'm confident this time we got it fixed"
Output: {"is_self_introduction": false, "name": null, "confidence": 0.98, "reasoning": "'confident' is an adjective describing certainty, not a name"}

Input: "I'm originally from Indiana"
Output: {"is_self_introduction": false, "name": null, "confidence": 0.99, "reasoning": "'originally' is an adverb describing origin, not a name"}

Input: "Actually my name is Robert, not Brian"
Output: {"is_self_introduction": true, "name": "Robert", "confidence": 0.95, "reasoning": "User correcting their name to Robert"}

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation outside the JSON.`;

interface IdentityDetectionResult {
  is_self_introduction: boolean;
  name: string | null;
  confidence: number;
  reasoning: string;
}

/**
 * Use LLM to detect if user is introducing themselves
 * This is the robust replacement for regex-based name detection
 */
async function detectIdentityWithLLM(message: string): Promise<IdentityDetectionResult | null> {
  // Quick pre-filter: skip messages that definitely don't contain identity patterns
  // This saves LLM calls for messages like "show me my notes" or "what's the weather"
  const mightContainIdentity = /\b(i'?m|i am|my name|call me|this is)\b/i.test(message);
  if (!mightContainIdentity) {
    return null;
  }

  try {
    const messages: LLMMessage[] = [
      { role: 'system', content: IDENTITY_DETECTION_PROMPT },
      { role: 'user', content: message },
    ];

    const result = await complete(messages, {
      temperature: 0.1, // Low temperature for consistent detection
      maxTokens: 200,
    });

    const parsed = safeParseJSON<IdentityDetectionResult>(result.content);
    if (!parsed) {
      console.error('[IdentityDetection] Failed to parse LLM response:', result.content.substring(0, 200));
      return null;
    }

    console.log(`[IdentityDetection] LLM result: is_intro=${parsed.is_self_introduction}, name=${parsed.name}, confidence=${parsed.confidence}, reason="${parsed.reasoning}"`);
    return parsed;
  } catch (error) {
    console.error('[IdentityDetection] LLM detection failed:', error);
    return null;
  }
}

/**
 * Extract user's name from self-introductions with LLM validation
 * Uses LLM to understand intent - no more regex false positives
 *
 * IMPORTANT: If identity is already locked, this function does NOTHING.
 * Identity can only be changed via explicit /rename command.
 */
async function extractIdentityRealTime(
  message: string,
  result: { identityExtracted: { name: string; memoryId: string } | null }
): Promise<void> {
  // CRITICAL: Check if identity is already locked
  // If locked, skip ALL identity detection - name is immutable
  const existingIdentity = await getUserIdentity();
  if (existingIdentity?.is_locked) {
    // Identity is locked - do not attempt to detect or change name
    // This is the core protection against accidental name changes
    return;
  }

  // Use LLM to detect identity - this is the robust approach
  const detection = await detectIdentityWithLLM(message);

  // No identity detected or LLM call failed
  if (!detection || !detection.is_self_introduction || !detection.name) {
    return;
  }

  // Require high confidence to prevent false positives
  if (detection.confidence < 0.8) {
    console.log(`[RealTimeExtraction] Low confidence (${detection.confidence}) for name "${detection.name}", skipping`);
    return;
  }

  const newName = detection.name;

  try {
    // If we already have an identity (but it wasn't locked), don't override
    // This is a safety check - normally identity should be locked
    if (existingIdentity) {
      console.log(`[RealTimeExtraction] Identity exists but unlocked: "${existingIdentity.name}" - not overriding`);
      return;
    }

    // First-time identity detection - set and lock it
    console.log(`[RealTimeExtraction] First-time identity detected: "${newName}" (confidence: ${detection.confidence})`);

    // Create the locked identity record
    await setInitialIdentity(newName, 'auto_detection');

    // Create identity memory
    const memoryContent = `The user's name is ${newName}`;
    const { memory } = await createMemory({
      content: memoryContent,
      source: 'chat',
      content_type: 'identity',
      source_metadata: {
        extraction_type: 'identity',
        real_time: true,
        salience_hint: 10,
        llm_validated: true,
        llm_confidence: detection.confidence,
        llm_reasoning: detection.reasoning,
        identity_locked: true,
      },
    });

    // Force high salience
    await pool.query(
      `UPDATE memories SET salience_score = 10.0 WHERE id = $1`,
      [memory.id]
    );

    // Link to personality category
    await linkMemoryToCategories(memory.id, [{
      category: 'personality',
      relevance: 1.0,
      reason: 'User self-introduction - core identity (locked)',
    }]);

    // Update personality summary with the name
    const personalitySummary = await getSummary('personality');
    if (personalitySummary) {
      const summaryContent = personalitySummary.content || '';
      if (!summaryContent.toLowerCase().includes(newName.toLowerCase())) {
        const updatedContent = `Your name is ${newName}. ${summaryContent}`;
        await updateSummary('personality', updatedContent.trim(), 'real-time-extraction', 0);
      }
    }

    result.identityExtracted = { name: newName, memoryId: memory.id };
    console.log(`[RealTimeExtraction] Identity locked: "${newName}" - will never auto-change again`);
  } catch (error) {
    console.error('[RealTimeExtraction] Identity extraction error:', error);
  }
}

/**
 * Extract key relationships in real-time (spouse, children, job, age)
 * These are high-value identity facts that shouldn't wait for consolidation
 */
async function extractRelationshipsRealTime(message: string): Promise<void> {
  const relationshipPatterns: Array<{
    pattern: RegExp;
    template: (match: RegExpMatchArray) => string;
    categories: Array<{ category: 'personality' | 'relationships'; relevance: number }>;
  }> = [
    // Spouse patterns
    {
      pattern: /my (?:wife|spouse|partner)(?:'s name)? is (\w+)/i,
      template: (m) => `The user's wife/partner is named ${m[1]}`,
      categories: [
        { category: 'personality', relevance: 0.9 },
        { category: 'relationships', relevance: 1.0 },
      ],
    },
    {
      pattern: /my (?:husband|spouse|partner)(?:'s name)? is (\w+)/i,
      template: (m) => `The user's husband/partner is named ${m[1]}`,
      categories: [
        { category: 'personality', relevance: 0.9 },
        { category: 'relationships', relevance: 1.0 },
      ],
    },
    {
      pattern: /(?:i'm|i am) married to (\w+)/i,
      template: (m) => `The user is married to ${m[1]}`,
      categories: [
        { category: 'personality', relevance: 0.9 },
        { category: 'relationships', relevance: 1.0 },
      ],
    },
    // Children patterns
    {
      pattern: /my (?:son|daughter|child)(?:'s name)? is (\w+)/i,
      template: (m) => `The user has a child named ${m[1]}`,
      categories: [
        { category: 'personality', relevance: 0.8 },
        { category: 'relationships', relevance: 1.0 },
      ],
    },
    {
      pattern: /i have (?:a )?(\d+) (?:kids?|children)/i,
      template: (m) => `The user has ${m[1]} children`,
      categories: [
        { category: 'personality', relevance: 0.9 },
        { category: 'relationships', relevance: 0.8 },
      ],
    },
    // Job patterns
    {
      pattern: /i (?:work|am employed) (?:at|for) (.+?)(?:\.|,|$)/i,
      template: (m) => `The user works at ${(m[1] || '').trim()}`,
      categories: [{ category: 'personality', relevance: 1.0 }],
    },
    {
      pattern: /(?:i'm|i am) (?:a|an) (.+?) (?:at|for|by profession)/i,
      template: (m) => `The user is a ${(m[1] || '').trim()}`,
      categories: [{ category: 'personality', relevance: 1.0 }],
    },
    // Age patterns
    {
      pattern: /(?:i'm|i am) (\d+) (?:years? old)?/i,
      template: (m) => `The user is ${m[1] || ''} years old`,
      categories: [{ category: 'personality', relevance: 1.0 }],
    },
    // Location patterns
    {
      pattern: /i live in (.+?)(?:\.|,|$)/i,
      template: (m) => `The user lives in ${(m[1] || '').trim()}`,
      categories: [{ category: 'personality', relevance: 0.9 }],
    },
  ];

  for (const { pattern, template, categories } of relationshipPatterns) {
    const match = message.match(pattern);
    if (match) {
      const content = template(match);

      try {
        // Check if we already have this info stored
        const existing = await pool.query(
          `SELECT id FROM memories
           WHERE content ILIKE $1
           AND created_at > NOW() - INTERVAL '30 days'
           LIMIT 1`,
          [`%${content.substring(0, 30)}%`]
        );

        if (existing.rows.length > 0) {
          console.log(`[RealTimeExtraction] Relationship already known: "${content.substring(0, 40)}..."`);
          continue;
        }

        // Create memory
        const { memory } = await createMemory({
          content,
          source: 'chat',
          content_type: 'identity',
          source_metadata: {
            extraction_type: 'relationship',
            real_time: true,
            salience_hint: 8,
          },
        });

        // Set high salience
        await pool.query(
          `UPDATE memories SET salience_score = 8.0 WHERE id = $1`,
          [memory.id]
        );

        // Link to categories
        await linkMemoryToCategories(
          memory.id,
          categories.map((c) => ({ ...c, reason: 'Real-time relationship extraction' }))
        );

        console.log(`[RealTimeExtraction] Extracted relationship: "${content}"`);
      } catch (error) {
        console.error('[RealTimeExtraction] Relationship extraction error:', error);
      }
    }
  }
}

