/**
 * Entity Extraction and Management Service
 *
 * Slice 4: Extract named entities from memories (people, projects, concepts, places)
 * Start with regex patterns, optionally enhance with LLM.
 */

import { pool } from '../../db/pool.js';
import { generateEmbedding } from '../../providers/embeddings.js';
import { complete, type LLMMessage } from '../../providers/llm.js';

// =============================================================================
// TYPES
// =============================================================================

export type EntityType = 'person' | 'project' | 'concept' | 'place' | 'organization';

export interface Entity {
  id: string;
  name: string;
  canonical_name: string;
  entity_type: EntityType;
  aliases: string[];
  description: string | null;
  attributes: Record<string, unknown>;
  first_seen_at: Date;
  last_seen_at: Date;
  mention_count: number;
  extraction_method: string;
  confidence: number;
  is_merged: boolean;
  merged_into_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EntityMention {
  id: string;
  memory_id: string;
  entity_id: string;
  mention_text: string;
  context_snippet: string | null;
  position_start: number;
  position_end: number;
  relationship_type: string | null;
  extraction_method: string;
  confidence: number;
  created_at: Date;
}

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  mentionText: string;
  positionStart: number;
  positionEnd: number;
  confidence: number;
  context?: string;
}

// === LLM EXTRACTION TYPES ===

export interface LLMExtractedEntity {
  name: string;
  type: EntityType;
  relationship?: string; // e.g., "wife", "boss", "colleague"
  confidence: number;
  mentionText: string;
  reasoning?: string;
}

export interface ExtractedEntityWithRelationship extends ExtractedEntity {
  relationship_type?: string;
  relationship_direction?: 'subject' | 'object';
  extraction_method: 'regex' | 'llm';
}

export interface ExtractionOptions {
  /** Force LLM extraction even if regex finds entities */
  forceLLM?: boolean;
  /** Skip LLM extraction entirely (regex only) */
  regexOnly?: boolean;
  /** Minimum regex confidence to skip LLM */
  minRegexConfidence?: number;
}

// =============================================================================
// EXTRACTION PATTERNS
// =============================================================================

/**
 * Regex patterns for entity extraction
 * Designed to be precise over recall - prefer fewer false positives
 */
const PATTERNS = {
  // People: Capitalized name patterns
  // Process in order - longer patterns first to prefer full names
  person: [
    // Two-word names (most common): "Sarah Chen", "John O'Brien"
    /\b([A-Z][a-z]+\s+[A-Z][a-z'-]+)\b/g,
    // Three-word names: "Mary Jane Watson"
    /\b([A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z'-]+)\b/g,
    // Titles with names
    /\b((?:Dr|Mr|Mrs|Ms|Prof|Sir|Dame)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)*)\b/g,
  ],

  // Projects: Explicit project references
  // "the Quantum project", "Project Alpha", "working on Nebula"
  // NOTE: Use /g not /gi - the /i flag makes [A-Z] match lowercase, causing false positives like "two"
  project: [
    // "the X project" or "X project" (but not "project deadline" etc)
    /\b(?:the\s+)?([A-Z][a-zA-Z0-9]+)\s+project(?:\s|$|[,.])/g,
    // "Project X"
    /\bProject\s+([A-Z][a-zA-Z0-9]+)\b/g,
    // "working on X"
    /\bworking on\s+(?:the\s+)?([A-Z][a-zA-Z0-9]+)\b/g,
  ],

  // Organizations: Company patterns
  // "at Google", "Apple Inc", "the ACME Corporation"
  // NOTE: Use /g not /gi to require proper capitalization
  organization: [
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:Inc|Corp|LLC|Ltd|Co|Company|Corporation|Industries|Group|Foundation)\b/g,
  ],

  // Places: Location patterns
  // "in New York", "from San Francisco" - removed "to" (too ambiguous: "married to Sarah")
  // LLM will catch places that regex misses
  place: [
    /\b(?:in|from|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
  ],

  // Concepts: Very conservative - only explicit markers
  concept: [
    /\b(?:the concept of|the idea of)\s+"?([A-Z][a-zA-Z\s]+)"?\b/gi,
  ],
};

// Words to exclude from entity extraction (include lowercase since regex uses /gi flag)
const STOP_WORDS = new Set([
  // Common sentence starters (both cases for /gi regex patterns)
  'The', 'the', 'This', 'this', 'That', 'that', 'These', 'these', 'Those', 'those',
  'Here', 'here', 'There', 'there', 'Where', 'where', 'When', 'when',
  'What', 'what', 'Why', 'why', 'How', 'how',
  // Pronouns (both cases)
  'I', 'We', 'we', 'You', 'you', 'They', 'they', 'He', 'he', 'She', 'she', 'It', 'it',
  // Possessive pronouns - common false positives with "X project" pattern
  'My', 'my', 'Your', 'your', 'Our', 'our', 'Their', 'their', 'His', 'his', 'Her', 'her', 'Its', 'its',
  // Articles (critical for avoiding "an project" matches)
  'A', 'a', 'An', 'an',
  // Time words
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
  'Today', 'today', 'Tomorrow', 'tomorrow', 'Yesterday', 'yesterday',
  // Holidays
  "New Year's", 'New Years', 'New Year', 'Christmas', 'Thanksgiving', 'Easter',
  'Halloween', 'Valentine', "Valentine's", 'Memorial Day', 'Labor Day',
  // Common words that get capitalized (both cases)
  'Also', 'also', 'Just', 'just', 'Really', 'really', 'Very', 'very',
  'Now', 'now', 'Then', 'then', 'So', 'so', 'But', 'but', 'And', 'and', 'Or', 'or',
  // Ordinals and sequence words (both cases)
  'First', 'first', 'Second', 'second', 'Third', 'third', 'Fourth', 'fourth', 'Fifth', 'fifth',
  'Next', 'next', 'Last', 'last', 'New', 'new', 'Old', 'old',
  // Common adjectives that create false positives like "major project"
  'Major', 'major', 'Minor', 'minor', 'Big', 'big', 'Small', 'small',
  'Main', 'main', 'Other', 'other', 'Same', 'same', 'Final', 'final',
  'Current', 'current', 'Recent', 'recent', 'Latest', 'latest',
  // Common verbs/words that match patterns
  'Need', 'need', 'Met', 'met', 'Got', 'got', 'Had', 'had', 'Has', 'has',
  'Was', 'was', 'Were', 'were', 'Been', 'been', 'Being', 'being',
  'Some', 'some', 'Any', 'any', 'All', 'all', 'Most', 'most', 'Many', 'many', 'Few', 'few',
  // Titles/roles without names
  'CTO', 'CEO', 'CFO', 'COO', 'VP',
  // Place/organization indicators (false positives from audit)
  'County', 'Oncology', 'Hospital', 'Clinic', 'Center', 'Calendar', 'Palace',
  'Chinese', 'Restaurant', 'Church', 'School', 'University', 'Medical', 'Dental',
  'Flooring', 'Command', 'Gastro',
  // Numbers that get capitalized in sentences
  'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  // Verbs that match project patterns (-ing words)
  'Connecting', 'Integrating', 'Working', 'Planning', 'Meeting', 'Starting',
  'connecting', 'integrating', 'working', 'planning', 'meeting', 'starting',
  // Common phrases that create false positives
  'Side', 'side', 'Plan', 'plan',
]);

// =============================================================================
// EXTRACTION FUNCTIONS
// =============================================================================

/**
 * Extract all entities from text using regex patterns
 */
export function extractEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>(); // Dedupe by position

  for (const [type, patterns] of Object.entries(PATTERNS)) {
    for (const pattern of patterns) {
      // Reset regex state
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1]?.trim();
        if (!name) continue;

        // Skip stop words
        if (STOP_WORDS.has(name)) continue;
        if (name.split(/\s+/).every((w) => STOP_WORDS.has(w))) continue;

        // Skip very short names (likely false positives)
        // Projects need 3+ chars to avoid "an", "my", etc. matching with /gi flag
        const minLength = type === 'project' ? 3 : 2;
        if (name.length < minLength) continue;

        // Skip if already seen at this position
        const posKey = `${match.index}-${name}`;
        if (seen.has(posKey)) continue;
        seen.add(posKey);

        // Calculate context snippet
        const contextStart = Math.max(0, match.index - 30);
        const contextEnd = Math.min(text.length, match.index + name.length + 30);
        const context = text.slice(contextStart, contextEnd);

        entities.push({
          name,
          type: type as EntityType,
          mentionText: match[0],
          positionStart: match.index,
          positionEnd: match.index + match[0].length,
          confidence: calculateExtractionConfidence(name, type as EntityType, text),
          context,
        });
      }
    }
  }

  // Sort by position and remove overlapping extractions (prefer longer matches)
  return deduplicateEntities(entities);
}

/**
 * Calculate confidence score for an extraction
 */
function calculateExtractionConfidence(
  name: string,
  type: EntityType,
  text: string
): number {
  let confidence = 0.7; // Base confidence for regex match

  // Boost for multi-word names (more likely to be real entities)
  if (name.includes(' ')) {
    confidence += 0.1;
  }

  // Boost for names that appear multiple times
  const occurrences = (text.match(new RegExp(name, 'gi')) || []).length;
  if (occurrences > 1) {
    confidence += Math.min(0.1, occurrences * 0.02);
  }

  // Type-specific adjustments
  if (type === 'person' && /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(name)) {
    confidence += 0.1; // Two-word proper names are likely people
  }

  if (type === 'project' && text.toLowerCase().includes('project')) {
    confidence += 0.05; // Explicit project mention
  }

  return Math.min(1.0, confidence);
}

/**
 * Remove overlapping extractions, preferring longer/higher confidence matches
 */
function deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  if (entities.length === 0) return entities;

  // Sort by position, then by length (longer first)
  entities.sort((a, b) => {
    if (a.positionStart !== b.positionStart) {
      return a.positionStart - b.positionStart;
    }
    return b.name.length - a.name.length;
  });

  const result: ExtractedEntity[] = [];
  let lastEnd = -1;

  for (const entity of entities) {
    // Skip if overlaps with previous (already accepted longer match)
    if (entity.positionStart < lastEnd) continue;

    result.push(entity);
    lastEnd = entity.positionEnd;
  }

  return result;
}

// =============================================================================
// ENTITY TYPE VALIDATION
// =============================================================================

/**
 * Type indicator patterns for entity validation
 * These override LLM/regex type assignments when entity name contains these suffixes
 */
const TYPE_INDICATORS: Record<EntityType, RegExp[]> = {
  // Place indicators (e.g., "Appomattox County" → place, not person)
  place: [
    /\b(County|City|State|Village|Township|Province|District|Region|Island|Mountains?|Valley|Lake|River|Park|Beach|Harbor|Airport)\b/i,
  ],
  // Organization indicators (e.g., "Gastro Oncology" → org, not person)
  organization: [
    /\b(Hospital|Clinic|Oncology|Medical|Dental|Flooring|Restaurant|Church|School|University|College|Institute|Center|Centre|Foundation|Corporation|Company|Inc|LLC|Ltd|Co|Corp|Group|Association|Society|Agency|Department|Ministry|Commission|Council|Board|Authority|Office|Bank|Credit Union)\b/i,
  ],
  // Product/concept indicators (e.g., "Google Calendar" → concept, not person)
  concept: [
    /\b(Calendar|Maps|Drive|Docs|Sheets|Slides|Gmail|Outlook|Teams|Slack|Discord|Zoom|App|Software|Platform|System|Service|API|SDK|Framework|Library|Tool|Dashboard|Portal)\b/i,
  ],
  // These types don't have indicator overrides
  person: [],
  project: [],
};

/**
 * Validate and potentially correct entity type based on name indicators
 *
 * This function corrects misclassifications like:
 * - "Appomattox County" as person → should be place
 * - "Gastro Oncology" as person → should be organization
 * - "Google Calendar" as person → should be concept
 *
 * @param name - The entity name
 * @param proposedType - The type assigned by LLM or regex extraction
 * @param _context - The surrounding context (reserved for future use)
 * @returns The validated (potentially corrected) entity type
 */
export function validateEntityType(
  name: string,
  proposedType: EntityType,
  _context: string
): EntityType {
  // Check each type's indicators
  for (const [type, patterns] of Object.entries(TYPE_INDICATORS)) {
    for (const pattern of patterns) {
      if (pattern.test(name)) {
        // Found an indicator - override the proposed type
        if (type !== proposedType) {
          console.log(
            `[EntityValidation] Corrected "${name}" from ${proposedType} to ${type}`
          );
        }
        return type as EntityType;
      }
    }
  }

  // No indicator found - keep the proposed type
  return proposedType;
}

// =============================================================================
// ENTITY DISAMBIGUATION
// =============================================================================

/**
 * LLM prompt for disambiguating same-name entities
 */
const DISAMBIGUATION_PROMPT = `You are helping identify if a new mention refers to an existing person or a different person with the same name.

Given this new mention:
Name: "{name}"
Context: "{context}"
Relationship: "{relationship}"

Is this the SAME PERSON as any of these existing entities?
{candidates}

Rules:
- If the relationship context matches (e.g., both "brother-in-law"), it's the SAME person
- If the relationship context conflicts (e.g., "brother-in-law" vs "vendor contact"), it's DIFFERENT
- If unclear, default to SAME unless strong evidence of difference

Respond with ONLY one of:
- A number (1, 2, etc.) if it matches that existing entity
- "NEW" if this is definitely a different person with the same name

Do not explain.`;

/**
 * Use LLM to disambiguate when relationship comparison is unclear
 */
async function llmDisambiguate(
  newEntity: ExtractedEntityWithRelationship,
  candidates: Entity[]
): Promise<Entity | null> {
  const candidateList = candidates
    .map((c, i) => {
      const rel = (c.attributes as Record<string, unknown>)?.initial_relationship || 'unknown';
      const desc = c.description || 'no description';
      return `${i + 1}. ${c.name} - relationship: ${rel} - ${desc}`;
    })
    .join('\n');

  const prompt = DISAMBIGUATION_PROMPT
    .replace('{name}', newEntity.name)
    .replace('{context}', newEntity.context || '')
    .replace('{relationship}', newEntity.relationship_type || 'unknown')
    .replace('{candidates}', candidateList);

  try {
    const result = await complete(
      [
        { role: 'system', content: 'You disambiguate entity mentions. Respond with only a number or "NEW".' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.1, maxTokens: 10 }
    );

    const response = result.content.trim().toUpperCase();

    if (response === 'NEW') {
      console.log(`[Disambiguation] LLM says "${newEntity.name}" is NEW entity`);
      return null;
    }

    const matchIndex = parseInt(response, 10);
    if (!isNaN(matchIndex) && matchIndex >= 1 && matchIndex <= candidates.length) {
      const matched = candidates[matchIndex - 1];
      if (matched) {
        console.log(`[Disambiguation] LLM matched "${newEntity.name}" to candidate ${matchIndex}`);
        return matched;
      }
    }

    // Unclear response - default to first candidate (most mentioned)
    const first = candidates[0];
    if (first) {
      console.log(`[Disambiguation] LLM unclear ("${response}"), defaulting to first candidate`);
      return first;
    }
    return null;
  } catch (error) {
    console.error('[Disambiguation] LLM failed, defaulting to first candidate:', error);
    return candidates[0] ?? null;
  }
}

/**
 * Disambiguate a new entity mention against existing candidates
 *
 * Handles the "two Alexes" problem:
 * - Alex (brother-in-law) vs Alex (vendor) should be separate
 * - Multiple mentions of Alex (brother-in-law) should link to same entity
 *
 * @param newEntity - The newly extracted entity
 * @param candidates - Existing entities with same name and type
 * @returns Matched entity if same person, null if new person
 */
async function disambiguateEntity(
  newEntity: ExtractedEntityWithRelationship,
  candidates: Entity[]
): Promise<Entity | null> {
  if (candidates.length === 0) {
    return null; // No candidates = definitely new
  }

  const newRel = newEntity.relationship_type?.toLowerCase();

  // Single candidate - check relationship match
  if (candidates.length === 1) {
    const candidate = candidates[0]!; // We know length is 1
    const candidateRel = ((candidate.attributes as Record<string, unknown>)?.initial_relationship as string)?.toLowerCase();

    // Both have relationships - compare them
    if (candidateRel && newRel) {
      if (candidateRel === newRel) {
        console.log(`[Disambiguation] Relationship match: "${newRel}" - same entity`);
        return candidate;
      }
      // Different relationships = different people
      console.log(`[Disambiguation] Relationship mismatch: "${candidateRel}" vs "${newRel}" - NEW entity`);
      return null;
    }

    // Only one has relationship - check context similarity
    if (newEntity.context && candidate.description) {
      // If contexts seem very different, might be different person
      // For now, default to same person (conservative)
    }

    // Default: assume same person if no conflicting info
    return candidate;
  }

  // Multiple candidates - use LLM to pick best match or create new
  return llmDisambiguate(newEntity, candidates);
}

// =============================================================================
// LLM ENTITY EXTRACTION
// =============================================================================

/**
 * System prompt for LLM entity extraction
 * Designed to catch entities regex misses, especially single names with relationship context
 */
const ENTITY_EXTRACTION_SYSTEM_PROMPT = `You are an entity extractor analyzing personal memories and observations.

Extract NAMED ENTITIES from the text. Focus on:
- People (especially single names with relationship context like "my wife Sherrie", "my friend Tom")
- Projects/Products (named work items)
- Organizations/Companies
- Places (specific locations)

For each entity, identify:
1. The entity name (use the most specific name available)
2. Entity type: person, project, organization, place, concept
3. Any relationship mentioned (e.g., "wife", "boss", "client", "friend")
4. Confidence (0.0-1.0) based on how clear the entity identification is

IMPORTANT:
- Extract single-word names if relationship context is clear ("my sister Maria" -> Maria is a person)
- Do NOT extract generic roles without names ("my boss" without a name -> skip)
- Do NOT extract common words, days, months, or pronouns
- Prefer specific over generic (extract "Sarah" not "sister")

Return ONLY a JSON array. Format:
[{"name": "EntityName", "type": "person|project|organization|place|concept", "relationship": "wife|friend|colleague|etc", "confidence": 0.X, "mentionText": "exact text containing the entity"}]

If no entities found, return: []`;

/**
 * Extract entities using LLM
 * Called when regex extraction is insufficient
 */
export async function extractEntitiesWithLLM(
  text: string
): Promise<LLMExtractedEntity[]> {
  if (!text.trim()) {
    return [];
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: ENTITY_EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: `Extract entities from:\n\n"${text}"` },
  ];

  try {
    const result = await complete(messages, {
      temperature: 0.2, // Low temperature for consistent extraction
      maxTokens: 1000,
    });

    const content = result.content.trim();

    // Handle empty response
    if (!content || content === '[]') {
      return [];
    }

    // Extract JSON from response (handle markdown wrapping)
    let jsonStr = content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as Array<{
      name: string;
      type: string;
      relationship?: string;
      confidence: number;
      mentionText?: string;
    }>;

    // Validate and filter results
    const validTypes: EntityType[] = ['person', 'project', 'concept', 'place', 'organization'];

    return parsed
      .filter(
        (e) =>
          e.name &&
          typeof e.name === 'string' &&
          e.name.length >= 2 &&
          validTypes.includes(e.type as EntityType) &&
          e.confidence >= 0.3 &&
          !STOP_WORDS.has(e.name)
      )
      .map((e) => ({
        name: e.name.trim(),
        type: e.type as EntityType,
        relationship: e.relationship || undefined,
        confidence: Math.min(1.0, Math.max(0.3, e.confidence)),
        mentionText: e.mentionText || e.name,
      }));
  } catch (error) {
    console.error('[EntityExtraction] LLM extraction failed:', error);
    return [];
  }
}

/**
 * Check if LLM extraction should be invoked
 * Returns true if:
 * 1. Regex found nothing
 * 2. Text contains relationship indicators but no person entities were found
 * 3. Regex confidence is low
 */
function shouldInvokeLLM(
  text: string,
  regexEntities: ExtractedEntity[],
  options: ExtractionOptions = {}
): boolean {
  if (options.regexOnly) return false;
  if (options.forceLLM) return true;

  // Always invoke if regex found nothing
  if (regexEntities.length === 0) return true;

  // Check for relationship indicators that regex might miss
  const relationshipPatterns = [
    /\bmy\s+(wife|husband|partner|friend|boss|colleague|sister|brother|mom|dad|mother|father|son|daughter|uncle|aunt|cousin|grandma|grandpa|girlfriend|boyfriend)\b/i,
    /\bour\s+(client|customer|partner|vendor)\b/i,
    /\bmet\s+with\s+\w+/i,
    /\btalked\s+to\s+\w+/i,
    /\bcalled\s+\w+/i,
    /\bnamed\s+\w+/i,
  ];

  const hasRelationshipIndicator = relationshipPatterns.some((p) => p.test(text));

  // If text has relationship indicators but no person entities, invoke LLM
  if (hasRelationshipIndicator) {
    const hasPersonEntity = regexEntities.some((e) => e.type === 'person');
    if (!hasPersonEntity) return true;
  }

  // Check average confidence
  const avgConfidence =
    regexEntities.reduce((sum, e) => sum + e.confidence, 0) / regexEntities.length;
  const minConfidence = options.minRegexConfidence ?? 0.6;

  return avgConfidence < minConfidence;
}

/**
 * Merge regex and LLM extraction results
 * LLM results fill gaps, don't override regex matches
 */
function mergeExtractionResults(
  regexEntities: ExtractedEntity[],
  llmEntities: LLMExtractedEntity[],
  originalText: string
): ExtractedEntityWithRelationship[] {
  const results: ExtractedEntityWithRelationship[] = [];

  // Add regex entities first (they have precise positions)
  for (const re of regexEntities) {
    results.push({
      ...re,
      extraction_method: 'regex',
    });
  }

  // Track covered names to avoid duplicates
  const coveredNames = new Set(regexEntities.map((e) => e.name.toLowerCase()));

  // Add LLM entities that don't overlap with regex results
  for (const le of llmEntities) {
    const lowerName = le.name.toLowerCase();

    // Check if this entity is already covered by regex
    const isDuplicate =
      coveredNames.has(lowerName) ||
      Array.from(coveredNames).some(
        (name) => name.includes(lowerName) || lowerName.includes(name)
      );

    if (isDuplicate) continue;

    // Find position of the mention in text
    const lowerText = originalText.toLowerCase();
    const position = lowerText.indexOf(lowerName);

    // Calculate context snippet
    const contextStart = Math.max(0, position - 30);
    const contextEnd = Math.min(originalText.length, position + le.name.length + 30);

    results.push({
      name: le.name,
      type: le.type,
      mentionText: le.mentionText,
      positionStart: position >= 0 ? position : 0,
      positionEnd: position >= 0 ? position + le.name.length : le.name.length,
      confidence: le.confidence,
      context: position >= 0 ? originalText.slice(contextStart, contextEnd) : le.mentionText,
      relationship_type: le.relationship,
      extraction_method: 'llm',
    });

    coveredNames.add(lowerName);
  }

  // Sort by position
  return results.sort((a, b) => a.positionStart - b.positionStart);
}

// =============================================================================
// DATABASE OPERATIONS
// =============================================================================

/**
 * Normalize entity name to canonical form
 */
function canonicalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Get or create an entity, handling deduplication and disambiguation
 *
 * Key behavior (Phase 3 - disambiguation):
 * - Finds candidates with same canonical name and type
 * - Uses disambiguateEntity() to determine if truly same person
 * - Creates new entity with distinguishing info if different person
 *
 * Handles the "two Alexes" problem:
 * - "Alex (brother-in-law)" and "Alex (vendor)" stay separate
 */
export async function getOrCreateEntity(
  extracted: ExtractedEntity | ExtractedEntityWithRelationship
): Promise<Entity> {
  const canonical = canonicalize(extracted.name);
  const extractionMethod =
    'extraction_method' in extracted ? extracted.extraction_method : 'regex';

  // Step 1: Find candidates with same name and type
  const candidates = await pool.query(
    `SELECT * FROM entities
     WHERE canonical_name = $1 AND entity_type = $2
     AND is_merged = FALSE
     ORDER BY mention_count DESC`,
    [canonical, extracted.type]
  );

  // Step 2: Disambiguate if candidates exist
  if (candidates.rows.length > 0) {
    // Cast to ExtractedEntityWithRelationship for disambiguation
    const extWithRel: ExtractedEntityWithRelationship = {
      ...extracted,
      extraction_method: extractionMethod,
      relationship_type: 'relationship_type' in extracted ? extracted.relationship_type : undefined,
    };

    const match = await disambiguateEntity(extWithRel, candidates.rows as Entity[]);

    if (match) {
      // Same entity - update and return
      const updated = await pool.query(
        `UPDATE entities
         SET last_seen_at = NOW(),
             mention_count = mention_count + 1,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [match.id]
      );
      return updated.rows[0] as Entity;
    }

    // Different person with same name - fall through to create new
    console.log(`[Entity] Creating new "${extracted.name}" (disambiguated from ${candidates.rows.length} existing)`);
  }

  // Step 3: Create new entity
  const relationshipType = 'relationship_type' in extracted ? extracted.relationship_type : undefined;

  // Build attributes JSONB (for relationship metadata)
  const attributes: Record<string, unknown> = {};
  if (relationshipType) {
    attributes.initial_relationship = relationshipType;
  }

  // Build aliases array for disambiguation (T3-04)
  const aliases: string[] = [];
  if (relationshipType) {
    // Add relationship-qualified alias: "Alex (brother-in-law)"
    aliases.push(`${extracted.name} (${relationshipType})`);
  }

  // Create new entity with embedding
  let embeddingStr: string | null = null;
  try {
    const embedding = await generateEmbedding(extracted.name);
    embeddingStr = `[${embedding.join(',')}]`;
  } catch {
    // Embedding optional - continue without it
  }

  const result = await pool.query(
    `INSERT INTO entities (
      name, canonical_name, entity_type, aliases, embedding,
      extraction_method, confidence, attributes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      extracted.name,
      canonical,
      extracted.type,
      aliases,
      embeddingStr,
      extractionMethod,
      extracted.confidence,
      JSON.stringify(attributes),
    ]
  );

  return result.rows[0] as Entity;
}

/**
 * Create a mention link with relationship information
 * Used for LLM-extracted entities that include relationship context
 */
export async function createMentionWithRelationship(
  memoryId: string,
  entityId: string,
  extracted: ExtractedEntityWithRelationship
): Promise<EntityMention> {
  const extractionMethod = extracted.extraction_method || 'regex';

  // Check if mention already exists at this position
  const existing = await pool.query(
    `SELECT * FROM entity_mentions
     WHERE memory_id = $1 AND entity_id = $2 AND position_start = $3`,
    [memoryId, entityId, extracted.positionStart]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0] as EntityMention;
  }

  const result = await pool.query(
    `INSERT INTO entity_mentions (
      memory_id, entity_id, mention_text, context_snippet,
      position_start, position_end,
      relationship_type, relationship_direction,
      extraction_method, confidence
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      memoryId,
      entityId,
      extracted.mentionText,
      extracted.context,
      extracted.positionStart,
      extracted.positionEnd,
      extracted.relationship_type || null,
      extracted.relationship_direction || null,
      extractionMethod,
      extracted.confidence,
    ]
  );

  return result.rows[0] as EntityMention;
}

/**
 * Extract entities from memory content and create all necessary records
 * Uses hybrid regex + LLM approach for comprehensive extraction
 */
export async function extractAndStoreEntities(
  memoryId: string,
  content: string,
  options: ExtractionOptions = {}
): Promise<{ entities: Entity[]; mentions: EntityMention[] }> {
  // Step 1: Regex extraction (fast, free)
  const regexExtracted = extractEntities(content);

  // Step 2: Conditionally invoke LLM
  let llmExtracted: LLMExtractedEntity[] = [];
  if (shouldInvokeLLM(content, regexExtracted, options)) {
    try {
      llmExtracted = await extractEntitiesWithLLM(content);
      console.log(
        `[EntityExtraction] LLM found ${llmExtracted.length} entities: ` +
          llmExtracted.map((e) => `${e.name} (${e.type}${e.relationship ? `, ${e.relationship}` : ''})`).join(', ')
      );
    } catch (error) {
      console.error('[EntityExtraction] LLM failed, using regex only:', error);
    }
  }

  // Step 3: Merge results
  const allExtracted = mergeExtractionResults(regexExtracted, llmExtracted, content);

  const entities: Entity[] = [];
  const mentions: EntityMention[] = [];

  for (const ext of allExtracted) {
    // Step 4: Validate/correct entity type based on name indicators
    const validatedType = validateEntityType(ext.name, ext.type, ext.context || '');
    ext.type = validatedType;

    const entity = await getOrCreateEntity(ext);
    entities.push(entity);

    const mention = await createMentionWithRelationship(memoryId, entity.id, ext);
    mentions.push(mention);
  }

  return { entities, mentions };
}

// =============================================================================
// QUERY FUNCTIONS
// =============================================================================

export interface ListEntitiesOptions {
  type?: EntityType;
  limit?: number;
  offset?: number;
  search?: string;
}

/**
 * List all entities with optional filtering
 */
export async function listEntities(
  options: ListEntitiesOptions = {}
): Promise<Entity[]> {
  const { type, limit = 50, offset = 0, search } = options;

  let query = `
    SELECT * FROM entities
    WHERE is_merged = FALSE
  `;
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (type) {
    query += ` AND entity_type = $${paramIndex}`;
    params.push(type);
    paramIndex++;
  }

  if (search) {
    query += ` AND (name ILIKE $${paramIndex} OR canonical_name ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  query += ` ORDER BY mention_count DESC, last_seen_at DESC`;
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows as Entity[];
}

/**
 * Get an entity by ID
 */
export async function getEntity(id: string): Promise<Entity | null> {
  const result = await pool.query(
    `SELECT * FROM entities WHERE id = $1 AND is_merged = FALSE`,
    [id]
  );
  return (result.rows[0] as Entity) ?? null;
}

/**
 * Search for entities by name (fuzzy match)
 */
export async function searchEntities(
  query: string,
  type?: EntityType
): Promise<Entity[]> {
  const canonical = canonicalize(query);

  let sql = `
    SELECT * FROM entities
    WHERE is_merged = FALSE
      AND (
        canonical_name ILIKE $1
        OR name ILIKE $1
        OR $2 = ANY(aliases)
      )
  `;
  const params: (string | EntityType | undefined)[] = [`%${canonical}%`, query];

  if (type) {
    sql += ` AND entity_type = $3`;
    params.push(type);
  }

  sql += ` ORDER BY mention_count DESC LIMIT 20`;

  const result = await pool.query(sql, params);
  return result.rows as Entity[];
}

export interface EntityMemoryMention {
  id: string;
  content: string;
  created_at: Date;
  salience_score: number;
  mention_text: string;
  relationship_type: string | null;
}

export interface ConnectedEntity {
  id: string;
  name: string;
  entity_type: EntityType;
  mention_count: number;
  shared_memory_count: number;
}

export interface EntityWithMemories extends Entity {
  memories: EntityMemoryMention[];
  connected_entities?: ConnectedEntity[];
  primary_relationship?: string | null;
}

/**
 * Get all information about an entity including related memories
 * This is the "What do I know about X?" query
 */
export async function getEntityWithMemories(
  entityId: string
): Promise<EntityWithMemories | null> {
  // Get the entity
  const entity = await getEntity(entityId);
  if (!entity) return null;

  // Get all memories that mention this entity, including relationship_type
  const memoriesResult = await pool.query(
    `SELECT m.id, m.content, m.created_at, m.salience_score,
            em.mention_text, em.relationship_type
     FROM memories m
     JOIN entity_mentions em ON em.memory_id = m.id
     WHERE em.entity_id = $1
     ORDER BY m.created_at DESC
     LIMIT 50`,
    [entityId]
  );

  // Get connected entities (entities that appear in the same memories)
  const connectedResult = await pool.query(
    `SELECT e.id, e.name, e.entity_type, e.mention_count,
            COUNT(DISTINCT em2.memory_id) as shared_memory_count
     FROM entity_mentions em1
     JOIN entity_mentions em2 ON em1.memory_id = em2.memory_id
     JOIN entities e ON em2.entity_id = e.id
     WHERE em1.entity_id = $1
       AND em2.entity_id != $1
       AND e.is_merged = FALSE
     GROUP BY e.id, e.name, e.entity_type, e.mention_count
     ORDER BY shared_memory_count DESC, e.mention_count DESC
     LIMIT 10`,
    [entityId]
  );

  // Find primary relationship (most common relationship_type for this entity)
  const relationshipResult = await pool.query(
    `SELECT relationship_type, COUNT(*) as count
     FROM entity_mentions
     WHERE entity_id = $1 AND relationship_type IS NOT NULL
     GROUP BY relationship_type
     ORDER BY count DESC
     LIMIT 1`,
    [entityId]
  );

  const primaryRelationship = relationshipResult.rows[0]?.relationship_type || null;

  return {
    ...entity,
    memories: memoriesResult.rows,
    connected_entities: connectedResult.rows,
    primary_relationship: primaryRelationship,
  };
}

/**
 * Find entity by name query (for CLI "who" command)
 * Searches across all entities and returns best match with memories
 */
export async function findEntityByName(
  nameQuery: string
): Promise<EntityWithMemories | null> {
  const entities = await searchEntities(nameQuery);
  const first = entities[0];
  if (!first) return null;

  // Return first match (highest mention count)
  return getEntityWithMemories(first.id);
}

/**
 * Get entities mentioned in a specific memory
 */
export async function getMemoryEntities(memoryId: string): Promise<Entity[]> {
  const result = await pool.query(
    `SELECT e.* FROM entities e
     JOIN entity_mentions em ON em.entity_id = e.id
     WHERE em.memory_id = $1 AND e.is_merged = FALSE
     ORDER BY e.entity_type, e.name`,
    [memoryId]
  );
  return result.rows as Entity[];
}

/**
 * Count entities by type
 */
export async function countEntitiesByType(): Promise<Record<EntityType, number>> {
  const result = await pool.query(
    `SELECT entity_type, COUNT(*) as count
     FROM entities
     WHERE is_merged = FALSE
     GROUP BY entity_type`
  );

  const counts: Record<string, number> = {
    person: 0,
    project: 0,
    concept: 0,
    place: 0,
    organization: 0,
  };

  for (const row of result.rows) {
    counts[row.entity_type] = parseInt(row.count, 10);
  }

  return counts as Record<EntityType, number>;
}
