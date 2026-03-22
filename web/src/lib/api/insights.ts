// ============================================
// SQUIRE WEB - INSIGHTS API
// ============================================

import { apiGet } from './client';
import type { Insight, InsightType } from '@/lib/types';

// ============================================
// DATA TYPE MAPPING
// ============================================
// Backend → Frontend field mapping:
// - insight_type → type
// - status 'active' → 'new'
// - status 'stale' → 'reviewed'

// Extended types for API
type InsightPriority = 'low' | 'medium' | 'high' | 'critical';
type InsightStatus = 'new' | 'reviewed' | 'actioned' | 'dismissed';
type BackendInsightStatus = 'active' | 'stale' | 'actioned' | 'dismissed';

interface BackendInsight {
  id: string;
  content: string;
  insight_type: InsightType;
  priority: InsightPriority;
  status: BackendInsightStatus;
  created_at: string;
}

/**
 * Map backend status to frontend status
 */
function mapInsightStatus(backendStatus: BackendInsightStatus): InsightStatus {
  switch (backendStatus) {
    case 'active':
      return 'new';
    case 'stale':
      return 'reviewed';
    case 'actioned':
      return 'actioned';
    case 'dismissed':
      return 'dismissed';
    default:
      return 'new';
  }
}

/**
 * Transform backend insight to frontend Insight type
 */
function transformInsight(backend: BackendInsight): Insight {
  return {
    id: backend.id,
    content: backend.content,
    type: backend.insight_type,
    priority: backend.priority,
    status: mapInsightStatus(backend.status),
    source_memories: [], // Sources fetched separately via /api/insights/:id/sources
    created_at: backend.created_at,
  };
}

// API Response types (using backend types)
interface InsightsListResponse {
  insights: BackendInsight[];
  count: number;
}

export interface FetchInsightsOptions {
  type?: InsightType;
  status?: InsightStatus;
  priority?: InsightPriority;
  minConfidence?: number;
  limit?: number;
}

/**
 * Fetch insights with optional filters
 */
export async function fetchInsights(options: FetchInsightsOptions = {}): Promise<Insight[]> {
  const { type, status, priority, minConfidence, limit = 50 } = options;
  // Map frontend status to backend status for filtering
  const backendStatus = status === 'new' ? 'active' : status === 'reviewed' ? 'stale' : status;
  const response = await apiGet<InsightsListResponse>('/api/insights', {
    params: {
      type,
      status: backendStatus,
      priority,
      minConfidence,
      limit,
    },
  });
  return response.insights.map(transformInsight);
}

/**
 * Fetch new/unreviewed insights for dashboard
 */
export async function fetchNewInsights(limit = 6): Promise<Insight[]> {
  // Backend uses 'active' for what frontend calls 'new'
  const response = await apiGet<InsightsListResponse>('/api/insights', {
    params: { status: 'active', limit },
  });
  return response.insights.map(transformInsight);
}
