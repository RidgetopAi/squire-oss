// ============================================
// SQUIRE WEB - GRAPH API
// ============================================

import { apiGet } from './client';

// ============================================
// TYPES
// ============================================

export type NodeType = 'memory' | 'entity';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  attributes: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
  attributes: Record<string, unknown>;
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  memoryCount: number;
  entityCount: number;
  averageConnections: number;
}

export interface SubgraphResponse {
  centerEntity?: { id: string; name: string };
  centerMemoryId?: string;
  nodeCount: number;
  edgeCount: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface EntityNeighbor {
  id: string;
  name: string;
  type: string;
  sharedMemoryCount: number;
  connectionStrength: number;
  sharedMemoryIds: string[];
}

export interface EntityNeighborsResponse {
  entityId: string;
  entityName: string;
  neighborCount: number;
  neighbors: EntityNeighbor[];
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Fetch graph statistics
 */
export async function fetchGraphStats(): Promise<GraphStats> {
  return apiGet<GraphStats>('/api/graph/stats');
}

/**
 * Fetch entity subgraph (nodes and edges around an entity)
 */
export async function fetchEntitySubgraph(
  entityId: string,
  options: {
    memoryLimit?: number;
    entityLimit?: number;
    includeEdges?: boolean;
  } = {}
): Promise<SubgraphResponse> {
  const { memoryLimit = 20, entityLimit = 10, includeEdges = true } = options;
  return apiGet<SubgraphResponse>(`/api/graph/entities/${entityId}/subgraph`, {
    params: { memoryLimit, entityLimit, includeEdges },
  });
}

/**
 * Fetch memory subgraph (nodes and edges around a memory)
 */
export async function fetchMemorySubgraph(
  memoryId: string,
  options: {
    maxHops?: number;
    includeEntities?: boolean;
  } = {}
): Promise<SubgraphResponse> {
  const { maxHops = 1, includeEntities = true } = options;
  return apiGet<SubgraphResponse>(`/api/graph/memories/${memoryId}/subgraph`, {
    params: { maxHops, includeEntities },
  });
}

/**
 * Fetch entity neighbors (entities that co-occur with a given entity)
 */
export async function fetchEntityNeighbors(
  entityId: string,
  options: {
    limit?: number;
    minShared?: number;
    type?: string;
  } = {}
): Promise<EntityNeighborsResponse> {
  const { limit = 20, minShared = 1, type } = options;
  return apiGet<EntityNeighborsResponse>(`/api/graph/entities/${entityId}/neighbors`, {
    params: { limit, minShared, type },
  });
}

export interface VisualizationOptions {
  nodeLimit?: number;
  entityLimit?: number;
  memoryLimit?: number;
  minSalience?: number;
  entityTypes?: string[];
  includeEdges?: boolean;
}

export interface VisualizationResponse {
  nodeCount: number;
  edgeCount: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Fetch full graph visualization data
 * Returns top entities and connected memories for overview display
 */
export async function fetchGraphVisualization(
  options: VisualizationOptions = {}
): Promise<VisualizationResponse> {
  const {
    nodeLimit = 100,
    entityLimit = 30,
    memoryLimit = 70,
    minSalience = 0,
    entityTypes,
    includeEdges = true,
  } = options;

  const params: Record<string, string | number | boolean> = {
    nodeLimit,
    entityLimit,
    memoryLimit,
    minSalience,
    includeEdges,
  };

  if (entityTypes && entityTypes.length > 0) {
    params.entityTypes = entityTypes.join(',');
  }

  return apiGet<VisualizationResponse>('/api/graph/visualization', { params });
}

// ============================================
// VISUALIZATION HELPERS
// ============================================

/**
 * Transform graph data to react-force-graph format
 * react-force-graph expects:
 * - nodes: { id, ... }
 * - links: { source, target, ... }
 */
export interface ForceGraphData {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
}

export interface ForceGraphNode {
  id: string;
  type: NodeType;
  label: string;
  val: number; // Size value for the node
  color?: string;
  attributes: Record<string, unknown>;
}

export interface ForceGraphLink {
  source: string;
  target: string;
  type: string;
  weight: number;
  color?: string;
}

// Node colors by type
const NODE_COLORS: Record<NodeType, string> = {
  memory: '#60a5fa', // blue-400
  entity: '#a78bfa', // violet-400
};

// Edge colors by type
const EDGE_COLORS: Record<string, string> = {
  SIMILAR: '#3b82f6',   // blue-500
  MENTIONS: '#8b5cf6',  // violet-500
  TEMPORAL: '#22c55e',  // green-500
  CAUSAL: '#f59e0b',    // amber-500
  CO_OCCURS: '#f59e0b', // amber-500
  default: '#64748b',   // slate-500
};

/**
 * Transform backend subgraph to react-force-graph format
 */
export function toForceGraphData(subgraph: SubgraphResponse): ForceGraphData {
  const nodes: ForceGraphNode[] = subgraph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    label: node.label,
    val: node.type === 'entity' ? 8 : 4, // Entities are larger
    color: NODE_COLORS[node.type],
    attributes: node.attributes,
  }));

  const links: ForceGraphLink[] = subgraph.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    type: edge.type,
    weight: edge.weight,
    color: EDGE_COLORS[edge.type] || EDGE_COLORS.default,
  }));

  return { nodes, links };
}
