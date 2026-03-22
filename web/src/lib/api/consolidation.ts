// ============================================
// SQUIRE WEB - CONSOLIDATION API
// ============================================
// API functions for triggering and monitoring consolidation

import { apiGet, apiPost } from './client';

// === TYPES ===

export interface ConsolidationResult {
  // Chat extraction results
  chatConversationsProcessed: number;
  chatMessagesProcessed: number;
  chatMemoriesCreated: number;
  chatBeliefsCreated: number;
  // Memory processing results
  memoriesProcessed: number;
  memoriesDecayed: number;
  memoriesStrengthened: number;
  edgesCreated: number;
  edgesReinforced: number;
  edgesPruned: number;
  patternsCreated: number;
  patternsReinforced: number;
  patternsDormant: number;
  insightsCreated: number;
  insightsValidated: number;
  insightsStale: number;
  gapsCreated: number;
  gapsSurfaced: number;
  questionsCreated: number;
  questionsExpired: number;
  durationMs: number;
}

export interface ConsolidationStats {
  stats: {
    totalEdges: number;
    averageWeight: number;
    dormantMemories: number;
    activeMemories: number;
  };
  sessions: {
    total: number;
    active: number;
    pending: number;
    completed: number;
    averageDuration: number;
  };
  config: {
    decay: {
      baseRate: number;
      minStrength: number;
      accessDecayDays: number;
      unaccessed_multiplier: number;
    };
    strengthen: {
      baseGain: number;
      maxStrength: number;
      frequentAccessThreshold: number;
      highSalienceThreshold: number;
    };
    edges: {
      similarityThreshold: number;
      maxEdgesPerMemory: number;
      edgeDecayRate: number;
      minEdgeWeight: number;
    };
  };
}

interface ApiSuccessResponse<T> {
  success: boolean;
  result?: T;
  stats?: ConsolidationStats['stats'];
  sessions?: ConsolidationStats['sessions'];
  config?: ConsolidationStats['config'];
}

// === API FUNCTIONS ===

/**
 * Trigger consolidation (sleep)
 * Extracts memories from chat, then runs decay/edges/patterns/insights
 */
export async function triggerConsolidation(): Promise<ConsolidationResult> {
  const response = await apiPost<ApiSuccessResponse<ConsolidationResult>>(
    '/api/consolidation/run'
  );

  if (!response.result) {
    throw new Error('Consolidation failed - no result returned');
  }

  return response.result;
}

