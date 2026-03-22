'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import {
  fetchMemories,
  fetchMemoriesPage,
  fetchRecentHighSalienceMemories,
  fetchMemory,
  searchMemories,
  type FetchMemoriesOptions,
  type MemoriesPage,
} from '@/lib/api/memories';
import type { Memory } from '@/lib/types';

/**
 * Hook to fetch paginated memories
 */
export function useMemories(options: FetchMemoriesOptions = {}) {
  const { limit = 50, offset = 0, source } = options;

  return useQuery({
    queryKey: ['memories', { limit, offset, source }],
    queryFn: () => fetchMemories({ limit, offset, source }),
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch recent high-salience memories for TodayPanel
 */
export function useRecentHighSalienceMemories(limit = 8) {
  return useQuery<Memory[]>({
    queryKey: ['memories', 'recent-high-salience', limit],
    queryFn: () => fetchRecentHighSalienceMemories(limit),
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch a single memory by ID
 */
export function useMemory(id: string | undefined) {
  return useQuery<Memory>({
    queryKey: ['memories', id],
    queryFn: () => fetchMemory(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to search memories semantically
 */
export function useMemorySearch(
  query: string,
  options: { limit?: number; minSimilarity?: number } = {}
) {
  const { limit = 10, minSimilarity = 0.3 } = options;

  return useQuery<Memory[]>({
    queryKey: ['memories', 'search', query, limit, minSimilarity],
    queryFn: () => searchMemories(query, { limit, minSimilarity }),
    enabled: query.length > 2,
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for infinite scroll pagination of memories
 */
export function useInfiniteMemories(options: { pageSize?: number; source?: string } = {}) {
  const { pageSize = 30, source } = options;

  return useInfiniteQuery<MemoriesPage>({
    queryKey: ['memories', 'infinite', { pageSize, source }],
    queryFn: ({ pageParam = 0 }) =>
      fetchMemoriesPage({ limit: pageSize, offset: pageParam as number, source }),
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 1000 * 60 * 1, // 1 minute
    refetchOnWindowFocus: true,
    refetchInterval: 1000 * 60, // refresh every 60s to keep relative times accurate
  });
}
