/**
 * Story Cache Service
 *
 * Caches generated stories to avoid redundant LLM calls for repeated
 * biographical queries. Uses TTL-based expiration and invalidates
 * when new relevant memories are added.
 *
 * Part of Phase 4: Routing & UX - "Generate Not Retrieve" memory system
 */

import type { StoryResult } from './storyEngine.js';
import type { StoryIntent } from './storyIntent.js';
import crypto from 'crypto';

// === CONFIGURATION ===

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes default TTL
const MAX_CACHE_SIZE = 50; // Maximum number of cached stories
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 minutes

// === TYPES ===

interface CacheEntry {
  result: StoryResult;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
  intentKind: string;
}

interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  invalidations: number;
  totalHitCount: number;
}

// === CACHE STORAGE ===

const cache = new Map<string, CacheEntry>();
let stats: CacheStats = {
  size: 0,
  hits: 0,
  misses: 0,
  invalidations: 0,
  totalHitCount: 0,
};

// === CACHE KEY GENERATION ===

/**
 * Generate a cache key from query and intent
 * Normalizes the query to improve cache hit rate
 */
function generateCacheKey(query: string, intent: StoryIntent): string {
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
  const intentStr = serializeIntent(intent);
  const combined = `${normalizedQuery}|${intentStr}`;
  return crypto.createHash('md5').update(combined).digest('hex');
}

/**
 * Serialize intent to a consistent string for cache key
 */
function serializeIntent(intent: StoryIntent): string {
  switch (intent.kind) {
    case 'none':
      return 'none';
    case 'date_meaning':
      return `date:${intent.dateText.toLowerCase()}`;
    case 'origin_story':
      return `origin:${(intent.topic ?? '').toLowerCase()}`;
    case 'relationship_story':
      return `relationship:${(intent.personName ?? '').toLowerCase()}`;
    case 'self_story':
      return 'self';
    default:
      return 'unknown';
  }
}

// === CACHE OPERATIONS ===

/**
 * Get a cached story result if available and not expired
 */
export function getCachedStory(query: string, intent: StoryIntent): StoryResult | null {
  const key = generateCacheKey(query, intent);
  const entry = cache.get(key);

  if (!entry) {
    stats.misses++;
    return null;
  }

  // Check expiration
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    stats.misses++;
    return null;
  }

  // Cache hit
  entry.hitCount++;
  stats.hits++;
  stats.totalHitCount++;

  console.log(`[StoryCache] Hit for intent ${entry.intentKind} (hits: ${entry.hitCount})`);
  return entry.result;
}

/**
 * Store a story result in cache
 */
export function cacheStory(
  query: string,
  intent: StoryIntent,
  result: StoryResult,
  ttlMs: number = CACHE_TTL_MS
): void {
  const key = generateCacheKey(query, intent);
  const now = Date.now();

  // Enforce max cache size (LRU eviction)
  if (cache.size >= MAX_CACHE_SIZE) {
    evictLeastRecentlyUsed();
  }

  cache.set(key, {
    result,
    createdAt: now,
    expiresAt: now + ttlMs,
    hitCount: 0,
    intentKind: intent.kind,
  });

  stats.size = cache.size;
  console.log(`[StoryCache] Cached story for intent ${intent.kind} (TTL: ${ttlMs / 1000}s)`);
}

/**
 * Evict the least recently used entry
 */
function evictLeastRecentlyUsed(): void {
  let oldestKey: string | null = null;
  let oldestTime = Infinity;

  for (const [key, entry] of cache) {
    if (entry.createdAt < oldestTime) {
      oldestTime = entry.createdAt;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    cache.delete(oldestKey);
    console.log('[StoryCache] Evicted oldest entry (LRU)');
  }
}

// === INVALIDATION ===

/**
 * Invalidate cache entries by intent kind
 * Called when new memories are added that might affect stories
 */
function invalidateByIntentKind(intentKind: string): number {
  let count = 0;
  for (const [key, entry] of cache) {
    if (entry.intentKind === intentKind) {
      cache.delete(key);
      count++;
    }
  }
  if (count > 0) {
    stats.invalidations += count;
    stats.size = cache.size;
    console.log(`[StoryCache] Invalidated ${count} entries for intent kind: ${intentKind}`);
  }
  return count;
}

/**
 * Invalidate all self_story entries
 * Call when biographical memories are added
 */
function invalidateSelfStories(): number {
  return invalidateByIntentKind('self_story');
}

/**
 * Invalidate all relationship stories
 * Call when relationship-related memories are added
 */
function invalidateRelationshipStories(): number {
  return invalidateByIntentKind('relationship_story');
}

/**
 * Invalidate all date-related stories
 * Call when significant date memories are added
 */
function invalidateDateStories(): number {
  return invalidateByIntentKind('date_meaning');
}

/**
 * Smart invalidation based on memory content
 * Analyzes new memory and invalidates relevant cache entries
 */
export function smartInvalidate(memoryContent: string): void {
  const content = memoryContent.toLowerCase();

  // Check for self/identity content
  const selfPatterns = [
    /\b(i am|i'm|my name|i work|i live|i was born)\b/i,
    /\b(user is|user's name|user works|user lives)\b/i,
  ];
  if (selfPatterns.some(p => p.test(content))) {
    invalidateSelfStories();
  }

  // Check for relationship content
  const relationshipPatterns = [
    /\b(wife|husband|spouse|partner|son|daughter|mother|father|friend|colleague)\b/i,
  ];
  if (relationshipPatterns.some(p => p.test(content))) {
    invalidateRelationshipStories();
  }

  // Check for significant date content
  const datePatterns = [
    /\b(birthday|anniversary|wedding|graduated|died|born)\b/i,
    /\b(february|january|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i,
  ];
  if (datePatterns.some(p => p.test(content))) {
    invalidateDateStories();
  }
}

// === CLEANUP ===

/**
 * Remove expired entries from cache
 */
function cleanupExpired(): number {
  const now = Date.now();
  let removed = 0;

  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) {
      cache.delete(key);
      removed++;
    }
  }

  if (removed > 0) {
    stats.size = cache.size;
    console.log(`[StoryCache] Cleaned up ${removed} expired entries`);
  }

  return removed;
}

// Start periodic cleanup
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanupInterval(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(cleanupExpired, CLEANUP_INTERVAL_MS);
  console.log('[StoryCache] Started cleanup interval');
}

// Start cleanup on module load
startCleanupInterval();
