'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchSummaries } from '@/lib/api/summaries';
import type { LivingSummary } from '@/lib/types';

/**
 * Hook to fetch all living summaries
 */
export function useSummaries(nonEmptyOnly = true) {
  return useQuery<LivingSummary[]>({
    queryKey: ['summaries', { nonEmptyOnly }],
    queryFn: () => fetchSummaries(nonEmptyOnly),
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
