'use client';

// ============================================
// SQUIRE WEB - GRAPH DATA HOOKS
// ============================================

import { useQuery } from '@tanstack/react-query';
import {
  fetchGraphStats,
  fetchEntitySubgraph,
  fetchEntityNeighbors,
  fetchGraphVisualization,
  toForceGraphData,
  type GraphStats,
  type ForceGraphData,
  type EntityNeighborsResponse,
  type VisualizationOptions,
} from '@/lib/api/graph';

// ============================================
// GRAPH STATS HOOK
// ============================================

export function useGraphStats() {
  return useQuery<GraphStats>({
    queryKey: ['graph', 'stats'],
    queryFn: fetchGraphStats,
    staleTime: 60 * 1000, // 1 minute
  });
}

// ============================================
// ENTITY SUBGRAPH HOOK
// ============================================

export interface UseEntitySubgraphOptions {
  memoryLimit?: number;
  entityLimit?: number;
  includeEdges?: boolean;
  enabled?: boolean;
}

export function useEntitySubgraph(
  entityId: string | null,
  options: UseEntitySubgraphOptions = {}
) {
  const { memoryLimit, entityLimit, includeEdges, enabled = true } = options;

  return useQuery<ForceGraphData>({
    queryKey: ['graph', 'entity-subgraph', entityId, { memoryLimit, entityLimit, includeEdges }],
    queryFn: async () => {
      if (!entityId) throw new Error('Entity ID required');
      const response = await fetchEntitySubgraph(entityId, {
        memoryLimit,
        entityLimit,
        includeEdges,
      });
      return toForceGraphData(response);
    },
    enabled: enabled && !!entityId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

// ============================================
// ENTITY NEIGHBORS HOOK
// ============================================

export interface UseEntityNeighborsOptions {
  limit?: number;
  minShared?: number;
  type?: string;
  enabled?: boolean;
}

export function useEntityNeighbors(
  entityId: string | null,
  options: UseEntityNeighborsOptions = {}
) {
  const { limit, minShared, type, enabled = true } = options;

  return useQuery<EntityNeighborsResponse>({
    queryKey: ['graph', 'entity-neighbors', entityId, { limit, minShared, type }],
    queryFn: async () => {
      if (!entityId) throw new Error('Entity ID required');
      return fetchEntityNeighbors(entityId, { limit, minShared, type });
    },
    enabled: enabled && !!entityId,
    staleTime: 30 * 1000,
  });
}

// ============================================
// FULL VISUALIZATION HOOK
// ============================================

export interface UseGraphVisualizationOptions extends VisualizationOptions {
  enabled?: boolean;
}

/**
 * Hook to fetch full graph visualization data
 * Returns transformed data ready for react-force-graph
 */
export function useGraphVisualization(
  options: UseGraphVisualizationOptions = {}
) {
  const {
    nodeLimit,
    entityLimit,
    memoryLimit,
    minSalience,
    entityTypes,
    includeEdges,
    enabled = true,
  } = options;

  return useQuery<ForceGraphData>({
    queryKey: [
      'graph',
      'visualization',
      { nodeLimit, entityLimit, memoryLimit, minSalience, entityTypes, includeEdges },
    ],
    queryFn: async () => {
      const response = await fetchGraphVisualization({
        nodeLimit,
        entityLimit,
        memoryLimit,
        minSalience,
        entityTypes,
        includeEdges,
      });
      // Transform to ForceGraphData format
      return toForceGraphData({
        nodeCount: response.nodeCount,
        edgeCount: response.edgeCount,
        nodes: response.nodes,
        edges: response.edges,
      });
    },
    enabled,
    staleTime: 30 * 1000, // 30 seconds
  });
}
