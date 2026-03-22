import { Router, Request, Response } from 'express';
import {
  findEntityNeighbors,
  findSharedMemories,
  traverseEntities,
  traverseMemories,
  findPathBetweenEntities,
  findPathBetweenMemories,
  getEntitySubgraph,
  getMemorySubgraph,
  getGraphStats,
  getFullGraphVisualization,
  type EntityNeighbor,
} from '../../services/graph.js';
import { getEntity } from '../../services/entities.js';
import { EdgeType } from '../../services/edges.js';

const router = Router();

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * GET /api/graph/stats
 * Get graph statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getGraphStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting graph stats:', error);
    res.status(500).json({ error: 'Failed to get graph statistics' });
  }
});

// =============================================================================
// VISUALIZATION
// =============================================================================

/**
 * GET /api/graph/visualization
 * Get full graph visualization data for react-force-graph
 *
 * Query params:
 * - nodeLimit: Max total nodes (default 100)
 * - entityLimit: Max entities (default 30)
 * - memoryLimit: Max memories (default 70)
 * - minSalience: Min memory salience (default 0)
 * - entityTypes: Comma-separated entity types to include
 * - includeEdges: Whether to include memory-memory edges (default true)
 */
router.get('/visualization', async (req: Request, res: Response) => {
  try {
    const nodeLimit = req.query.nodeLimit
      ? parseInt(req.query.nodeLimit as string, 10)
      : 100;
    const entityLimit = req.query.entityLimit
      ? parseInt(req.query.entityLimit as string, 10)
      : 30;
    const memoryLimit = req.query.memoryLimit
      ? parseInt(req.query.memoryLimit as string, 10)
      : 70;
    const minSalience = req.query.minSalience
      ? parseFloat(req.query.minSalience as string)
      : 0;
    const entityTypesParam = req.query.entityTypes as string | undefined;
    const entityTypes = entityTypesParam
      ? entityTypesParam.split(',')
      : undefined;
    const includeEdges = req.query.includeEdges !== 'false';

    const subgraph = await getFullGraphVisualization({
      nodeLimit,
      entityLimit,
      memoryLimit,
      minSalience,
      entityTypes,
      includeEdges,
    });

    res.json({
      nodeCount: subgraph.nodes.length,
      edgeCount: subgraph.edges.length,
      nodes: subgraph.nodes,
      edges: subgraph.edges,
    });
  } catch (error) {
    console.error('Error getting graph visualization:', error);
    res.status(500).json({ error: 'Failed to get graph visualization' });
  }
});

// =============================================================================
// ENTITY NEIGHBOR QUERIES
// =============================================================================

/**
 * GET /api/graph/entities/:id/neighbors
 * Find entities that co-occur with a given entity in memories
 */
router.get('/entities/:id/neighbors', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 20;
    const minShared = req.query.minShared
      ? parseInt(req.query.minShared as string, 10)
      : 1;
    const entityType = req.query.type as string | undefined;

    // Verify entity exists
    const entity = await getEntity(id);
    if (!entity) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    const neighbors = await findEntityNeighbors(id, {
      limit,
      minSharedMemories: minShared,
      entityType,
    });

    res.json({
      entityId: id,
      entityName: entity.name,
      neighborCount: neighbors.length,
      neighbors: neighbors.map((n: EntityNeighbor) => ({
        id: n.entity.id,
        name: n.entity.name,
        type: n.entity.entity_type,
        sharedMemoryCount: n.sharedMemoryCount,
        connectionStrength: n.connectionStrength,
        sharedMemoryIds: n.sharedMemoryIds,
      })),
    });
  } catch (error) {
    console.error('Error finding entity neighbors:', error);
    res.status(500).json({ error: 'Failed to find entity neighbors' });
  }
});

/**
 * GET /api/graph/entities/:id1/shared/:id2
 * Find memories shared between two entities
 */
router.get('/entities/:id1/shared/:id2', async (req: Request, res: Response) => {
  try {
    const id1 = req.params.id1;
    const id2 = req.params.id2;
    if (!id1 || !id2) {
      res.status(400).json({ error: 'Both entity IDs are required' });
      return;
    }

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 20;

    // Verify both entities exist
    const [entity1, entity2] = await Promise.all([
      getEntity(id1),
      getEntity(id2),
    ]);

    if (!entity1 || !entity2) {
      res.status(404).json({
        error: 'One or both entities not found',
        found: { entity1: !!entity1, entity2: !!entity2 },
      });
      return;
    }

    const memories = await findSharedMemories(id1, id2, { limit });

    res.json({
      entity1: { id: entity1.id, name: entity1.name },
      entity2: { id: entity2.id, name: entity2.name },
      sharedMemoryCount: memories.length,
      memories: memories.map((m) => ({
        id: m.id,
        content: m.content,
        salience: m.salience_score,
        createdAt: m.created_at,
      })),
    });
  } catch (error) {
    console.error('Error finding shared memories:', error);
    res.status(500).json({ error: 'Failed to find shared memories' });
  }
});

// =============================================================================
// MULTI-HOP TRAVERSAL
// =============================================================================

/**
 * GET /api/graph/entities/:id/traverse
 * Multi-hop entity traversal via shared memories
 */
router.get('/entities/:id/traverse', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    const maxHops = req.query.hops
      ? parseInt(req.query.hops as string, 10)
      : 2;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 50;
    const minStrength = req.query.minStrength
      ? parseFloat(req.query.minStrength as string)
      : 0.1;

    // Verify entity exists
    const entity = await getEntity(id);
    if (!entity) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    const results = await traverseEntities(id, {
      maxHops,
      limit,
      minStrength,
    });

    res.json({
      startEntity: { id: entity.id, name: entity.name },
      maxHops,
      resultCount: results.length,
      entities: results.map((r) => ({
        id: r.entity.id,
        name: r.entity.name,
        type: r.entity.entity_type,
        hops: r.hops,
        pathStrength: r.pathStrength,
      })),
    });
  } catch (error) {
    console.error('Error traversing entities:', error);
    res.status(500).json({ error: 'Failed to traverse entities' });
  }
});

/**
 * GET /api/graph/memories/:id/traverse
 * Multi-hop memory traversal via edges
 */
router.get('/memories/:id/traverse', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    const maxHops = req.query.hops
      ? parseInt(req.query.hops as string, 10)
      : 2;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 30;
    const minWeight = req.query.minWeight
      ? parseFloat(req.query.minWeight as string)
      : 0.3;
    const edgeTypesParam = req.query.edgeTypes as string | undefined;
    const edgeTypes = edgeTypesParam
      ? (edgeTypesParam.split(',') as EdgeType[])
      : ['SIMILAR' as EdgeType];

    const results = await traverseMemories(id, {
      maxHops,
      edgeTypes,
      minWeight,
      limit,
    });

    res.json({
      startMemoryId: id,
      maxHops,
      edgeTypes,
      resultCount: results.length,
      memories: results.map((r) => ({
        id: r.memory.id,
        content: r.memory.content.slice(0, 100) + '...',
        salience: r.memory.salience_score,
        hops: r.hops,
        pathWeight: r.pathWeight,
      })),
    });
  } catch (error) {
    console.error('Error traversing memories:', error);
    res.status(500).json({ error: 'Failed to traverse memories' });
  }
});

// =============================================================================
// PATH FINDING
// =============================================================================

/**
 * GET /api/graph/path/entities/:start/:end
 * Find shortest path between two entities
 */
router.get('/path/entities/:start/:end', async (req: Request, res: Response) => {
  try {
    const start = req.params.start;
    const end = req.params.end;
    if (!start || !end) {
      res.status(400).json({ error: 'Both start and end entity IDs are required' });
      return;
    }

    const maxHops = req.query.maxHops
      ? parseInt(req.query.maxHops as string, 10)
      : 4;

    // Verify both entities exist
    const [startEntity, endEntity] = await Promise.all([
      getEntity(start),
      getEntity(end),
    ]);

    if (!startEntity || !endEntity) {
      res.status(404).json({
        error: 'One or both entities not found',
        found: { start: !!startEntity, end: !!endEntity },
      });
      return;
    }

    const result = await findPathBetweenEntities(start, end, { maxHops });

    if (!result || !result.found) {
      res.json({
        found: false,
        start: { id: startEntity.id, name: startEntity.name },
        end: { id: endEntity.id, name: endEntity.name },
        message: `No path found within ${maxHops} hops`,
      });
      return;
    }

    res.json({
      found: true,
      pathLength: result.path.length,
      path: result.path.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.entity_type,
      })),
      connectingMemories: result.connectingMemories.map((mems) =>
        mems.map((m) => ({
          id: m.id,
          content: m.content.slice(0, 100) + '...',
        }))
      ),
    });
  } catch (error) {
    console.error('Error finding path between entities:', error);
    res.status(500).json({ error: 'Failed to find path' });
  }
});

/**
 * GET /api/graph/path/memories/:start/:end
 * Find shortest path between two memories
 */
router.get('/path/memories/:start/:end', async (req: Request, res: Response) => {
  try {
    const start = req.params.start;
    const end = req.params.end;
    if (!start || !end) {
      res.status(400).json({ error: 'Both start and end memory IDs are required' });
      return;
    }

    const maxHops = req.query.maxHops
      ? parseInt(req.query.maxHops as string, 10)
      : 5;
    const edgeTypesParam = req.query.edgeTypes as string | undefined;
    const edgeTypes = edgeTypesParam
      ? (edgeTypesParam.split(',') as EdgeType[])
      : ['SIMILAR' as EdgeType];

    const result = await findPathBetweenMemories(start, end, {
      maxHops,
      edgeTypes,
    });

    if (!result || !result.found) {
      res.json({
        found: false,
        startMemoryId: start,
        endMemoryId: end,
        message: `No path found within ${maxHops} hops`,
      });
      return;
    }

    res.json({
      found: true,
      pathLength: result.path.length,
      path: result.path.map((m) => ({
        id: m.id,
        content: m.content.slice(0, 100) + '...',
        salience: m.salience_score,
      })),
      edges: result.edges,
    });
  } catch (error) {
    console.error('Error finding path between memories:', error);
    res.status(500).json({ error: 'Failed to find path' });
  }
});

// =============================================================================
// SUBGRAPH EXTRACTION
// =============================================================================

/**
 * GET /api/graph/entities/:id/subgraph
 * Get the local subgraph around an entity
 */
router.get('/entities/:id/subgraph', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    const memoryLimit = req.query.memoryLimit
      ? parseInt(req.query.memoryLimit as string, 10)
      : 20;
    const entityLimit = req.query.entityLimit
      ? parseInt(req.query.entityLimit as string, 10)
      : 10;
    const includeEdges = req.query.includeEdges !== 'false';

    // Verify entity exists
    const entity = await getEntity(id);
    if (!entity) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    const subgraph = await getEntitySubgraph(id, {
      memoryLimit,
      entityLimit,
      includeEdges,
    });

    res.json({
      centerEntity: { id: entity.id, name: entity.name },
      nodeCount: subgraph.nodes.length,
      edgeCount: subgraph.edges.length,
      nodes: subgraph.nodes,
      edges: subgraph.edges,
    });
  } catch (error) {
    console.error('Error getting entity subgraph:', error);
    res.status(500).json({ error: 'Failed to get entity subgraph' });
  }
});

/**
 * GET /api/graph/memories/:id/subgraph
 * Get the local subgraph around a memory
 */
router.get('/memories/:id/subgraph', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    const maxHops = req.query.maxHops
      ? parseInt(req.query.maxHops as string, 10)
      : 1;
    const includeEntities = req.query.includeEntities !== 'false';

    const subgraph = await getMemorySubgraph(id, {
      maxHops,
      includeEntities,
    });

    if (subgraph.nodes.length === 0) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }

    res.json({
      centerMemoryId: id,
      nodeCount: subgraph.nodes.length,
      edgeCount: subgraph.edges.length,
      nodes: subgraph.nodes,
      edges: subgraph.edges,
    });
  } catch (error) {
    console.error('Error getting memory subgraph:', error);
    res.status(500).json({ error: 'Failed to get memory subgraph' });
  }
});

export default router;
