import { Router, Request, Response } from 'express';
import {
  getAllBeliefs,
  getBelief,
  getBeliefsByType,
  getBeliefsByEntity,
  getBeliefEvidence,
  getBeliefStats,
  getUnresolvedConflicts,
  resolveConflict,
  isValidBeliefType,
  BELIEF_TYPES,
  type BeliefType,
} from '../../services/beliefs.js';

const router = Router();

/**
 * GET /api/beliefs
 * List all beliefs with optional filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const minConfidence = req.query.minConfidence
      ? parseFloat(req.query.minConfidence as string)
      : undefined;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 50;

    // Validate type if provided
    if (type && !isValidBeliefType(type)) {
      res.status(400).json({
        error: 'Invalid belief type',
        validTypes: BELIEF_TYPES,
      });
      return;
    }

    const beliefs = await getAllBeliefs({
      type: type as BeliefType | undefined,
      status,
      minConfidence,
      limit,
    });

    res.json({ beliefs, count: beliefs.length });
  } catch (error) {
    console.error('Failed to list beliefs:', error);
    res.status(500).json({ error: 'Failed to list beliefs' });
  }
});

/**
 * GET /api/beliefs/stats
 * Get belief statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getBeliefStats();
    res.json({
      stats,
      types: BELIEF_TYPES,
    });
  } catch (error) {
    console.error('Failed to get belief stats:', error);
    res.status(500).json({ error: 'Failed to get belief stats' });
  }
});

/**
 * GET /api/beliefs/conflicts
 * Get all unresolved belief conflicts
 */
router.get('/conflicts', async (_req: Request, res: Response) => {
  try {
    const conflicts = await getUnresolvedConflicts();
    res.json({ conflicts, count: conflicts.length });
  } catch (error) {
    console.error('Failed to get belief conflicts:', error);
    res.status(500).json({ error: 'Failed to get belief conflicts' });
  }
});

/**
 * GET /api/beliefs/type/:type
 * Get beliefs by type
 */
router.get('/type/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type } = req.params;

    if (!type || !isValidBeliefType(type)) {
      res.status(400).json({
        error: 'Invalid belief type',
        validTypes: BELIEF_TYPES,
      });
      return;
    }

    const beliefs = await getBeliefsByType(type);
    res.json({ beliefs, count: beliefs.length });
  } catch (error) {
    console.error('Failed to get beliefs by type:', error);
    res.status(500).json({ error: 'Failed to get beliefs by type' });
  }
});

/**
 * GET /api/beliefs/entity/:entityId
 * Get beliefs about a specific entity
 */
router.get('/entity/:entityId', async (req: Request, res: Response): Promise<void> => {
  try {
    const entityId = req.params.entityId;
    if (!entityId) {
      res.status(400).json({ error: 'Entity ID required' });
      return;
    }
    const beliefs = await getBeliefsByEntity(entityId);
    res.json({ beliefs, count: beliefs.length });
  } catch (error) {
    console.error('Failed to get beliefs by entity:', error);
    res.status(500).json({ error: 'Failed to get beliefs by entity' });
  }
});

/**
 * GET /api/beliefs/:id
 * Get a specific belief by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Belief ID required' });
      return;
    }

    const belief = await getBelief(id);
    if (!belief) {
      res.status(404).json({ error: 'Belief not found' });
      return;
    }

    res.json({ belief });
  } catch (error) {
    console.error('Failed to get belief:', error);
    res.status(500).json({ error: 'Failed to get belief' });
  }
});

/**
 * GET /api/beliefs/:id/evidence
 * Get evidence (memories) supporting a belief
 */
router.get('/:id/evidence', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Belief ID required' });
      return;
    }

    const belief = await getBelief(id);
    if (!belief) {
      res.status(404).json({ error: 'Belief not found' });
      return;
    }

    const evidence = await getBeliefEvidence(id);
    res.json({ belief, evidence, count: evidence.length });
  } catch (error) {
    console.error('Failed to get belief evidence:', error);
    res.status(500).json({ error: 'Failed to get belief evidence' });
  }
});

/**
 * POST /api/beliefs/conflicts/:id/resolve
 * Resolve a belief conflict
 */
router.post('/conflicts/:id/resolve', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Conflict ID required' });
      return;
    }

    const { resolution, notes } = req.body as {
      resolution: string;
      notes?: string;
    };

    const validResolutions = [
      'belief_a_active',
      'belief_b_active',
      'both_valid',
      'merged',
      'user_resolved',
    ];

    if (!resolution || !validResolutions.includes(resolution)) {
      res.status(400).json({
        error: 'Invalid resolution',
        validResolutions,
      });
      return;
    }

    const conflict = await resolveConflict(
      id,
      resolution as 'belief_a_active' | 'belief_b_active' | 'both_valid' | 'merged' | 'user_resolved',
      notes
    );

    res.json({ success: true, conflict });
  } catch (error) {
    console.error('Failed to resolve conflict:', error);
    res.status(500).json({ error: 'Failed to resolve conflict' });
  }
});

export default router;
