/**
 * Enhanced Recall - BM25-based memory retrieval engine.
 *
 * Ported from Gates relevance channel. Pure scoring functions with no
 * database or API dependencies (those are added in later phases).
 *
 * Uses BM25-inspired scoring, entity matching, category bridging,
 * and graph propagation to rank memory candidates by relevance.
 */

import { pool } from '../../db/pool.js';
import { config } from '../../config/index.js';
import { callLLM } from '../llm/call.js';
import type { LLMMessage } from '../llm/types.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface MemoryCandidate {
  id: string;
  content: string;
  created_at: Date;
  salience_score: number;
  current_strength: number;
  bm25Score: number;
  entityScore: number;
  bridgeScore: number;
  propagationScore: number;
  totalScore: number;
  rerankerRelevant?: boolean;
  embeddingCandidate?: boolean;
}

export interface RecallStats {
  candidateCount: number;
  idfTermCount: number;
  entityMatchCount: number;
  graphPropagationCount: number;
  embeddingCandidates: number;
  rerankerUsed: boolean;
  rerankerCalls: number;
  rerankerFallback: boolean;
  elapsedMs: number;
}

export interface EnhancedRecallResult {
  memories: MemoryCandidate[];
  stats: RecallStats;
}

/** Minimal memory shape consumed by the scoring functions. */
export interface MemoryDocument {
  id: string;
  content: string;
}

/** Entity shape consumed by entity-matching functions. */
export interface EntityRecord {
  id: string;
  name: string;
  canonical_name: string;
  aliases: string[];
}

// ---------------------------------------------------------------------------
// Stopwords
// ---------------------------------------------------------------------------

/**
 * Common English stopwords to exclude from matching.
 * User-specific stopwords (e.g. the user's own name) should be added
 * via configuration rather than hardcoded here.
 */
export const STOPWORDS = new Set([
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your',
  'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her',
  'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs',
  'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if',
  'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with',
  'about', 'against', 'between', 'through', 'during', 'before', 'after', 'above',
  'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's',
  't', 'can', 'will', 'just', 'don', 'should', 'now', 'd', 'll', 'm', 'o', 're',
  've', 'y', 'ain', 'aren', 'couldn', 'didn', 'doesn', 'hadn', 'hasn', 'haven',
  'isn', 'ma', 'mightn', 'mustn', 'needn', 'shan', 'shouldn', 'wasn', 'weren',
  'won', 'wouldn', 'let', 'go', 'get', 'got', 'going', 'went', 'come', 'came',
  'make', 'made', 'take', 'took', 'give', 'gave', 'know', 'knew', 'think',
  'thought', 'see', 'saw', 'want', 'need', 'use', 'used', 'try', 'tried',
  'would', 'could', 'also', 'like', 'well', 'back', 'even', 'still', 'way',
  'thing', 'things', 'much', 'really', 'right', 'good', 'new', 'first', 'last',
  'long', 'great', 'little', 'keep', 'look', 'looks', 'help', 'okay', 'ok',
  'yeah', 'yes', 'sure', 'hey', 'hi', 'hello', 'thanks', 'thank', 'please',
  // Domain-specific stopwords that cause false matches
  'name', 'enter',
  // Contractions: non-discriminative but survive tokenization with apostrophes
  "it's", "don't", "didn't", "won't", "can't", "i'm", "i've", "i'll",
  "he's", "she's", "that's", "what's", "there's", "here's", "let's",
  "they're", "we're", "you're", "isn't", "aren't", "wasn't", "weren't",
  "hasn't", "haven't", "hadn't", "doesn't", "couldn't", "wouldn't",
  "shouldn't", "mustn't",
]);

// ---------------------------------------------------------------------------
// Stemmer
// ---------------------------------------------------------------------------

/**
 * Simple suffix-stripping stemmer.
 * Handles common English inflections to improve term matching.
 */
export function stem(word: string): string {
  if (word.length <= 4) return word;

  // Common suffixes in order of length (longest first)
  // Require minimum stem length of 4 to avoid over-stemming
  const suffixes = [
    'ational', 'tional', 'encies', 'ances', 'ments', 'ating', 'ation',
    'ities', 'ness', 'ment', 'ence', 'ance', 'able', 'ible',
    'ally', 'ful', 'ous', 'ive', 'ize', 'ise', 'ing', 'ies', 'ied',
    'ion', 'ity', 'ers', 'est', 'ent', 'ant', 'als', 'ors',
    'ism', 'ist', 'ly', 'ed', 'er', 'es',
  ];

  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) {
      return word.slice(0, word.length - suffix.length);
    }
  }

  // Handle trailing 's' (plurals)
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 5) {
    return word.slice(0, -1);
  }

  return word;
}

// ---------------------------------------------------------------------------
// Term Extraction
// ---------------------------------------------------------------------------

/**
 * Extract significant terms from text.
 * Returns stemmed, lowercased words that are not stopwords.
 */
export function extractTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
}

/**
 * Extract bigrams (two-word phrases) from terms.
 */
export function extractBigrams(terms: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < terms.length - 1; i++) {
    const a = terms[i];
    const b = terms[i + 1];
    if (a !== undefined && b !== undefined) {
      bigrams.push(`${a} ${b}`);
    }
  }
  return bigrams;
}

/**
 * Extract raw (unstemmed) significant words from text for phrase matching.
 */
export function extractRawTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Extract raw n-grams (bigrams + trigrams) for exact phrase matching.
 */
export function extractRawNgrams(text: string): { bigrams: string[]; trigrams: string[] } {
  const terms = extractRawTerms(text);
  const bigrams: string[] = [];
  const trigrams: string[] = [];
  for (let i = 0; i < terms.length - 1; i++) {
    const a = terms[i];
    const b = terms[i + 1];
    const c = terms[i + 2]; // may be undefined
    if (a !== undefined && b !== undefined) {
      bigrams.push(`${a} ${b}`);
      if (c !== undefined) {
        trigrams.push(`${a} ${b} ${c}`);
      }
    }
  }
  return { bigrams, trigrams };
}

// ---------------------------------------------------------------------------
// IDF
// ---------------------------------------------------------------------------

/**
 * Build IDF (inverse document frequency) map from all memories.
 * IDF = log(N / (1 + df)) where df = number of docs containing the term.
 */
export function buildIDF(memories: readonly MemoryDocument[]): Map<string, number> {
  const docFreq = new Map<string, number>();
  const N = memories.length;

  for (const memory of memories) {
    const terms = new Set(extractTerms(memory.content));
    for (const term of terms) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [term, df] of docFreq) {
    idf.set(term, Math.log((N + 1) / (1 + df)));
  }
  return idf;
}

// ---------------------------------------------------------------------------
// BM25 Scoring
// ---------------------------------------------------------------------------

/**
 * Score a memory against input terms using BM25-like scoring.
 *
 * Parameters: k1=1.5, b=0.3, IDF_FLOOR=1.5
 */
export function scoreBM25(
  memoryContent: string,
  inputTerms: string[],
  rawInputBigrams: string[],
  rawInputTrigrams: string[],
  idf: Map<string, number>,
  avgDocLen: number,
): number {
  const k1 = 1.5;
  const b = 0.3;
  const IDF_FLOOR = 1.5; // Skip low-IDF terms that appear in too many memories

  const memoryTerms = extractTerms(memoryContent);
  const docLen = memoryTerms.length;
  if (docLen === 0) return 0;

  // Build term frequency map for this memory
  const tf = new Map<string, number>();
  for (const term of memoryTerms) {
    tf.set(term, (tf.get(term) ?? 0) + 1);
  }

  let score = 0;

  // Unigram matching
  for (const term of inputTerms) {
    const termFreq = tf.get(term) ?? 0;
    if (termFreq === 0) continue;

    const termIdf = idf.get(term) ?? 0;
    if (termIdf < IDF_FLOOR) continue; // Skip non-discriminative terms
    const numerator = termFreq * (k1 + 1);
    const denominator = termFreq + k1 * (1 - b + b * (docLen / avgDocLen));
    score += termIdf * (numerator / denominator);
  }

  // Raw n-gram matching (bonus for exact phrase matches)
  const lowerContent = memoryContent.toLowerCase();
  for (const trigram of rawInputTrigrams) {
    if (lowerContent.includes(trigram)) {
      score += 3.0; // Trigrams are very specific
    }
  }
  for (const bigram of rawInputBigrams) {
    if (lowerContent.includes(bigram)) {
      score += 2.0;
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// Category Bridge
// ---------------------------------------------------------------------------

/**
 * Bridges the semantic gap between input terms and memory terms.
 * When input contains domain-specific terms, inject related "bridge" terms
 * at reduced weight to help retrieve contextually relevant memories.
 */

interface CategoryRule {
  trigger: Set<string>; // stemmed terms that activate this rule
  bridgeTerms: string[]; // stemmed terms to inject
}

export const CATEGORY_RULES: CategoryRule[] = [
  {
    // Flooring sales activity
    trigger: new Set(['pallet', 'ironp', 'roll', 'pad', 'prosource', 'carpet', 'adura', 'display', 'dealer', 'floor']),
    bridgeTerms: ['floor', 'sale', 'deal', 'distributor', 'pallet', 'sell'],
  },
  {
    // Coding / dev work
    trigger: new Set(['deploy', 'code', 'bug', 'fix', 'repo', 'commit', 'merge', 'branch', 'api']),
    bridgeTerms: ['mandrel', 'squire', 'agent', 'tool'],
  },
  {
    // People/meetings
    trigger: new Set(['appoint', 'meet', 'call', 'visit']),
    bridgeTerms: ['deal', 'sale', 'floor', 'contact'],
  },
];

/** Entity sets that trigger domain bridge terms. */
export const FLOORING_ENTITIES = new Set([
  'carpet village', 'adura', 'march madness', 'march padness',
  'prosource', 'carpet land', 'carpet land south', 'fci', 'floored', 'ironply',
]);

export const TECH_ENTITIES = new Set([
  'mandrel', 'squire', 'claude', 'claude code', 'forge',
]);

/**
 * Get bridge terms based on input terms matching category rules.
 */
export function getTermBridgeTerms(inputTerms: string[]): string[] {
  const inputSet = new Set(inputTerms);
  const bridge: string[] = [];
  for (const rule of CATEGORY_RULES) {
    let matched = false;
    for (const t of inputSet) {
      if (rule.trigger.has(t)) { matched = true; break; }
    }
    if (matched) {
      for (const bt of rule.bridgeTerms) {
        if (!inputSet.has(bt)) bridge.push(bt);
      }
    }
  }
  return [...new Set(bridge)];
}

/**
 * Get bridge terms based on detected entities.
 */
export function getEntityBridgeTerms(inputEntities: Set<string>): string[] {
  const terms: string[] = [];
  for (const e of inputEntities) {
    if (FLOORING_ENTITIES.has(e)) {
      terms.push('floor', 'sale', 'deal', 'distributor', 'sell', 'pallet');
      break;
    }
  }
  for (const e of inputEntities) {
    if (TECH_ENTITIES.has(e)) {
      terms.push('agent', 'tool', 'memory', 'system');
      break;
    }
  }
  return terms;
}

// ---------------------------------------------------------------------------
// Entity Matching (helper used by co-occurrence and similarity builders)
// ---------------------------------------------------------------------------

/**
 * Find entities mentioned in text.
 * Returns matching entity canonical names.
 */
export function findEntities(text: string, entities: readonly EntityRecord[]): Set<string> {
  const lowerText = text.toLowerCase();
  const found = new Set<string>();

  for (const entity of entities) {
    // Check canonical name
    if (entity.canonical_name.length > 2 && lowerText.includes(entity.canonical_name)) {
      found.add(entity.canonical_name);
    }
    // Check name
    if (entity.name.length > 2 && lowerText.includes(entity.name.toLowerCase())) {
      found.add(entity.canonical_name);
    }
    // Check aliases
    for (const alias of entity.aliases) {
      const lowerAlias = alias.toLowerCase();
      // Extract just the name part before parenthetical
      const nameOnly = lowerAlias.replace(/\s*\(.*\)/, '').trim();
      if (nameOnly.length > 2 && lowerText.includes(nameOnly)) {
        found.add(entity.canonical_name);
      }
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// Entity Co-occurrence Graph
// ---------------------------------------------------------------------------

/**
 * Build entity co-occurrence graph from memories.
 * Maps each entity to other entities it co-occurs with and the count.
 */
export function buildEntityCooccurrence(
  memories: readonly MemoryDocument[],
  entities: readonly EntityRecord[],
): Map<string, Map<string, number>> {
  const cooccur = new Map<string, Map<string, number>>();
  for (const memory of memories) {
    const ents = [...findEntities(memory.content, entities)];
    for (let i = 0; i < ents.length; i++) {
      for (let j = i + 1; j < ents.length; j++) {
        const a = ents[i];
        const b = ents[j];
        if (a === undefined || b === undefined) continue;
        if (!cooccur.has(a)) cooccur.set(a, new Map());
        if (!cooccur.has(b)) cooccur.set(b, new Map());
        const aMap = cooccur.get(a)!;
        const bMap = cooccur.get(b)!;
        aMap.set(b, (aMap.get(b) ?? 0) + 1);
        bMap.set(a, (bMap.get(a) ?? 0) + 1);
      }
    }
  }
  return cooccur;
}

// ---------------------------------------------------------------------------
// Memory Similarity Graph
// ---------------------------------------------------------------------------

/**
 * Build memory-memory similarity graph based on high-IDF term overlap (Jaccard).
 * For each memory, stores its top-K most similar neighbors.
 */
export function buildMemorySimilarityGraph(
  memories: readonly MemoryDocument[],
  idf: Map<string, number>,
): Map<string, Array<{ id: string; sim: number }>> {
  const IDF_FLOOR = 1.5;
  const K_NEIGHBORS = 10;
  const MIN_SIM = 0.05;

  // Build high-IDF term sets for each memory
  const highIdfTerms = new Map<string, Set<string>>();
  for (const m of memories) {
    const terms = new Set(extractTerms(m.content));
    const highIdf = new Set<string>();
    for (const t of terms) {
      if ((idf.get(t) ?? 0) >= IDF_FLOOR) highIdf.add(t);
    }
    highIdfTerms.set(m.id, highIdf);
  }

  // Compute pairwise Jaccard similarity
  const graph = new Map<string, Array<{ id: string; sim: number }>>();
  for (const m1 of memories) {
    const s1 = highIdfTerms.get(m1.id)!;
    if (s1.size === 0) { graph.set(m1.id, []); continue; }
    const sims: Array<{ id: string; sim: number }> = [];
    for (const m2 of memories) {
      if (m1.id === m2.id) continue;
      const s2 = highIdfTerms.get(m2.id)!;
      if (s2.size === 0) continue;
      let intersection = 0;
      for (const t of s1) if (s2.has(t)) intersection++;
      if (intersection === 0) continue;
      const union = s1.size + s2.size - intersection;
      const sim = intersection / union;
      if (sim > MIN_SIM) sims.push({ id: m2.id, sim });
    }
    sims.sort((a, b) => b.sim - a.sim);
    graph.set(m1.id, sims.slice(0, K_NEIGHBORS));
  }

  return graph;
}

// ---------------------------------------------------------------------------
// Module-level Cache (Phase 1c)
// ---------------------------------------------------------------------------

interface RecallCache {
  idf: Map<string, number>;
  avgDocLen: number;
  entityCooccurrence: Map<string, Map<string, number>>;
  memorySimilarityGraph: Map<string, Array<{ id: string; sim: number }>>;
  memories: MemoryDocument[];
  memoryRows: Map<string, MemoryRow>;
  entities: EntityRecord[];
  memoryCount: number;
  builtAt: number;
}

let recallCache: RecallCache | null = null;

function isCacheValid(currentMemoryCount: number): boolean {
  if (!recallCache) return false;
  if (recallCache.memoryCount !== currentMemoryCount) return false;
  if (Date.now() - recallCache.builtAt > config.recall.cacheTtlMs) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Add user stopwords from config
// ---------------------------------------------------------------------------

for (const w of config.recall.userStopwords) {
  const trimmed = w.trim().toLowerCase();
  if (trimmed.length > 0) {
    STOPWORDS.add(trimmed);
  }
}

// ---------------------------------------------------------------------------
// DB row types (for pg query typing)
// ---------------------------------------------------------------------------

interface MemoryCountRow {
  count: number;
}

interface MemoryRow {
  id: string;
  content: string;
  created_at: Date;
  salience_score: number;
  current_strength: number;
}

interface EntityRow {
  id: string;
  name: string;
  canonical_name: string;
  aliases: string[];
}

interface EmbeddingSimilarityRow {
  id: string;
  similarity: number;
}

interface EmbeddingNeighborRow {
  id: string;
  sim: number;
}

// ---------------------------------------------------------------------------
// LLM Reranker (Phase 3)
// ---------------------------------------------------------------------------

/**
 * Judge whether a single memory is relevant to the query using an LLM.
 * Returns true if the LLM judges the memory relevant, false otherwise.
 * On error, returns false (fail-safe).
 */
async function rerankerJudge(
  query: string,
  memoryContent: string,
): Promise<boolean> {
  try {
    const prompt = `User message: '${query}'\n\nMemory: '${memoryContent}'\n\nIs this memory relevant to the user's message? Answer only 'yes' or 'no'.`;
    const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
    const response = await callLLM(messages, undefined, {
      provider: config.recall.rerankerProvider,
      model: config.recall.rerankerModel,
      maxTokens: 10,
      temperature: 0,
      signal: AbortSignal.timeout(5000),
    });
    return response.content.toLowerCase().trim().startsWith('yes');
  } catch (error) {
    console.error('[Recall] Reranker error:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main Enhanced Recall (Phase 1b + Phase 2a/2b)
// ---------------------------------------------------------------------------

/**
 * Retrieve and rank memories using BM25, entity matching, category bridging,
 * and graph propagation. Returns scored candidates above an adaptive threshold.
 */
export async function enhancedRecall(
  query: string,
  options: {
    minSalience?: number;
    minStrength?: number;
    lookbackDays?: number;
    maxResults?: number;
    queryEmbedding?: number[];
  } = {},
): Promise<EnhancedRecallResult> {
  const startTime = Date.now();

  const minSalience = options.minSalience ?? 1.0;
  const minStrength = options.minStrength ?? 0.1;
  const lookbackDays = options.lookbackDays ?? 365;
  const maxResults = options.maxResults ?? 20;
  const lookbackDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Gates weights
  const TERM_BRIDGE_WEIGHT = 0.5;
  const ENTITY_BRIDGE_WEIGHT = 0.4;
  const ENTITY_DIRECT_BONUS = 20.0;
  const COOCCURRENCE_BONUS = 2.0;
  const PROPAGATE_WEIGHT = 0.07;
  const EMB_PROP_WEIGHT = 0.10;
  const EMB_SIMILARITY_SCALE = 15; // Scale embedding similarity to BM25-comparable range

  // ----- Step 1: Get memory count for cache check -----
  const countResult = await pool.query<MemoryCountRow>(
    `SELECT COUNT(*)::int as count FROM memories
     WHERE (conversation_mode IS NULL OR conversation_mode != 'meta_ai')
       AND (tier IS NULL OR tier = 'solid')
       AND (expression_safe IS NULL OR expression_safe = TRUE)`,
  );
  const memoryCount = countResult.rows[0]?.count ?? 0;

  // ----- Step 2: Build or reuse cache -----
  if (!isCacheValid(memoryCount)) {
    const memResult = await pool.query<MemoryRow>(
      `SELECT id, content, created_at, salience_score, current_strength
       FROM memories
       WHERE (conversation_mode IS NULL OR conversation_mode != 'meta_ai')
         AND (tier IS NULL OR tier = 'solid')
         AND (expression_safe IS NULL OR expression_safe = TRUE)
         AND salience_score >= $1
         AND current_strength >= $2
         AND created_at >= $3
       ORDER BY salience_score DESC`,
      [minSalience, minStrength, lookbackDate],
    );

    const entResult = await pool.query<EntityRow>(
      `SELECT id, name, canonical_name, aliases FROM entities WHERE is_merged = FALSE`,
    );

    const memories: MemoryDocument[] = memResult.rows.map((r) => ({
      id: r.id,
      content: r.content,
    }));

    const memoryRows = new Map<string, MemoryRow>();
    for (const r of memResult.rows) {
      memoryRows.set(r.id, r);
    }

    const entities: EntityRecord[] = entResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      canonical_name: r.canonical_name,
      aliases: r.aliases ?? [],
    }));

    const idf = buildIDF(memories);

    // Calculate average document length
    let totalLen = 0;
    for (const m of memories) {
      totalLen += extractTerms(m.content).length;
    }
    const avgDocLen = memories.length > 0 ? totalLen / memories.length : 1;

    const entityCooccurrence = buildEntityCooccurrence(memories, entities);
    const memorySimilarityGraph = buildMemorySimilarityGraph(memories, idf);

    recallCache = {
      idf,
      avgDocLen,
      entityCooccurrence,
      memorySimilarityGraph,
      memories,
      memoryRows,
      entities,
      memoryCount,
      builtAt: Date.now(),
    };
  }

  // Cache is guaranteed valid at this point
  const cache = recallCache!;

  // ----- Step 3: Score all memories -----
  const inputTerms = extractTerms(query);
  const { bigrams: rawBigrams, trigrams: rawTrigrams } = extractRawNgrams(query);
  const inputEntities = findEntities(query, cache.entities);

  // Get bridge terms
  const termBridges = getTermBridgeTerms(inputTerms);
  const entityBridges = getEntityBridgeTerms(inputEntities);

  // Combine input terms with weighted bridge terms
  // Bridge terms are added as additional scoring terms at reduced weight
  const allInputTerms = [...inputTerms];
  // We'll track bridge terms separately for weighted scoring
  const bridgeTermSet = new Set<string>();
  for (const bt of termBridges) {
    bridgeTermSet.add(bt);
    if (!allInputTerms.includes(bt)) allInputTerms.push(bt);
  }
  for (const ebt of entityBridges) {
    const stemmed = stem(ebt);
    bridgeTermSet.add(stemmed);
    if (!allInputTerms.includes(stemmed)) allInputTerms.push(stemmed);
  }

  // Score each memory
  let entityMatchCount = 0;
  let graphPropagationCount = 0;
  let embeddingCandidateCount = 0;

  const scored: Array<{
    id: string;
    bm25: number;
    entity: number;
    bridge: number;
    propagation: number;
    total: number;
    embeddingCandidate: boolean;
  }> = [];

  for (const mem of cache.memories) {
    // BM25 score with all terms (originals + bridges)
    const fullBm25 = scoreBM25(mem.content, allInputTerms, rawBigrams, rawTrigrams, cache.idf, cache.avgDocLen);

    // Separate bridge contribution for reporting
    const coreBm25 = scoreBM25(mem.content, inputTerms, rawBigrams, rawTrigrams, cache.idf, cache.avgDocLen);

    // Bridge terms contribute at reduced weight
    const bridgeBm25Raw = fullBm25 - coreBm25;
    // Weight the bridge contribution: term bridges at 0.5, entity bridges at 0.4
    // Use an average weight since both types are mixed
    const bridgeWeight = entityBridges.length > 0 && termBridges.length > 0
      ? (TERM_BRIDGE_WEIGHT + ENTITY_BRIDGE_WEIGHT) / 2
      : entityBridges.length > 0
        ? ENTITY_BRIDGE_WEIGHT
        : TERM_BRIDGE_WEIGHT;
    const bridgeScore = bridgeBm25Raw * bridgeWeight;

    // Entity matching
    const memEntities = findEntities(mem.content, cache.entities);
    let entityScore = 0;

    // Direct entity match bonus
    for (const ie of inputEntities) {
      if (memEntities.has(ie)) {
        entityScore += ENTITY_DIRECT_BONUS;
        entityMatchCount++;
      }
    }

    // Co-occurrence bonus
    for (const ie of inputEntities) {
      const coMap = cache.entityCooccurrence.get(ie);
      if (!coMap) continue;
      for (const me of memEntities) {
        if (me === ie) continue; // already counted as direct match
        if (coMap.has(me)) {
          entityScore += COOCCURRENCE_BONUS;
        }
      }
    }

    const bm25Score = coreBm25 + bridgeScore;
    const total = bm25Score + entityScore;

    scored.push({
      id: mem.id,
      bm25: bm25Score,
      entity: entityScore,
      bridge: bridgeScore,
      propagation: 0, // filled in next pass
      total,
      embeddingCandidate: false,
    });
  }

  // ----- Phase 2a: Embedding candidate generation -----
  if (options.queryEmbedding) {
    const bm25Ids = scored.filter(s => s.total > 0).map(s => s.id);
    const embeddingStr = `[${options.queryEmbedding.join(',')}]`;

    const embResult = await pool.query<EmbeddingSimilarityRow>(
      `SELECT id, 1 - (embedding <=> $1::vector) as similarity
       FROM memories
       WHERE embedding IS NOT NULL
         AND id != ALL($2)
         AND (conversation_mode IS NULL OR conversation_mode != 'meta_ai')
         AND (tier IS NULL OR tier = 'solid')
         AND (expression_safe IS NULL OR expression_safe = TRUE)
         AND 1 - (embedding <=> $1::vector) > 0.3
       ORDER BY similarity DESC
       LIMIT 10`,
      [embeddingStr, bm25Ids],
    );

    for (const row of embResult.rows) {
      const similarity = Number(row.similarity);
      scored.push({
        id: row.id,
        bm25: 0,
        entity: 0,
        bridge: 0,
        propagation: 0,
        total: similarity * EMB_SIMILARITY_SCALE,
        embeddingCandidate: true,
      });
      embeddingCandidateCount++;
    }
  }

  // Graph propagation pass
  const scoreMap = new Map<string, number>();
  for (const s of scored) {
    scoreMap.set(s.id, s.total);
  }

  for (const s of scored) {
    const neighbors = cache.memorySimilarityGraph.get(s.id);
    if (!neighbors || neighbors.length === 0) continue;

    let propagated = 0;
    for (const neighbor of neighbors) {
      const neighborScore = scoreMap.get(neighbor.id);
      if (neighborScore !== undefined && neighborScore > 0) {
        propagated += neighborScore * neighbor.sim * PROPAGATE_WEIGHT;
      }
    }

    if (propagated > 0) {
      s.propagation = propagated;
      s.total += propagated;
      graphPropagationCount++;
    }
  }

  // ----- Phase 2b: Embedding-based graph propagation -----
  if (options.queryEmbedding) {
    // Get top-7 BM25-scored memories for embedding neighbor lookup
    const top7Bm25 = [...scored]
      .filter(s => s.bm25 > 0)
      .sort((a, b) => b.bm25 - a.bm25)
      .slice(0, 7);

    // Build a score lookup for all currently scored memories
    const currentScoreMap = new Map<string, typeof scored[number]>();
    for (const s of scored) {
      currentScoreMap.set(s.id, s);
    }

    for (const topMem of top7Bm25) {
      const neighborsResult = await pool.query<EmbeddingNeighborRow>(
        `SELECT m2.id, 1 - (m1.embedding <=> m2.embedding) as sim
         FROM memories m1
         CROSS JOIN memories m2
         WHERE m1.id = $1
           AND m2.id != $1
           AND m1.embedding IS NOT NULL
           AND m2.embedding IS NOT NULL
           AND 1 - (m1.embedding <=> m2.embedding) > 0.6
         ORDER BY sim DESC
         LIMIT 5`,
        [topMem.id],
      );

      for (const neighbor of neighborsResult.rows) {
        const sim = Number(neighbor.sim);
        const existing = currentScoreMap.get(neighbor.id);
        if (existing) {
          // Add embedding propagation boost to existing scored memory
          const embPropagation = topMem.total * sim * EMB_PROP_WEIGHT;
          existing.propagation += embPropagation;
          existing.total += embPropagation;
        }
        // If neighbor is not in scored array at all, it wasn't in the cache
        // (filtered out by salience/strength/lookback) — skip it
      }
    }
  }

  // ----- Step 4: Adaptive threshold -----
  let topScore = 0;
  for (const s of scored) {
    if (s.total > topScore) topScore = s.total;
  }

  const absoluteFloor = 3.0;
  const relativeThreshold = topScore < 10 ? 0.65 : 0.35;
  const threshold = Math.max(absoluteFloor, topScore * relativeThreshold);

  // ----- Step 5: Build results -----
  let filtered = scored
    .filter((s) => s.total >= threshold)
    .sort((a, b) => b.total - a.total);

  // ----- Phase 3: LLM Reranker -----
  let rerankerUsed = false;
  let rerankerCalls = 0;
  let rerankerFallback = false;

  if (config.recall.rerankerEnabled && filtered.length > 0) {
    rerankerUsed = true;
    const rerankerPool = filtered.slice(0, config.recall.maxRerankerCandidates);
    rerankerCalls = rerankerPool.length;

    // Look up content for each candidate
    const judgments = await Promise.allSettled(
      rerankerPool.map(async (s) => {
        const row = cache.memoryRows.get(s.id);
        const content = row?.content ?? '';
        const relevant = await rerankerJudge(query, content);
        return { id: s.id, relevant };
      }),
    );

    // Check if ALL judgments failed
    const allFailed = judgments.every(j => j.status === 'rejected');

    if (allFailed) {
      // Total reranker failure — fall back to BM25 threshold-filtered results
      console.error('[Recall] Reranker error: all judgments failed, falling back to BM25');
      rerankerFallback = true;
    } else {
      // Build set of relevant IDs
      const relevantIds = new Set<string>();
      for (const j of judgments) {
        if (j.status === 'fulfilled') {
          if (j.value.relevant) {
            relevantIds.add(j.value.id);
          }
        } else {
          // Individual failure — treat as relevant (fail-open)
          // We don't have the id directly from rejected promise,
          // so we need a different approach
        }
      }

      // For individually failed judgments, treat as relevant (fail-open)
      for (let i = 0; i < judgments.length; i++) {
        const judgment = judgments[i];
        const candidate = rerankerPool[i];
        if (judgment !== undefined && judgment.status === 'rejected' && candidate !== undefined) {
          relevantIds.add(candidate.id);
        }
      }

      // Filter to only reranker-approved candidates
      const rerankedFiltered = filtered.filter(s => relevantIds.has(s.id));

      // If reranker returned fewer than 3 memories, fall back to BM25 results
      if (rerankedFiltered.length < 3) {
        rerankerFallback = true;
      } else {
        filtered = rerankedFiltered;
      }
    }
  }

  // Apply maxResults limit after reranker
  filtered = filtered.slice(0, maxResults);

  // Collect IDs of embedding candidates that passed threshold but aren't in cache
  const missingIds = filtered
    .filter(s => s.embeddingCandidate && !cache.memoryRows.has(s.id))
    .map(s => s.id);

  // Fetch missing embedding candidate rows from DB
  const embeddingRowMap = new Map<string, MemoryRow>();
  if (missingIds.length > 0) {
    const embRowResult = await pool.query<MemoryRow>(
      `SELECT id, content, created_at, salience_score, current_strength
       FROM memories WHERE id = ANY($1)`,
      [missingIds],
    );
    for (const r of embRowResult.rows) {
      embeddingRowMap.set(r.id, r);
    }
  }

  const candidates: MemoryCandidate[] = [];
  for (const s of filtered) {
    const row = cache.memoryRows.get(s.id) ?? embeddingRowMap.get(s.id);
    if (!row) continue;
    candidates.push({
      id: s.id,
      content: row.content,
      created_at: row.created_at,
      salience_score: row.salience_score,
      current_strength: row.current_strength,
      bm25Score: s.bm25,
      entityScore: s.entity,
      bridgeScore: s.bridge,
      propagationScore: s.propagation,
      totalScore: s.total,
      embeddingCandidate: s.embeddingCandidate || undefined,
    });
  }

  const stats: RecallStats = {
    candidateCount: candidates.length,
    idfTermCount: cache.idf.size,
    entityMatchCount,
    graphPropagationCount,
    embeddingCandidates: embeddingCandidateCount,
    rerankerUsed,
    rerankerCalls,
    rerankerFallback,
    elapsedMs: Date.now() - startTime,
  };

  return { memories: candidates, stats };
}
