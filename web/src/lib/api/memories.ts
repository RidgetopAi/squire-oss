// ============================================
// SQUIRE WEB - MEMORIES API
// ============================================

import { apiGet } from './client';
import type { Memory, ScoredMemory } from '@/lib/types';

// ============================================
// MEMORY CACHE
// ============================================

const memoryCache = new Map<string, Memory>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

function getCachedMemory(id: string): Memory | null {
  const timestamp = cacheTimestamps.get(id);
  if (!timestamp || Date.now() - timestamp > CACHE_TTL) {
    memoryCache.delete(id);
    cacheTimestamps.delete(id);
    return null;
  }
  return memoryCache.get(id) ?? null;
}

function setCachedMemory(memory: Memory): void {
  memoryCache.set(memory.id, memory);
  cacheTimestamps.set(memory.id, Date.now());
}

// Raw API response type (matches backend schema)
interface ApiMemory {
  id: string;
  content: string;
  source: string;
  salience_score: number;  // Backend uses salience_score
  created_at: string;
  occurred_at: string | null;
  last_accessed_at: string | null;
  // ... other fields
}

// Transform backend memory to frontend Memory type
function transformMemory(apiMemory: ApiMemory): Memory {
  return {
    id: apiMemory.id,
    content: apiMemory.content,
    source: apiMemory.source as Memory['source'],
    salience: apiMemory.salience_score ?? 0,  // Map salience_score -> salience
    created_at: apiMemory.created_at,
    updated_at: apiMemory.occurred_at ?? apiMemory.created_at,  // Use occurred_at or fallback to created_at
  };
}

// API Response types
interface MemoriesListResponse {
  memories: ApiMemory[];
  total: number;
  limit: number;
  offset: number;
}

interface MemorySearchResponse {
  query: string;
  results: ApiMemory[];
  count: number;
}

export interface FetchMemoriesOptions {
  limit?: number;
  offset?: number;
  source?: string;
}

export interface MemoriesPage {
  memories: Memory[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
}

/**
 * Fetch memories with optional filters
 */
export async function fetchMemories(options: FetchMemoriesOptions = {}): Promise<{
  memories: Memory[];
  total: number;
}> {
  const { limit = 50, offset = 0, source } = options;
  const response = await apiGet<MemoriesListResponse>('/api/memories', {
    params: { limit, offset, source },
  });
  return {
    memories: response.memories.map(transformMemory),
    total: response.total,
  };
}

/**
 * Fetch memories page for infinite scroll
 */
export async function fetchMemoriesPage(options: FetchMemoriesOptions = {}): Promise<MemoriesPage> {
  const { limit = 30, offset = 0, source } = options;
  const response = await apiGet<MemoriesListResponse>('/api/memories', {
    params: { limit, offset, source },
  });

  const hasMore = offset + response.memories.length < response.total;

  return {
    memories: response.memories.map(transformMemory),
    total: response.total,
    offset,
    limit,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}

/**
 * Fetch recent high-salience memories for TodayPanel
 * Fetches recent memories and sorts by salience client-side
 */
export async function fetchRecentHighSalienceMemories(
  limit = 10
): Promise<Memory[]> {
  // Fetch more than needed to filter for high salience
  const response = await apiGet<MemoriesListResponse>('/api/memories', {
    params: { limit: limit * 3, offset: 0 },
  });

  // Transform to frontend type
  const memories = response.memories.map(transformMemory);

  // Sort by salience (descending) then by recency (descending)
  const sorted = memories.sort((a, b) => {
    // Primary: salience score
    if (b.salience !== a.salience) {
      return b.salience - a.salience;
    }
    // Secondary: recency
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Return top N
  return sorted.slice(0, limit);
}

/**
 * Fetch a single memory by ID
 */
export async function fetchMemory(id: string): Promise<Memory> {
  const response = await apiGet<ApiMemory>(`/api/memories/${id}`);
  return transformMemory(response);
}

/**
 * Search memories semantically
 */
export async function searchMemories(
  query: string,
  options: { limit?: number; minSimilarity?: number } = {}
): Promise<Memory[]> {
  const { limit = 10, minSimilarity = 0.3 } = options;
  const response = await apiGet<MemorySearchResponse>('/api/memories/search', {
    params: { query, limit, min_similarity: minSimilarity },
  });
  return response.results.map(transformMemory);
}

// ============================================
// BATCH FETCH WITH CACHING
// ============================================

/**
 * Fetch multiple memories by IDs with smart caching.
 * Returns memories in the same order as requested IDs.
 */
export async function fetchMemoriesByIds(ids: string[]): Promise<Memory[]> {
  if (ids.length === 0) return [];

  const results: Map<string, Memory> = new Map();
  const idsToFetch: string[] = [];

  // Check cache first
  for (const id of ids) {
    const cached = getCachedMemory(id);
    if (cached) {
      results.set(id, cached);
    } else {
      idsToFetch.push(id);
    }
  }

  // Fetch missing ones in parallel
  if (idsToFetch.length > 0) {
    const fetchPromises = idsToFetch.map(async (id) => {
      try {
        const memory = await fetchMemory(id);
        setCachedMemory(memory);
        return memory;
      } catch (error) {
        console.warn(`Failed to fetch memory ${id}:`, error);
        return null;
      }
    });

    const fetched = await Promise.all(fetchPromises);
    fetched.forEach((memory) => {
      if (memory) {
        results.set(memory.id, memory);
      }
    });
  }

  // Return in original order, filtering out any that failed
  return ids.map((id) => results.get(id)).filter((m): m is Memory => m != null);
}

/**
 * Convert a Memory to ScoredMemory format for overlay display.
 * Uses sensible defaults for scoring fields.
 */
export function memoryToScoredMemory(memory: Memory): ScoredMemory {
  return {
    id: memory.id,
    content: memory.content,
    created_at: memory.created_at,
    salience_score: memory.salience,
    current_strength: 1,
    recency_score: 1,
    final_score: memory.salience,
    token_estimate: Math.ceil(memory.content.length / 4),
    category: 'relevant' as const,
  };
}
