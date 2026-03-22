/**
 * Graph Traversal Service
 *
 * Slice 7E: Multi-hop relationship queries and path finding
 *
 * Graph Structure:
 * - Nodes: memories, entities
 * - Edges: memory_edges (memory↔memory), entity_mentions (entity↔memory)
 *
 * Query Patterns:
 * 1. Entity Neighbors - entities appearing in same memories
 * 2. Path Finding - shortest path between entities or memories
 * 3. Entity Network - full subgraph around an entity
 * 4. Multi-hop Traversal - N-hop exploration from any node
 * 5. Shared Memories - memories connecting two entities
 */

import { pool } from '../db/pool.js';
import { Entity } from './entities.js';
import { Memory } from './memories.js';
import { EdgeType } from './edges.js';

// =============================================================================
// TYPES
// =============================================================================

export type NodeType = 'memory' | 'entity';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;          // Display name
  attributes: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;           // SIMILAR, MENTIONS, etc.
  weight: number;
  attributes: Record<string, unknown>;
}

export interface Subgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PathSegment {
  node: GraphNode;
  edge: GraphEdge | null;  // null for starting node
  depth: number;
}

export interface EntityNeighbor {
  entity: Entity;
  sharedMemoryCount: number;
  connectionStrength: number;  // normalized 0-1
  sharedMemoryIds: string[];
}

export interface MemoryNeighbor {
  memory: Memory;
  connectionType: 'edge' | 'entity';  // connected via edge or shared entity
  strength: number;
  viaEntityId?: string;
  viaEdgeType?: EdgeType;
}

// =============================================================================
// ENTITY NEIGHBOR QUERIES
// =============================================================================

/**
 * Find entities that co-occur with a given entity in memories
 * "Who appears in the same memories as Sarah?"
 */
export async function findEntityNeighbors(
  entityId: string,
  options: {
    limit?: number;
    minSharedMemories?: number;
    entityType?: string;
  } = {}
): Promise<EntityNeighbor[]> {
  const { limit = 20, minSharedMemories = 1, entityType } = options;

  let query = `
    WITH entity_memories AS (
      SELECT memory_id FROM entity_mentions WHERE entity_id = $1
    ),
    co_occurrences AS (
      SELECT
        e.id,
        e.name,
        e.canonical_name,
        e.entity_type,
        e.mention_count,
        e.aliases,
        e.description,
        e.attributes,
        e.first_seen_at,
        e.last_seen_at,
        e.extraction_method,
        e.confidence,
        e.is_merged,
        e.merged_into_id,
        e.created_at,
        e.updated_at,
        COUNT(DISTINCT em.memory_id) as shared_count,
        ARRAY_AGG(DISTINCT em.memory_id) as shared_memory_ids
      FROM entities e
      JOIN entity_mentions em ON em.entity_id = e.id
      WHERE em.memory_id IN (SELECT memory_id FROM entity_memories)
        AND e.id != $1
        AND e.is_merged = FALSE
  `;

  const params: (string | number)[] = [entityId];
  let paramIndex = 2;

  if (entityType) {
    query += ` AND e.entity_type = $${paramIndex}`;
    params.push(entityType);
    paramIndex++;
  }

  query += `
      GROUP BY e.id, e.name, e.canonical_name, e.entity_type, e.mention_count,
               e.aliases, e.description, e.attributes, e.first_seen_at, e.last_seen_at,
               e.extraction_method, e.confidence, e.is_merged, e.merged_into_id,
               e.created_at, e.updated_at
      HAVING COUNT(DISTINCT em.memory_id) >= $${paramIndex}
    )
    SELECT *,
           shared_count::float / GREATEST(
             (SELECT COUNT(*) FROM entity_memories), 1
           ) as connection_strength
    FROM co_occurrences
    ORDER BY shared_count DESC, connection_strength DESC
    LIMIT $${paramIndex + 1}
  `;
  params.push(minSharedMemories, limit);

  const result = await pool.query(query, params);

  return result.rows.map((row) => ({
    entity: {
      id: row.id,
      name: row.name,
      canonical_name: row.canonical_name,
      entity_type: row.entity_type,
      aliases: row.aliases || [],
      description: row.description,
      attributes: row.attributes || {},
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at,
      mention_count: row.mention_count,
      extraction_method: row.extraction_method,
      confidence: row.confidence,
      is_merged: row.is_merged,
      merged_into_id: row.merged_into_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    } as Entity,
    sharedMemoryCount: parseInt(row.shared_count, 10),
    connectionStrength: parseFloat(row.connection_strength),
    sharedMemoryIds: row.shared_memory_ids,
  }));
}

/**
 * Find memories shared between two entities
 * "What memories mention both Sarah and the Quantum project?"
 */
export async function findSharedMemories(
  entityId1: string,
  entityId2: string,
  options: { limit?: number } = {}
): Promise<Memory[]> {
  const { limit = 20 } = options;

  const result = await pool.query(
    `SELECT DISTINCT m.*
     FROM memories m
     JOIN entity_mentions em1 ON em1.memory_id = m.id AND em1.entity_id = $1
     JOIN entity_mentions em2 ON em2.memory_id = m.id AND em2.entity_id = $2
     ORDER BY m.salience_score DESC, m.created_at DESC
     LIMIT $3`,
    [entityId1, entityId2, limit]
  );

  return result.rows as Memory[];
}

// =============================================================================
// MULTI-HOP TRAVERSAL
// =============================================================================

/**
 * Multi-hop entity traversal via shared memories
 * Finds entities connected within N hops through memory co-occurrence
 *
 * Hop definition: A → memory → B is 1 hop
 */
export async function traverseEntities(
  startEntityId: string,
  options: {
    maxHops?: number;
    limit?: number;
    minStrength?: number;
  } = {}
): Promise<Array<{ entity: Entity; hops: number; pathStrength: number }>> {
  const { maxHops = 2, limit = 50, minStrength = 0.1 } = options;

  const result = await pool.query(
    `WITH RECURSIVE entity_graph AS (
       -- Start with the seed entity
       SELECT
         $1::uuid as entity_id,
         0 as hops,
         1.0::float as path_strength,
         ARRAY[$1::uuid] as path

       UNION ALL

       -- Find entities connected via shared memories
       SELECT DISTINCT ON (e.id)
         e.id as entity_id,
         eg.hops + 1 as hops,
         eg.path_strength * (
           COUNT(*) OVER (PARTITION BY e.id)::float /
           GREATEST((SELECT COUNT(*) FROM entity_mentions WHERE entity_id = eg.entity_id), 1)
         ) as path_strength,
         eg.path || e.id as path
       FROM entity_graph eg
       JOIN entity_mentions em1 ON em1.entity_id = eg.entity_id
       JOIN entity_mentions em2 ON em2.memory_id = em1.memory_id AND em2.entity_id != eg.entity_id
       JOIN entities e ON e.id = em2.entity_id AND e.is_merged = FALSE
       WHERE eg.hops < $2
         AND NOT (e.id = ANY(eg.path))  -- Avoid cycles
     )
     SELECT DISTINCT ON (eg.entity_id)
       e.*,
       eg.hops,
       eg.path_strength
     FROM entity_graph eg
     JOIN entities e ON e.id = eg.entity_id
     WHERE eg.entity_id != $1
       AND eg.path_strength >= $3
     ORDER BY eg.entity_id, eg.hops ASC, eg.path_strength DESC
     LIMIT $4`,
    [startEntityId, maxHops, minStrength, limit]
  );

  return result.rows.map((row) => ({
    entity: {
      id: row.id,
      name: row.name,
      canonical_name: row.canonical_name,
      entity_type: row.entity_type,
      aliases: row.aliases || [],
      description: row.description,
      attributes: row.attributes || {},
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at,
      mention_count: row.mention_count,
      extraction_method: row.extraction_method,
      confidence: row.confidence,
      is_merged: row.is_merged,
      merged_into_id: row.merged_into_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    } as Entity,
    hops: row.hops,
    pathStrength: row.path_strength,
  }));
}

/**
 * Multi-hop memory traversal via edges
 * Extends the existing findConnectedCluster with more options
 */
export async function traverseMemories(
  startMemoryId: string,
  options: {
    maxHops?: number;
    edgeTypes?: EdgeType[];
    minWeight?: number;
    limit?: number;
  } = {}
): Promise<Array<{ memory: Memory; hops: number; pathWeight: number }>> {
  const {
    maxHops = 2,
    edgeTypes = ['SIMILAR'],
    minWeight = 0.3,
    limit = 30,
  } = options;

  const edgeTypesArray = `ARRAY[${edgeTypes.map((t) => `'${t}'`).join(',')}]::varchar[]`;

  const result = await pool.query(
    `WITH RECURSIVE memory_graph AS (
       -- Start with the seed memory
       SELECT
         $1::uuid as memory_id,
         0 as hops,
         1.0::float as path_weight,
         ARRAY[$1::uuid] as path

       UNION ALL

       -- Find connected memories via edges
       SELECT
         CASE
           WHEN e.source_memory_id = mg.memory_id THEN e.target_memory_id
           ELSE e.source_memory_id
         END as memory_id,
         mg.hops + 1 as hops,
         mg.path_weight * e.weight as path_weight,
         mg.path || CASE
           WHEN e.source_memory_id = mg.memory_id THEN e.target_memory_id
           ELSE e.source_memory_id
         END as path
       FROM memory_graph mg
       JOIN memory_edges e ON (
         e.source_memory_id = mg.memory_id OR e.target_memory_id = mg.memory_id
       )
       WHERE mg.hops < $2
         AND e.edge_type = ANY(${edgeTypesArray})
         AND e.weight >= $3
         AND NOT (
           CASE
             WHEN e.source_memory_id = mg.memory_id THEN e.target_memory_id
             ELSE e.source_memory_id
           END = ANY(mg.path)
         )
     )
     SELECT DISTINCT ON (mg.memory_id)
       m.*,
       mg.hops,
       mg.path_weight
     FROM memory_graph mg
     JOIN memories m ON m.id = mg.memory_id
     WHERE mg.memory_id != $1
     ORDER BY mg.memory_id, mg.hops ASC, mg.path_weight DESC
     LIMIT $4`,
    [startMemoryId, maxHops, minWeight, limit]
  );

  return result.rows.map((row) => ({
    memory: row as Memory,
    hops: row.hops,
    pathWeight: row.path_weight,
  }));
}

// =============================================================================
// PATH FINDING
// =============================================================================

/**
 * Find shortest path between two entities via memory co-occurrence
 * Returns the path of entities connecting them
 */
export async function findPathBetweenEntities(
  startEntityId: string,
  endEntityId: string,
  options: { maxHops?: number } = {}
): Promise<{
  found: boolean;
  path: Entity[];
  connectingMemories: Memory[][];
} | null> {
  const { maxHops = 4 } = options;

  const result = await pool.query(
    `WITH RECURSIVE entity_path AS (
       -- Start from source
       SELECT
         $1::uuid as current_id,
         ARRAY[$1::uuid] as path,
         ARRAY[]::uuid[] as memory_path,
         0 as depth

       UNION ALL

       -- Expand to neighbors
       SELECT DISTINCT ON (e.id)
         e.id as current_id,
         ep.path || e.id as path,
         ep.memory_path || em1.memory_id as memory_path,
         ep.depth + 1 as depth
       FROM entity_path ep
       JOIN entity_mentions em1 ON em1.entity_id = ep.current_id
       JOIN entity_mentions em2 ON em2.memory_id = em1.memory_id AND em2.entity_id != ep.current_id
       JOIN entities e ON e.id = em2.entity_id AND e.is_merged = FALSE
       WHERE ep.depth < $3
         AND NOT (e.id = ANY(ep.path))
     )
     SELECT path, memory_path
     FROM entity_path
     WHERE current_id = $2
     ORDER BY depth ASC
     LIMIT 1`,
    [startEntityId, endEntityId, maxHops]
  );

  if (result.rows.length === 0) {
    return { found: false, path: [], connectingMemories: [] };
  }

  const row = result.rows[0];
  const pathIds: string[] = row.path;
  const memoryPathIds: string[] = row.memory_path;

  // Fetch full entity objects
  const entitiesResult = await pool.query(
    `SELECT * FROM entities WHERE id = ANY($1) AND is_merged = FALSE`,
    [pathIds]
  );

  // Sort entities by path order
  const entityMap = new Map<string, Entity>();
  for (const e of entitiesResult.rows) {
    entityMap.set(e.id, e as Entity);
  }
  const orderedEntities = pathIds
    .map((id) => entityMap.get(id))
    .filter((e): e is Entity => e !== undefined);

  // Fetch connecting memories (grouped by hop)
  const memoriesResult = await pool.query(
    `SELECT * FROM memories WHERE id = ANY($1)`,
    [memoryPathIds]
  );
  const memoryMap = new Map<string, Memory>();
  for (const m of memoriesResult.rows) {
    memoryMap.set(m.id, m as Memory);
  }

  // Group memories by hop
  const connectingMemories: Memory[][] = [];
  for (const memId of memoryPathIds) {
    const mem = memoryMap.get(memId);
    if (mem) {
      connectingMemories.push([mem]);
    }
  }

  return {
    found: true,
    path: orderedEntities,
    connectingMemories,
  };
}

/**
 * Find shortest path between two memories via edges
 */
export async function findPathBetweenMemories(
  startMemoryId: string,
  endMemoryId: string,
  options: {
    maxHops?: number;
    edgeTypes?: EdgeType[];
  } = {}
): Promise<{
  found: boolean;
  path: Memory[];
  edges: Array<{ type: EdgeType; weight: number }>;
} | null> {
  const { maxHops = 5, edgeTypes = ['SIMILAR'] } = options;
  const edgeTypesArray = `ARRAY[${edgeTypes.map((t) => `'${t}'`).join(',')}]::varchar[]`;

  const result = await pool.query(
    `WITH RECURSIVE memory_path AS (
       SELECT
         $1::uuid as current_id,
         ARRAY[$1::uuid] as path,
         ARRAY[]::jsonb as edge_info,
         0 as depth

       UNION ALL

       SELECT
         CASE
           WHEN e.source_memory_id = mp.current_id THEN e.target_memory_id
           ELSE e.source_memory_id
         END as current_id,
         mp.path || CASE
           WHEN e.source_memory_id = mp.current_id THEN e.target_memory_id
           ELSE e.source_memory_id
         END as path,
         mp.edge_info || jsonb_build_object('type', e.edge_type, 'weight', e.weight) as edge_info,
         mp.depth + 1 as depth
       FROM memory_path mp
       JOIN memory_edges e ON (
         e.source_memory_id = mp.current_id OR e.target_memory_id = mp.current_id
       )
       WHERE mp.depth < $3
         AND e.edge_type = ANY(${edgeTypesArray})
         AND NOT (
           CASE
             WHEN e.source_memory_id = mp.current_id THEN e.target_memory_id
             ELSE e.source_memory_id
           END = ANY(mp.path)
         )
     )
     SELECT path, edge_info
     FROM memory_path
     WHERE current_id = $2
     ORDER BY depth ASC
     LIMIT 1`,
    [startMemoryId, endMemoryId, maxHops]
  );

  if (result.rows.length === 0) {
    return { found: false, path: [], edges: [] };
  }

  const row = result.rows[0];
  const pathIds: string[] = row.path;
  const edgeInfo: Array<{ type: EdgeType; weight: number }> = row.edge_info;

  // Fetch full memory objects
  const memoriesResult = await pool.query(
    `SELECT * FROM memories WHERE id = ANY($1)`,
    [pathIds]
  );

  const memoryMap = new Map<string, Memory>();
  for (const m of memoriesResult.rows) {
    memoryMap.set(m.id, m as Memory);
  }

  const orderedMemories = pathIds
    .map((id) => memoryMap.get(id))
    .filter((m): m is Memory => m !== undefined);

  return {
    found: true,
    path: orderedMemories,
    edges: edgeInfo,
  };
}

// =============================================================================
// SUBGRAPH EXTRACTION
// =============================================================================

/**
 * Extract the local subgraph around an entity
 * Includes the entity, its memories, and connected entities
 */
export async function getEntitySubgraph(
  entityId: string,
  options: {
    memoryLimit?: number;
    entityLimit?: number;
    includeEdges?: boolean;
  } = {}
): Promise<Subgraph> {
  const { memoryLimit = 20, entityLimit = 10, includeEdges = true } = options;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Get the center entity
  const entityResult = await pool.query(
    `SELECT * FROM entities WHERE id = $1 AND is_merged = FALSE`,
    [entityId]
  );

  if (entityResult.rows.length === 0) {
    return { nodes: [], edges: [] };
  }

  const centerEntity = entityResult.rows[0] as Entity;
  nodes.push({
    id: centerEntity.id,
    type: 'entity',
    label: centerEntity.name,
    attributes: {
      entity_type: centerEntity.entity_type,
      mention_count: centerEntity.mention_count,
    },
  });

  // Get memories mentioning this entity
  const memoriesResult = await pool.query(
    `SELECT m.*, em.mention_text
     FROM memories m
     JOIN entity_mentions em ON em.memory_id = m.id
     WHERE em.entity_id = $1
     ORDER BY m.salience_score DESC
     LIMIT $2`,
    [entityId, memoryLimit]
  );

  for (const row of memoriesResult.rows) {
    const memory = row as Memory & { mention_text: string };
    nodes.push({
      id: memory.id,
      type: 'memory',
      label: memory.content.slice(0, 50) + '...',
      attributes: {
        salience: memory.salience_score,
        created_at: memory.created_at,
      },
    });

    edges.push({
      source: entityId,
      target: memory.id,
      type: 'MENTIONS',
      weight: 1.0,
      attributes: { mention_text: row.mention_text },
    });
  }

  // Get connected entities
  const neighbors = await findEntityNeighbors(entityId, { limit: entityLimit });

  for (const neighbor of neighbors) {
    nodes.push({
      id: neighbor.entity.id,
      type: 'entity',
      label: neighbor.entity.name,
      attributes: {
        entity_type: neighbor.entity.entity_type,
        shared_memories: neighbor.sharedMemoryCount,
      },
    });

    edges.push({
      source: entityId,
      target: neighbor.entity.id,
      type: 'CO_OCCURS',
      weight: neighbor.connectionStrength,
      attributes: { shared_memory_ids: neighbor.sharedMemoryIds },
    });
  }

  // Optionally include memory edges
  if (includeEdges) {
    const memoryIds = memoriesResult.rows.map((r) => r.id);
    if (memoryIds.length > 0) {
      const edgesResult = await pool.query(
        `SELECT * FROM memory_edges
         WHERE source_memory_id = ANY($1) AND target_memory_id = ANY($1)`,
        [memoryIds]
      );

      for (const edge of edgesResult.rows) {
        edges.push({
          source: edge.source_memory_id,
          target: edge.target_memory_id,
          type: edge.edge_type,
          weight: edge.weight,
          attributes: { similarity: edge.similarity },
        });
      }
    }
  }

  // Filter edges to only include nodes that exist in the subgraph
  // (prevents d3-force crash when edges reference missing nodes)
  const nodeIds = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  return { nodes, edges: validEdges };
}

/**
 * Extract the local subgraph around a memory
 * Includes related memories via edges and mentioned entities
 */
export async function getMemorySubgraph(
  memoryId: string,
  options: {
    maxHops?: number;
    includeEntities?: boolean;
  } = {}
): Promise<Subgraph> {
  const { maxHops = 1, includeEntities = true } = options;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Get the center memory
  const memoryResult = await pool.query(
    `SELECT * FROM memories WHERE id = $1`,
    [memoryId]
  );

  if (memoryResult.rows.length === 0) {
    return { nodes: [], edges: [] };
  }

  const centerMemory = memoryResult.rows[0] as Memory;
  nodes.push({
    id: centerMemory.id,
    type: 'memory',
    label: centerMemory.content.slice(0, 50) + '...',
    attributes: {
      salience: centerMemory.salience_score,
      created_at: centerMemory.created_at,
      strength: centerMemory.current_strength,
    },
  });

  // Get connected memories
  const connected = await traverseMemories(memoryId, { maxHops, limit: 20 });

  for (const conn of connected) {
    nodes.push({
      id: conn.memory.id,
      type: 'memory',
      label: conn.memory.content.slice(0, 50) + '...',
      attributes: {
        salience: conn.memory.salience_score,
        hops: conn.hops,
        path_weight: conn.pathWeight,
      },
    });
  }

  // Get edges between all these memories
  const allMemoryIds = [memoryId, ...connected.map((c) => c.memory.id)];
  const edgesResult = await pool.query(
    `SELECT * FROM memory_edges
     WHERE source_memory_id = ANY($1) OR target_memory_id = ANY($1)`,
    [allMemoryIds]
  );

  const seenEdges = new Set<string>();
  for (const edge of edgesResult.rows) {
    const edgeKey = [edge.source_memory_id, edge.target_memory_id].sort().join('-');
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);

    // Only include if both ends are in our node set
    if (
      allMemoryIds.includes(edge.source_memory_id) &&
      allMemoryIds.includes(edge.target_memory_id)
    ) {
      edges.push({
        source: edge.source_memory_id,
        target: edge.target_memory_id,
        type: edge.edge_type,
        weight: edge.weight,
        attributes: { similarity: edge.similarity },
      });
    }
  }

  // Optionally include entities
  if (includeEntities) {
    const entitiesResult = await pool.query(
      `SELECT DISTINCT e.*, em.memory_id
       FROM entities e
       JOIN entity_mentions em ON em.entity_id = e.id
       WHERE em.memory_id = ANY($1) AND e.is_merged = FALSE`,
      [allMemoryIds]
    );

    const entityMemoryMap = new Map<string, string[]>();
    for (const row of entitiesResult.rows) {
      if (!entityMemoryMap.has(row.id)) {
        entityMemoryMap.set(row.id, []);
        nodes.push({
          id: row.id,
          type: 'entity',
          label: row.name,
          attributes: {
            entity_type: row.entity_type,
            mention_count: row.mention_count,
          },
        });
      }
      entityMemoryMap.get(row.id)!.push(row.memory_id);
    }

    // Add MENTIONS edges
    for (const [entityId, memIds] of entityMemoryMap) {
      for (const memId of memIds) {
        edges.push({
          source: entityId,
          target: memId,
          type: 'MENTIONS',
          weight: 1.0,
          attributes: {},
        });
      }
    }
  }

  return { nodes, edges };
}

// =============================================================================
// FULL GRAPH VISUALIZATION
// =============================================================================

export interface VisualizationOptions {
  nodeLimit?: number;      // Max total nodes (default 100)
  entityLimit?: number;    // Max entities to include (default 30)
  memoryLimit?: number;    // Max memories to include (default 70)
  minSalience?: number;    // Minimum salience for memories (default 0)
  entityTypes?: string[];  // Filter to specific entity types
  includeEdges?: boolean;  // Include memory-memory edges (default true)
}

/**
 * Get a full graph visualization with top entities and connected memories
 * Designed for initial overview without requiring entity selection
 */
export async function getFullGraphVisualization(
  options: VisualizationOptions = {}
): Promise<Subgraph> {
  const {
    nodeLimit = 100,
    entityLimit = 30,
    memoryLimit = 70,
    minSalience = 0,
    entityTypes,
    includeEdges = true,
  } = options;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  // 1. Get top entities by mention count
  let entityQuery = `
    SELECT * FROM entities
    WHERE is_merged = FALSE
  `;
  const entityParams: (string | number | string[])[] = [];
  let paramIndex = 1;

  if (entityTypes && entityTypes.length > 0) {
    entityQuery += ` AND entity_type = ANY($${paramIndex}::text[])`;
    entityParams.push(entityTypes);
    paramIndex++;
  }

  entityQuery += ` ORDER BY mention_count DESC LIMIT $${paramIndex}`;
  entityParams.push(entityLimit);

  const entitiesResult = await pool.query(entityQuery, entityParams);

  for (const row of entitiesResult.rows) {
    const entity = row as Entity;
    nodes.push({
      id: entity.id,
      type: 'entity',
      label: entity.name,
      attributes: {
        entity_type: entity.entity_type,
        mention_count: entity.mention_count,
      },
    });
    nodeIds.add(entity.id);
  }

  const entityIds = entitiesResult.rows.map((r) => r.id);

  // 2. Get high-salience memories connected to these entities
  if (entityIds.length > 0) {
    const memoriesResult = await pool.query(
      `SELECT DISTINCT m.*
       FROM memories m
       JOIN entity_mentions em ON em.memory_id = m.id
       WHERE em.entity_id = ANY($1)
         AND m.salience_score >= $2
       ORDER BY m.salience_score DESC, m.created_at DESC
       LIMIT $3`,
      [entityIds, minSalience, memoryLimit]
    );

    for (const row of memoriesResult.rows) {
      const memory = row as Memory;
      nodes.push({
        id: memory.id,
        type: 'memory',
        label: memory.content.slice(0, 50) + '...',
        attributes: {
          salience: memory.salience_score,
          created_at: memory.created_at,
        },
      });
      nodeIds.add(memory.id);
    }

    const memoryIds = memoriesResult.rows.map((r) => r.id);

    // 3. Get entity-memory MENTIONS edges
    if (memoryIds.length > 0) {
      const mentionsResult = await pool.query(
        `SELECT entity_id, memory_id, mention_text
         FROM entity_mentions
         WHERE entity_id = ANY($1) AND memory_id = ANY($2)`,
        [entityIds, memoryIds]
      );

      for (const row of mentionsResult.rows) {
        edges.push({
          source: row.entity_id,
          target: row.memory_id,
          type: 'MENTIONS',
          weight: 1.0,
          attributes: { mention_text: row.mention_text },
        });
      }

      // 4. Optionally get memory-memory edges (SIMILAR, etc.)
      if (includeEdges && memoryIds.length > 1) {
        const memoryEdgesResult = await pool.query(
          `SELECT * FROM memory_edges
           WHERE source_memory_id = ANY($1) AND target_memory_id = ANY($1)`,
          [memoryIds]
        );

        for (const edge of memoryEdgesResult.rows) {
          edges.push({
            source: edge.source_memory_id,
            target: edge.target_memory_id,
            type: edge.edge_type,
            weight: edge.weight,
            attributes: { similarity: edge.similarity },
          });
        }
      }
    }

    // 5. Add CO_OCCURS edges between entities that share ANY memory (not just visualized ones)
    // Query database directly to find entity pairs that co-occur in the same memories
    const visualizedEntityIds = nodes.filter((n) => n.type === 'entity').map((n) => n.id);

    if (visualizedEntityIds.length > 1) {
      const cooccursResult = await pool.query(
        `SELECT
           em1.entity_id as entity1,
           em2.entity_id as entity2,
           COUNT(DISTINCT em1.memory_id) as shared_count
         FROM entity_mentions em1
         JOIN entity_mentions em2 ON em1.memory_id = em2.memory_id
         WHERE em1.entity_id = ANY($1)
           AND em2.entity_id = ANY($1)
           AND em1.entity_id < em2.entity_id
         GROUP BY em1.entity_id, em2.entity_id
         HAVING COUNT(DISTINCT em1.memory_id) > 0`,
        [visualizedEntityIds]
      );

      for (const row of cooccursResult.rows) {
        edges.push({
          source: row.entity1,
          target: row.entity2,
          type: 'CO_OCCURS',
          weight: Math.min(row.shared_count / 5, 1),
          attributes: { shared_memory_count: parseInt(row.shared_count) },
        });
      }
    }
  }

  // Limit total nodes if exceeded
  if (nodes.length > nodeLimit) {
    // Keep all entities, trim memories
    const entityNodes = nodes.filter((n) => n.type === 'entity');
    const memoryNodes = nodes.filter((n) => n.type === 'memory');
    const keptMemories = memoryNodes.slice(0, nodeLimit - entityNodes.length);

    // Filter edges to only include kept nodes
    const keptNodeIds = new Set([
      ...entityNodes.map((n) => n.id),
      ...keptMemories.map((n) => n.id),
    ]);

    return {
      nodes: [...entityNodes, ...keptMemories],
      edges: edges.filter(
        (e) => keptNodeIds.has(e.source) && keptNodeIds.has(e.target)
      ),
    };
  }

  return { nodes, edges };
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Get graph statistics
 */
export async function getGraphStats(): Promise<{
  nodeCount: { memories: number; entities: number };
  edgeCount: { memoryEdges: number; mentions: number };
  averageDegree: { memories: number; entities: number };
  components: number;
}> {
  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM memories) as memory_count,
      (SELECT COUNT(*) FROM entities WHERE is_merged = FALSE) as entity_count,
      (SELECT COUNT(*) FROM memory_edges) as edge_count,
      (SELECT COUNT(*) FROM entity_mentions) as mention_count
  `);

  const row = stats.rows[0];
  const memoryCount = parseInt(row.memory_count, 10);
  const entityCount = parseInt(row.entity_count, 10);
  const edgeCount = parseInt(row.edge_count, 10);
  const mentionCount = parseInt(row.mention_count, 10);

  // Calculate average degrees
  const avgMemoryDegree = memoryCount > 0 ? (edgeCount * 2) / memoryCount : 0;
  const avgEntityDegree = entityCount > 0 ? mentionCount / entityCount : 0;

  // Count weakly connected components (simplified - just count isolated memories)
  const isolatedResult = await pool.query(`
    SELECT COUNT(*) as isolated
    FROM memories m
    WHERE NOT EXISTS (
      SELECT 1 FROM memory_edges e
      WHERE e.source_memory_id = m.id OR e.target_memory_id = m.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM entity_mentions em WHERE em.memory_id = m.id
    )
  `);

  const isolated = parseInt(isolatedResult.rows[0].isolated, 10);
  const connected = memoryCount - isolated;

  return {
    nodeCount: {
      memories: memoryCount,
      entities: entityCount,
    },
    edgeCount: {
      memoryEdges: edgeCount,
      mentions: mentionCount,
    },
    averageDegree: {
      memories: Math.round(avgMemoryDegree * 100) / 100,
      entities: Math.round(avgEntityDegree * 100) / 100,
    },
    components: connected > 0 ? 1 + isolated : isolated,  // Simplified
  };
}
