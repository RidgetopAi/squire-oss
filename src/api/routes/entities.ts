import { Router, Request, Response } from 'express';
import {
  listEntities,
  getEntity,
  searchEntities,
  findEntityByName,
  getEntityWithMemories,
  getMemoryEntities,
  countEntitiesByType,
  EntityType,
} from '../../services/entities.js';

const router = Router();

/**
 * GET /api/entities
 * List all entities with optional filtering
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const type = req.query.type as EntityType | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search as string | undefined;

    const [entities, counts] = await Promise.all([
      listEntities({ type, limit, offset, search }),
      countEntitiesByType(),
    ]);

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    res.json({
      entities,
      counts,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing entities:', error);
    res.status(500).json({ error: 'Failed to list entities' });
  }
});

/**
 * GET /api/entities/search
 * Search entities by name
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.query as string;
    if (!query) {
      res.status(400).json({ error: 'query parameter is required' });
      return;
    }

    const type = req.query.type as EntityType | undefined;
    const entities = await searchEntities(query, type);

    res.json({
      query,
      entities,
      count: entities.length,
    });
  } catch (error) {
    console.error('Error searching entities:', error);
    res.status(500).json({ error: 'Failed to search entities' });
  }
});

/**
 * GET /api/entities/who/:name
 * "What do I know about X?" - returns entity with all related memories
 */
router.get('/who/:name', async (req: Request, res: Response): Promise<void> => {
  try {
    const name = req.params.name;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const result = await findEntityByName(name);

    if (!result) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Error finding entity:', error);
    res.status(500).json({ error: 'Failed to find entity' });
  }
});

/**
 * GET /api/entities/:id
 * Get a single entity by ID
 * Query params:
 *   - include=full: Include memories, connected entities, and relationship info
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    const includeFull = req.query.include === 'full';

    if (includeFull) {
      // Return enriched entity with memories, connected entities, relationships
      const enrichedEntity = await getEntityWithMemories(id);
      if (!enrichedEntity) {
        res.status(404).json({ error: 'Entity not found' });
        return;
      }
      res.json(enrichedEntity);
    } else {
      // Return basic entity
      const entity = await getEntity(id);
      if (!entity) {
        res.status(404).json({ error: 'Entity not found' });
        return;
      }
      res.json(entity);
    }
  } catch (error) {
    console.error('Error getting entity:', error);
    res.status(500).json({ error: 'Failed to get entity' });
  }
});

/**
 * GET /api/entities/:id/memories
 * Get all memories that mention an entity
 */
router.get('/:id/memories', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    const result = await getEntityWithMemories(id);

    if (!result) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    res.json({
      entity: {
        id: result.id,
        name: result.name,
        entity_type: result.entity_type,
        mention_count: result.mention_count,
      },
      memories: result.memories,
      count: result.memories.length,
    });
  } catch (error) {
    console.error('Error getting entity memories:', error);
    res.status(500).json({ error: 'Failed to get entity memories' });
  }
});

/**
 * GET /api/memories/:memoryId/entities
 * Get entities mentioned in a specific memory
 */
router.get('/memory/:memoryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const memoryId = req.params.memoryId;
    if (!memoryId) {
      res.status(400).json({ error: 'memoryId is required' });
      return;
    }

    const entities = await getMemoryEntities(memoryId);

    res.json({
      memoryId,
      entities,
      count: entities.length,
    });
  } catch (error) {
    console.error('Error getting memory entities:', error);
    res.status(500).json({ error: 'Failed to get memory entities' });
  }
});

export default router;
