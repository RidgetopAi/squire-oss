/**
 * Memory Graph Service
 *
 * Phase 2: Memory Graph Traversal for Story Engine
 *
 * Provides neighborhood traversal focused on memory nodes for narrative synthesis.
 * Uses existing tables:
 * - memory_edges (SIMILAR edges between memories)
 * - entity_mentions (ENTITY edges via shared entities)
 * - memory_summary_links (SUMMARY edges to living summaries)
 *
 * Unlike graph.ts (entity-centric), this is memory-centric for Story Engine use.
 */

import { pool } from '../db/pool.js';
import type { Memory } from './memories.js';

// === TYPES ===

export type GraphEdgeType = 'SIMILAR' | 'ENTITY' | 'SUMMARY' | 'DATE';

export interface GraphNode {
  id: string;
  kind: 'memory' | 'summary' | 'note' | 'list';
  content: string;
  created_at: Date | null;
  score: number;
  salience?: number;
  source?: string;
}

export interface GraphEdge {
  source_id: string;
  target_id: string;
  edge_type: GraphEdgeType;
  weight: number;
  via?: string; // entity name, summary category, or date
}

export interface GraphNeighborhood {
  seed: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TraversalOptions {
  maxDepth?: number;        // How many hops (default: 2)
  maxNodes?: number;        // Total node limit (default: 50)
  minWeight?: number;       // Minimum edge weight (default: 0.3)
  minSalience?: number;     // Minimum salience for memories (default: 1.0)
  edgeTypes?: GraphEdgeType[]; // Which edge types to follow (default: all)
}

const DEFAULT_OPTIONS: Required<TraversalOptions> = {
  maxDepth: 2,
  maxNodes: 50,
  minWeight: 0.3,
  minSalience: 1.0,
  edgeTypes: ['SIMILAR', 'ENTITY', 'SUMMARY'],
};

// === NEIGHBORHOOD FROM MEMORY SEEDS ===

/**
 * Get the neighborhood of nodes around seed memories
 * Traverses SIMILAR, ENTITY, and SUMMARY edges up to maxDepth hops
 */
export async function getNeighborhoodFromMemories(
  seedIds: string[],
  options: TraversalOptions = {}
): Promise<GraphNeighborhood[]> {
  if (seedIds.length === 0) return [];

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const results: GraphNeighborhood[] = [];

  for (const seedId of seedIds.slice(0, 10)) { // Limit seeds to prevent explosion
    const neighborhood = await traverseFromSeed(seedId, opts);
    if (neighborhood) {
      results.push(neighborhood);
    }
  }

  return results;
}

/**
 * Traverse the memory graph starting from a single seed memory
 */
async function traverseFromSeed(
  seedId: string,
  opts: Required<TraversalOptions>
): Promise<GraphNeighborhood | null> {
  // Get seed memory
  const seedResult = await pool.query<Memory>(
    `SELECT id, content, source, created_at, salience_score
     FROM memories WHERE id = $1`,
    [seedId]
  );

  if (seedResult.rows.length === 0) return null;

  const seedMem = seedResult.rows[0]!;
  const seed: GraphNode = {
    id: seedMem.id,
    kind: 'memory',
    content: seedMem.content,
    created_at: seedMem.created_at,
    score: 1.0,
    salience: seedMem.salience_score,
    source: seedMem.source,
  };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const visited = new Set<string>([seedId]);

  // BFS traversal
  let frontier: Array<{ id: string; depth: number }> = [{ id: seedId, depth: 0 }];

  while (frontier.length > 0 && nodes.length < opts.maxNodes) {
    const nextFrontier: Array<{ id: string; depth: number }> = [];

    for (const { id, depth } of frontier) {
      if (depth >= opts.maxDepth) continue;

      // Get neighbors via each edge type
      if (opts.edgeTypes.includes('SIMILAR')) {
        const similarNeighbors = await getSimilarNeighbors(id, opts.minWeight, opts.minSalience);
        for (const neighbor of similarNeighbors) {
          if (!visited.has(neighbor.id) && nodes.length < opts.maxNodes) {
            visited.add(neighbor.id);
            nodes.push(neighbor.node);
            edges.push(neighbor.edge);
            nextFrontier.push({ id: neighbor.id, depth: depth + 1 });
          }
        }
      }

      if (opts.edgeTypes.includes('ENTITY')) {
        const entityNeighbors = await getEntityNeighbors(id, opts.minWeight, opts.minSalience);
        for (const neighbor of entityNeighbors) {
          if (!visited.has(neighbor.id) && nodes.length < opts.maxNodes) {
            visited.add(neighbor.id);
            nodes.push(neighbor.node);
            edges.push(neighbor.edge);
            nextFrontier.push({ id: neighbor.id, depth: depth + 1 });
          }
        }
      }

      if (opts.edgeTypes.includes('SUMMARY')) {
        const summaryNeighbors = await getSummaryNeighbors(id, opts.minWeight);
        for (const neighbor of summaryNeighbors) {
          if (!visited.has(neighbor.id) && nodes.length < opts.maxNodes) {
            visited.add(neighbor.id);
            nodes.push(neighbor.node);
            edges.push(neighbor.edge);
            // Don't add summaries to frontier - they're leaf nodes
          }
        }
      }
    }

    frontier = nextFrontier;
  }

  return { seed, nodes, edges };
}

// === EDGE TYPE SPECIFIC QUERIES ===

interface NeighborResult {
  id: string;
  node: GraphNode;
  edge: GraphEdge;
}

/**
 * Get memories connected via SIMILAR edges (memory_edges table)
 */
async function getSimilarNeighbors(
  memoryId: string,
  minWeight: number,
  minSalience: number
): Promise<NeighborResult[]> {
  const result = await pool.query<Memory & { edge_weight: number; edge_similarity: number }>(
    `SELECT DISTINCT ON (m.id)
       m.id, m.content, m.source, m.created_at, m.salience_score,
       e.weight as edge_weight,
       e.similarity as edge_similarity
     FROM memory_edges e
     JOIN memories m ON (
       CASE WHEN e.source_memory_id = $1 THEN e.target_memory_id ELSE e.source_memory_id END = m.id
     )
     WHERE (e.source_memory_id = $1 OR e.target_memory_id = $1)
       AND e.edge_type = 'SIMILAR'
       AND e.weight >= $2
       AND m.salience_score >= $3
     ORDER BY m.id, e.weight DESC
     LIMIT 15`,
    [memoryId, minWeight, minSalience]
  );

  return result.rows.map((row) => ({
    id: row.id,
    node: {
      id: row.id,
      kind: 'memory' as const,
      content: row.content,
      created_at: row.created_at,
      score: row.edge_weight,
      salience: row.salience_score,
      source: row.source,
    },
    edge: {
      source_id: memoryId,
      target_id: row.id,
      edge_type: 'SIMILAR' as const,
      weight: row.edge_weight,
    },
  }));
}

/**
 * Get memories connected via shared entities (entity_mentions table)
 */
async function getEntityNeighbors(
  memoryId: string,
  _minWeight: number, // API consistency with other neighbor functions
  minSalience: number
): Promise<NeighborResult[]> {
  const result = await pool.query<Memory & { entity_name: string; shared_entity_count: number }>(
    `WITH memory_entities AS (
       SELECT entity_id FROM entity_mentions WHERE memory_id = $1
     )
     SELECT DISTINCT ON (m.id)
       m.id, m.content, m.source, m.created_at, m.salience_score,
       e.name as entity_name,
       COUNT(*) OVER (PARTITION BY m.id) as shared_entity_count
     FROM memories m
     JOIN entity_mentions em ON em.memory_id = m.id
     JOIN entities e ON e.id = em.entity_id
     WHERE em.entity_id IN (SELECT entity_id FROM memory_entities)
       AND m.id != $1
       AND m.salience_score >= $2
       AND e.entity_type IN ('person', 'project', 'organization')
     ORDER BY m.id, m.salience_score DESC
     LIMIT 10`,
    [memoryId, minSalience]
  );

  return result.rows.map((row) => ({
    id: row.id,
    node: {
      id: row.id,
      kind: 'memory' as const,
      content: row.content,
      created_at: row.created_at,
      score: Math.min(row.shared_entity_count / 3, 1.0),
      salience: row.salience_score,
      source: row.source,
    },
    edge: {
      source_id: memoryId,
      target_id: row.id,
      edge_type: 'ENTITY' as const,
      weight: Math.min(row.shared_entity_count / 3, 1.0),
      via: row.entity_name,
    },
  }));
}

/**
 * Get living summaries linked to this memory
 */
async function getSummaryNeighbors(
  memoryId: string,
  minWeight: number
): Promise<NeighborResult[]> {
  const result = await pool.query<{
    id: string;
    category: string;
    content: string;
    relevance_score: number;
    updated_at: Date;
  }>(
    `SELECT
       ls.id, ls.category, ls.content, msl.relevance_score,
       ls.last_updated_at as updated_at
     FROM memory_summary_links msl
     JOIN living_summaries ls ON ls.category = msl.summary_category
     WHERE msl.memory_id = $1
       AND msl.relevance_score >= $2
       AND ls.content IS NOT NULL
       AND ls.content != ''
     ORDER BY msl.relevance_score DESC
     LIMIT 5`,
    [memoryId, minWeight]
  );

  return result.rows.map((row) => ({
    id: row.id,
    node: {
      id: row.id,
      kind: 'summary' as const,
      content: row.content,
      created_at: row.updated_at,
      score: row.relevance_score,
    },
    edge: {
      source_id: memoryId,
      target_id: row.id,
      edge_type: 'SUMMARY' as const,
      weight: row.relevance_score,
      via: row.category,
    },
  }));
}

// === UTILITY: FLATTEN NEIGHBORHOODS TO EVIDENCE ===

/**
 * Flatten multiple neighborhoods into a single deduplicated node list
 * Weighted by neighborhood depth and edge weight
 */
export function flattenNeighborhoods(neighborhoods: GraphNeighborhood[]): GraphNode[] {
  const nodeMap = new Map<string, GraphNode>();

  for (const neighborhood of neighborhoods) {
    // Add seed with highest priority
    const existing = nodeMap.get(neighborhood.seed.id);
    if (!existing || neighborhood.seed.score > existing.score) {
      nodeMap.set(neighborhood.seed.id, neighborhood.seed);
    }

    // Add neighborhood nodes
    for (const node of neighborhood.nodes) {
      const existing = nodeMap.get(node.id);
      if (!existing || node.score > existing.score) {
        nodeMap.set(node.id, node);
      }
    }
  }

  return Array.from(nodeMap.values())
    .sort((a, b) => b.score - a.score);
}

