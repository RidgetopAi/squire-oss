'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchInsights,
  fetchNewInsights,
  type FetchInsightsOptions,
} from '@/lib/api/insights';
import type { Insight } from '@/lib/types';

/**
 * Hook to fetch insights with optional filters
 */
export function useInsights(options: FetchInsightsOptions = {}) {
  const { type, status, priority, minConfidence, limit = 50 } = options;

  return useQuery<Insight[]>({
    queryKey: ['insights', { type, status, priority, minConfidence, limit }],
    queryFn: () => fetchInsights({ type, status, priority, minConfidence, limit }),
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch new/unreviewed insights for dashboard
 */
export function useNewInsights(limit = 6) {
  return useQuery<Insight[]>({
    queryKey: ['insights', 'new', limit],
    queryFn: () => fetchNewInsights(limit),
    staleTime: 1000 * 60 * 2, // 2 minutes - check more frequently for new insights
    refetchOnWindowFocus: false,
  });
}
