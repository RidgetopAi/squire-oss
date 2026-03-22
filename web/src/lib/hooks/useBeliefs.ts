'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchBeliefs,
  fetchBeliefStats,
  type FetchBeliefsOptions,
} from '@/lib/api/beliefs';
import type { Belief } from '@/lib/types';

/**
 * Hook to fetch beliefs with optional filters
 */
export function useBeliefs(options: FetchBeliefsOptions = {}) {
  const { type, status, minConfidence, limit = 50 } = options;

  return useQuery<Belief[]>({
    queryKey: ['beliefs', { type, status, minConfidence, limit }],
    queryFn: () => fetchBeliefs({ type, status, minConfidence, limit }),
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch belief statistics
 */
export function useBeliefStats() {
  return useQuery({
    queryKey: ['beliefs', 'stats'],
    queryFn: fetchBeliefStats,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

