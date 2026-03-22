'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchPatterns,
  fetchPatternStats,
  type FetchPatternsOptions,
} from '@/lib/api/patterns';
import type { Pattern } from '@/lib/types';

/**
 * Hook to fetch patterns with optional filters
 */
export function usePatterns(options: FetchPatternsOptions = {}) {
  const { type, status, minConfidence, timeOfDay, dayOfWeek, limit = 50 } = options;

  return useQuery<Pattern[]>({
    queryKey: ['patterns', { type, status, minConfidence, timeOfDay, dayOfWeek, limit }],
    queryFn: () => fetchPatterns({ type, status, minConfidence, timeOfDay, dayOfWeek, limit }),
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch pattern statistics
 */
export function usePatternStats() {
  return useQuery({
    queryKey: ['patterns', 'stats'],
    queryFn: fetchPatternStats,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

