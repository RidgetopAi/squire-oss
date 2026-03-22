import { Router, Request, Response } from 'express';
import {
  createMemory,
  getMemory,
  listMemories,
  countMemories,
  deleteMemory,
  searchMemories,
} from '../../services/memories.js';

const router = Router();

/**
 * POST /api/memories
 * Store a new memory with entity extraction
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { content, source, content_type, source_metadata, occurred_at, skipEntityExtraction } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'content is required and must be a string' });
      return;
    }

    const result = await createMemory({
      content,
      source,
      content_type,
      source_metadata,
      occurred_at: occurred_at ? new Date(occurred_at) : undefined,
      skipEntityExtraction: skipEntityExtraction === true,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating memory:', error);
    res.status(500).json({ error: 'Failed to create memory' });
  }
});

/**
 * GET /api/memories
 * List memories with optional filters
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const source = req.query.source as string | undefined;

    const [memories, total] = await Promise.all([
      listMemories({ limit, offset, source }),
      countMemories(),
    ]);

    res.json({
      memories,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing memories:', error);
    res.status(500).json({ error: 'Failed to list memories' });
  }
});

/**
 * GET /api/memories/search
 * Semantic search for memories
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.query as string;
    if (!query) {
      res.status(400).json({ error: 'query parameter is required' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 10;
    const minSimilarity = parseFloat(req.query.min_similarity as string) || 0.3;

    const results = await searchMemories(query, { limit, minSimilarity });

    res.json({
      query,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Error searching memories:', error);
    res.status(500).json({ error: 'Failed to search memories' });
  }
});

/**
 * GET /api/memories/:id
 * Get a single memory by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const memory = await getMemory(id);

    if (!memory) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }

    res.json(memory);
  } catch (error) {
    console.error('Error getting memory:', error);
    res.status(500).json({ error: 'Failed to get memory' });
  }
});

/**
 * DELETE /api/memories/:id
 * Delete a memory by ID
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const deleted = await deleteMemory(id);

    if (!deleted) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }

    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting memory:', error);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

export default router;
