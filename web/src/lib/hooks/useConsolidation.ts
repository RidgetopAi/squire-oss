// ============================================
// SQUIRE WEB - CONSOLIDATION HOOK
// ============================================
// React hook for triggering and monitoring consolidation

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  triggerConsolidation,
  type ConsolidationResult,
} from '@/lib/api/consolidation';

// Query keys
const consolidationKeys = {
  all: ['consolidation'] as const,
  stats: () => [...consolidationKeys.all, 'stats'] as const,
};

/**
 * Hook for triggering consolidation (sleep)
 * Returns mutation for triggering and result/error states
 */
export function useConsolidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerConsolidation,
    onSuccess: (result) => {
      console.log('[useConsolidation] Consolidation complete:', result);

      // Invalidate all memory-related queries so UI refreshes
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      queryClient.invalidateQueries({ queryKey: ['beliefs'] });
      queryClient.invalidateQueries({ queryKey: ['patterns'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['entities'] });
      queryClient.invalidateQueries({ queryKey: consolidationKeys.stats() });
    },
    onError: (error) => {
      console.error('[useConsolidation] Consolidation failed:', error);
    },
  });
}


/**
 * Helper to format consolidation result for display
 */
export function formatConsolidationResult(result: ConsolidationResult): string {
  const parts: string[] = [];

  if (result.chatMemoriesCreated > 0) {
    parts.push(`${result.chatMemoriesCreated} memories extracted from chat`);
  }

  if (result.memoriesDecayed > 0 || result.memoriesStrengthened > 0) {
    parts.push(
      `${result.memoriesStrengthened} memories strengthened, ${result.memoriesDecayed} decayed`
    );
  }

  if (result.edgesCreated > 0) {
    parts.push(`${result.edgesCreated} new connections formed`);
  }

  if (result.patternsCreated > 0) {
    parts.push(`${result.patternsCreated} patterns discovered`);
  }

  if (result.insightsCreated > 0) {
    parts.push(`${result.insightsCreated} insights generated`);
  }

  if (parts.length === 0) {
    return 'No changes during consolidation';
  }

  return parts.join(', ');
}
