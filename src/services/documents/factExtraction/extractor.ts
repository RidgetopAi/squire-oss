/**
 * Fact Extraction Service
 *
 * Phase 6: Document Intelligence - LLM-based extraction of facts, entities,
 * dates, and relationships from document chunks.
 *
 * This service uses structured LLM prompts to extract:
 * - Factual statements worth remembering
 * - Named entities (people, places, organizations, projects)
 * - Dates and their significance
 * - Relationships between entities
 */

import { v4 as uuidv4 } from 'uuid';
import { complete, type LLMMessage } from '../../../providers/llm.js';
import { config } from '../../../config/index.js';
import type { DocumentChunk } from '../chunker/types.js';
import {
  type ExtractedFact,
  type ExtractedFactEntity,
  type ExtractedFactDate,
  type ExtractedRelationship,
  type FactType,
  type FactExtractionOptions,
  type ChunkExtractionResult,
  DEFAULT_EXTRACTION_OPTIONS,
  FACT_TYPES,
  ENTITY_TYPES,
  DATE_TYPES,
} from './types.js';

// === PROMPT VERSION ===
const EXTRACTION_PROMPT_VERSION = '1.0.0';

// === EXTRACTION PROMPT ===

/**
 * System prompt for fact extraction
 * Designed for structured JSON output with comprehensive extraction
 */
const FACT_EXTRACTION_SYSTEM_PROMPT = `You are an expert information extraction system. Your job is to analyze text from documents and extract structured facts, entities, dates, and relationships.

TASK: Extract meaningful facts from the provided text that would be valuable to remember long-term.

EXTRACTION CATEGORIES:

1. FACT TYPES:
   - biographical: Personal information about people (name, age, occupation, family)
   - event: Something that happened (meeting, trip, accomplishment, milestone)
   - relationship: Connections between entities (works at, married to, friends with)
   - preference: Likes, dislikes, choices, opinions
   - statement: General factual assertions from the document
   - date: Significant dates mentioned (anniversaries, deadlines, birthdays)
   - location: Geographic or place information
   - organization: Company, institution, or group information

2. ENTITY TYPES:
   - person: Individual people (full names preferred)
   - organization: Companies, institutions, government bodies
   - project: Named projects, initiatives, products
   - place: Locations, addresses, geographic areas
   - concept: Abstract ideas, theories, named frameworks

3. DATE TYPES:
   - event_date: When something happened
   - deadline: Due dates, target dates
   - anniversary: Recurring significant dates
   - birth_date: Birthdays
   - death_date: Memorial dates
   - start_date: Beginning of periods
   - end_date: End of periods
   - reference: General date mentions

4. RELATIONSHIP PREDICATES (examples):
   - works_at, employed_by
   - married_to, spouse_of
   - parent_of, child_of
   - manages, reports_to
   - founded, created
   - located_in, based_in
   - member_of, part_of

OUTPUT FORMAT:
Return a JSON object with this exact structure:

{
  "facts": [
    {
      "type": "biographical|event|relationship|preference|statement|date|location|organization",
      "content": "Clear, standalone fact statement that makes sense without context",
      "raw_text": "Exact quote from source text",
      "confidence": 0.0-1.0,
      "entities": [
        {"name": "Entity Name", "type": "person|organization|project|place|concept", "role": "subject|object|mentioned", "confidence": 0.0-1.0}
      ],
      "dates": [
        {"date": "YYYY-MM-DD", "type": "event_date|deadline|etc", "confidence": 0.0-1.0, "raw_text": "as written", "is_recurring": false}
      ],
      "relationships": [
        {"subject": "Entity A", "predicate": "relationship_type", "object": "Entity B", "confidence": 0.0-1.0, "description": "Human readable"}
      ]
    }
  ]
}

EXTRACTION GUIDELINES:

1. QUALITY over QUANTITY:
   - Only extract facts worth remembering
   - Skip trivial or obvious information
   - Each fact should be independently meaningful

2. CONFIDENCE SCORING:
   - 0.9-1.0: Explicitly stated, unambiguous
   - 0.7-0.9: Strongly implied, high certainty
   - 0.5-0.7: Reasonable inference, moderate certainty
   - Below 0.5: Don't extract

3. FACT CONTENT:
   - Write clear, standalone statements
   - Include enough context to understand without the source
   - Use "The user" for first-person references if the document is personal
   - Normalize names to full/proper form when possible

4. ENTITY EXTRACTION:
   - Prefer full names over nicknames
   - Include role in context (subject, object, mentioned)
   - Don't create entities for generic terms (pronouns, "the company")

5. DATE NORMALIZATION:
   - Convert all dates to YYYY-MM-DD format
   - For partial dates, use best estimate (month only → first of month)
   - Note recurring dates (birthdays, anniversaries)

6. RELATIONSHIP EXTRACTION:
   - Only extract explicit or strongly implied relationships
   - Use consistent predicate naming (snake_case)
   - Include human-readable description

IMPORTANT:
- Return ONLY valid JSON, no markdown, no explanation
- If no facts worth extracting, return: {"facts": []}
- Maximum 10 facts per chunk to maintain quality`;

// === LLM RESPONSE TYPE ===

interface LLMExtractionResponse {
  facts: Array<{
    type: string;
    content: string;
    raw_text: string;
    confidence: number;
    entities?: Array<{
      name: string;
      type: string;
      role?: string;
      confidence: number;
    }>;
    dates?: Array<{
      date: string;
      type: string;
      confidence: number;
      raw_text: string;
      is_recurring?: boolean;
    }>;
    relationships?: Array<{
      subject: string;
      predicate: string;
      object: string;
      confidence: number;
      description?: string;
    }>;
  }>;
}

// === HELPER FUNCTIONS ===

/**
 * Safely parse JSON from LLM response
 */
function parseExtractionResponse(content: string): LLMExtractionResponse | null {
  let jsonStr = content.trim();

  // Remove markdown code blocks if present
  jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  // Try to extract JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    return JSON.parse(jsonStr) as LLMExtractionResponse;
  } catch {
    // Try fixing common issues
    try {
      const fixed = jsonStr.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(fixed) as LLMExtractionResponse;
    } catch {
      return null;
    }
  }
}

/**
 * Validate and normalize a fact type
 */
function normalizeFactType(type: string): FactType | null {
  const normalized = type.toLowerCase().trim();
  if (FACT_TYPES.includes(normalized as FactType)) {
    return normalized as FactType;
  }
  return null;
}

/**
 * Validate and normalize an entity type
 */
function normalizeEntityType(type: string): ExtractedFactEntity['type'] | null {
  const normalized = type.toLowerCase().trim();
  if (ENTITY_TYPES.includes(normalized as ExtractedFactEntity['type'])) {
    return normalized as ExtractedFactEntity['type'];
  }
  return null;
}

/**
 * Validate and normalize a date type
 */
function normalizeDateType(type: string): ExtractedFactDate['type'] | null {
  const normalized = type.toLowerCase().trim();
  if (DATE_TYPES.includes(normalized as ExtractedFactDate['type'])) {
    return normalized as ExtractedFactDate['type'];
  }
  return 'reference'; // Default fallback
}

/**
 * Validate ISO date format
 */
function isValidISODate(dateStr: string): boolean {
  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoPattern.test(dateStr)) return false;

  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Process raw LLM response into validated ExtractedFact objects
 */
function processExtractionResponse(
  response: LLMExtractionResponse,
  chunkId: string,
  objectId: string,
  chunk: DocumentChunk,
  options: Required<FactExtractionOptions>
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];

  for (const rawFact of response.facts) {
    // Validate fact type
    const factType = normalizeFactType(rawFact.type);
    if (!factType) {
      console.warn(`[FactExtraction] Skipping invalid fact type: ${rawFact.type}`);
      continue;
    }

    // Check if fact type is allowed
    if (!options.factTypes.includes(factType)) {
      continue;
    }

    // Validate confidence
    const confidence = Number(rawFact.confidence);
    if (isNaN(confidence) || confidence < options.minConfidence) {
      continue;
    }

    // Validate content
    if (!rawFact.content || rawFact.content.length < 10) {
      continue;
    }

    // Process entities
    const entities: ExtractedFactEntity[] = [];
    if (options.extractEntities && rawFact.entities) {
      for (const entity of rawFact.entities) {
        const entityType = normalizeEntityType(entity.type);
        if (!entityType || !entity.name) continue;

        entities.push({
          name: entity.name.trim(),
          type: entityType,
          role: entity.role,
          confidence: Math.min(1, Math.max(0, entity.confidence)),
        });
      }
    }

    // Process dates
    const dates: ExtractedFactDate[] = [];
    if (options.extractDates && rawFact.dates) {
      for (const date of rawFact.dates) {
        if (!date.date || !isValidISODate(date.date)) {
          // Try to parse and normalize
          const parsedDate = new Date(date.date);
          if (!isNaN(parsedDate.getTime())) {
            date.date = parsedDate.toISOString().split('T')[0] || '';
          } else {
            continue;
          }
        }

        const dateType = normalizeDateType(date.type);
        dates.push({
          date: date.date,
          type: dateType || 'reference',
          confidence: Math.min(1, Math.max(0, date.confidence)),
          rawText: date.raw_text || date.date,
          isRecurring: date.is_recurring,
        });
      }
    }

    // Process relationships
    const relationships: ExtractedRelationship[] = [];
    if (options.extractRelationships && rawFact.relationships) {
      for (const rel of rawFact.relationships) {
        if (!rel.subject || !rel.object || !rel.predicate) continue;

        relationships.push({
          subject: rel.subject.trim(),
          predicate: rel.predicate.toLowerCase().replace(/\s+/g, '_'),
          object: rel.object.trim(),
          confidence: Math.min(1, Math.max(0, rel.confidence)),
          description: rel.description,
        });
      }
    }

    // Determine status based on confidence
    const status = confidence >= options.autoApproveThreshold ? 'auto_approved' : 'pending';

    // Create the fact object
    const fact: ExtractedFact = {
      id: uuidv4(),
      chunkId,
      objectId,
      factType,
      content: rawFact.content.trim(),
      rawText: rawFact.raw_text?.trim() || rawFact.content.trim(),
      confidence: Math.min(1, Math.max(0, confidence)),
      status,
      entities,
      dates,
      relationships,
      sourcePage: chunk.pageNumber,
      sourceSection: chunk.sectionTitle,
      extractionModel: config.llm.model,
      extractionPromptVersion: EXTRACTION_PROMPT_VERSION,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    facts.push(fact);

    // Respect max facts per chunk
    if (facts.length >= options.maxFactsPerChunk) {
      break;
    }
  }

  return facts;
}

// === MAIN EXTRACTION FUNCTION ===

/**
 * Extract facts from a single document chunk using LLM
 */
export async function extractFactsFromChunk(
  chunk: DocumentChunk,
  objectId: string,
  options: Partial<FactExtractionOptions> = {}
): Promise<ChunkExtractionResult> {
  const startTime = Date.now();
  const mergedOptions: Required<FactExtractionOptions> = {
    ...DEFAULT_EXTRACTION_OPTIONS,
    ...options,
  };

  // Validate chunk
  if (!chunk.content || chunk.content.trim().length < 20) {
    return {
      success: true,
      chunkId: chunk.id,
      facts: [],
      totalEntities: 0,
      totalDates: 0,
      totalRelationships: 0,
      processingDurationMs: Date.now() - startTime,
    };
  }

  try {
    // Build user prompt with chunk content
    const userPrompt = `Extract facts from this document text:

---
${chunk.content}
---

${chunk.sectionTitle ? `Section: ${chunk.sectionTitle}` : ''}
${chunk.pageNumber ? `Page: ${chunk.pageNumber}` : ''}

Extract all meaningful facts, entities, dates, and relationships from this text.`;

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: mergedOptions.customPrompt || FACT_EXTRACTION_SYSTEM_PROMPT,
      },
      { role: 'user', content: userPrompt },
    ];

    // Call LLM
    const result = await complete(messages, {
      temperature: 0.2, // Low temperature for consistent extraction
      maxTokens: 3000,
    });

    // Parse response
    const response = parseExtractionResponse(result.content);
    if (!response) {
      console.error('[FactExtraction] Failed to parse LLM response:', result.content.substring(0, 300));
      return {
        success: false,
        chunkId: chunk.id,
        facts: [],
        totalEntities: 0,
        totalDates: 0,
        totalRelationships: 0,
        processingDurationMs: Date.now() - startTime,
        error: 'Failed to parse LLM response',
      };
    }

    // Process and validate facts
    const facts = processExtractionResponse(
      response,
      chunk.id,
      objectId,
      chunk,
      mergedOptions
    );

    // Calculate totals
    let totalEntities = 0;
    let totalDates = 0;
    let totalRelationships = 0;

    for (const fact of facts) {
      totalEntities += fact.entities.length;
      totalDates += fact.dates.length;
      totalRelationships += fact.relationships.length;
    }

    console.log(
      `[FactExtraction] Extracted ${facts.length} facts (${totalEntities} entities, ${totalDates} dates, ${totalRelationships} relationships) from chunk ${chunk.id}`
    );

    return {
      success: true,
      chunkId: chunk.id,
      facts,
      totalEntities,
      totalDates,
      totalRelationships,
      processingDurationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[FactExtraction] Error processing chunk ${chunk.id}:`, error);

    return {
      success: false,
      chunkId: chunk.id,
      facts: [],
      totalEntities: 0,
      totalDates: 0,
      totalRelationships: 0,
      processingDurationMs: Date.now() - startTime,
      error: errorMsg,
    };
  }
}
