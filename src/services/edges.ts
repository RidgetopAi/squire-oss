import { pool } from '../db/pool.js';
import { Memory } from './memories.js';

export type EdgeType = 'SIMILAR' | 'FOLLOWS' | 'CONTRADICTS' | 'ELABORATES' | 'RESOLVES';

export interface CreateEdgeInput {
  source_memory_id: string;
  target_memory_id: string;
  edge_type: EdgeType;
  weight?: number;
  similarity?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Create or update an edge between two memories
 * If an edge of the same type already exists, updates weight/similarity
 */
export async function createEdge(input: CreateEdgeInput): Promise<MemoryEdge> {
  const {
    source_memory_id,
    target_memory_id,
    edge_type,
    weight = 1.0,
    similarity,
    metadata = {},
  } = input;

  const result = await pool.query<MemoryEdge>(
    `INSERT INTO memory_edges (source_memory_id, target_memory_id, edge_type, weight, similarity, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_memory_id, target_memory_id, edge_type)
     DO UPDATE SET
       weight = GREATEST(memory_edges.weight, EXCLUDED.weight),
       similarity = COALESCE(EXCLUDED.similarity, memory_edges.similarity),
       metadata = memory_edges.metadata || EXCLUDED.metadata,
       last_reinforced_at = NOW(),
       reinforcement_count = memory_edges.reinforcement_count + 1
     RETURNING *`,
    [
      source_memory_id,
      target_memory_id,
      edge_type,
      weight,
      similarity ?? null,
      JSON.stringify(metadata),
    ]
  );

  const edge = result.rows[0];
  if (!edge) {
    throw new Error('Failed to create edge - no row returned');
  }
  return edge;
}

export interface MemoryEdge {
  id: string;
  source_memory_id: string;
  target_memory_id: string;
  edge_type: EdgeType;
  weight: number;
  similarity: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  last_reinforced_at: Date;
  reinforcement_count: number;
}

export interface RelatedMemory extends Memory {
  edge_type: EdgeType;
  edge_weight: number;
  edge_similarity: number | null;
}

/**
 * Get memories related to a given memory via edges
 * Deduplicates when both A→B and B→A edges exist
 */
export async function getRelatedMemories(
  memoryId: string,
  options: {
    edgeType?: EdgeType;
    minWeight?: number;
    limit?: number;
  } = {}
): Promise<RelatedMemory[]> {
  const { edgeType = 'SIMILAR', minWeight = 0.2, limit = 10 } = options;

  // Use DISTINCT ON to deduplicate when both directions of an edge exist
  const result = await pool.query(
    `SELECT DISTINCT ON (m.id)
       m.*,
       e.edge_type,
       e.weight as edge_weight,
       e.similarity as edge_similarity
     FROM memory_edges e
     JOIN memories m ON (
       CASE
         WHEN e.source_memory_id = $1 THEN e.target_memory_id
         ELSE e.source_memory_id
       END = m.id
     )
     WHERE (e.source_memory_id = $1 OR e.target_memory_id = $1)
       AND e.edge_type = $2
       AND e.weight >= $3
     ORDER BY m.id, e.weight DESC, e.similarity DESC NULLS LAST`,
    [memoryId, edgeType, minWeight]
  );

  // Re-sort by weight/similarity after deduplication and apply limit
  const sorted = (result.rows as RelatedMemory[]).sort((a, b) => {
    if (b.edge_weight !== a.edge_weight) return b.edge_weight - a.edge_weight;
    const aSim = a.edge_similarity ?? 0;
    const bSim = b.edge_similarity ?? 0;
    return bSim - aSim;
  });

  return sorted.slice(0, limit);
}

/**
 * Get edge statistics
 */
export async function getEdgeStats(): Promise<{
  total: number;
  byType: Record<EdgeType, number>;
  averageWeight: number;
  averageSimilarity: number;
}> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      AVG(weight) as avg_weight,
      AVG(similarity) FILTER (WHERE similarity IS NOT NULL) as avg_similarity
    FROM memory_edges
  `);

  const typeResult = await pool.query(`
    SELECT edge_type, COUNT(*) as count
    FROM memory_edges
    GROUP BY edge_type
  `);

  const byType: Record<EdgeType, number> = {
    SIMILAR: 0,
    FOLLOWS: 0,
    CONTRADICTS: 0,
    ELABORATES: 0,
    RESOLVES: 0,
  };

  for (const row of typeResult.rows) {
    byType[row.edge_type as EdgeType] = parseInt(row.count, 10);
  }

  const stats = result.rows[0];
  return {
    total: parseInt(stats.total ?? '0', 10),
    byType,
    averageWeight: parseFloat(stats.avg_weight ?? '1.0'),
    averageSimilarity: parseFloat(stats.avg_similarity ?? '0.0'),
  };
}
