// ============================================
// SQUIRE WEB - BELIEFS API
// ============================================

import { apiGet } from './client';
import type { Belief, BeliefCategory } from '@/lib/types';

// ============================================
// DATA TYPE MAPPING
// ============================================
// Backend → Frontend field mapping:
// - content → statement
// - belief_type → category
// - source_memory_count → evidence_count
// - first_extracted_at → first_observed
// - last_reinforced_at → last_reinforced
// - status 'superseded' → 'deprecated'

interface BackendBelief {
  id: string;
  content: string;
  belief_type: BeliefCategory;
  confidence: number;
  source_memory_count: number;
  first_extracted_at: string;
  last_reinforced_at: string | null;
  status: 'active' | 'superseded' | 'conflicted';
}

/**
 * Transform backend belief to frontend Belief type
 */
function transformBelief(backend: BackendBelief): Belief {
  return {
    id: backend.id,
    statement: backend.content,
    category: backend.belief_type,
    confidence: backend.confidence,
    evidence_count: backend.source_memory_count,
    first_observed: backend.first_extracted_at,
    last_reinforced: backend.last_reinforced_at || backend.first_extracted_at,
    status: backend.status === 'superseded' ? 'deprecated' : backend.status,
  };
}

// API Response types (using backend types)
interface BeliefsListResponse {
  beliefs: BackendBelief[];
  count: number;
}

interface BeliefStatsResponse {
  stats: {
    total: number;
    byCategory: Record<BeliefCategory, number>;
    byStatus: Record<string, number>;
    avgConfidence: number;
  };
  types: BeliefCategory[];
}

export interface FetchBeliefsOptions {
  type?: BeliefCategory;
  status?: 'active' | 'deprecated' | 'conflicted';
  minConfidence?: number;
  limit?: number;
}

/**
 * Fetch beliefs with optional filters
 */
export async function fetchBeliefs(options: FetchBeliefsOptions = {}): Promise<Belief[]> {
  const { type, status, minConfidence, limit = 50 } = options;
  const response = await apiGet<BeliefsListResponse>('/api/beliefs', {
    params: {
      type,
      status,
      minConfidence,
      limit,
    },
  });
  return response.beliefs.map(transformBelief);
}

/**
 * Fetch belief statistics
 */
export async function fetchBeliefStats(): Promise<BeliefStatsResponse['stats']> {
  const response = await apiGet<BeliefStatsResponse>('/api/beliefs/stats');
  return response.stats;
}
