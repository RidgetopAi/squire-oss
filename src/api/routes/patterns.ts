import { Router, Request, Response } from 'express';
import {
  getAllPatterns,
  getPattern,
  getPatternsByType,
  getPatternsByEntity,
  getPatternEvidence,
  getPatternStats,
  isValidPatternType,
  PATTERN_TYPES,
  TIME_OF_DAY,
  DAY_OF_WEEK,
  type PatternType,
  type TimeOfDay,
  type DayOfWeek,
} from '../../services/patterns.js';

const router = Router();

/**
 * GET /api/patterns
 * List all patterns with optional filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const minConfidence = req.query.minConfidence
      ? parseFloat(req.query.minConfidence as string)
      : undefined;
    const timeOfDay = req.query.timeOfDay as string | undefined;
    const dayOfWeek = req.query.dayOfWeek as string | undefined;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 50;

    // Validate type if provided
    if (type && !isValidPatternType(type)) {
      res.status(400).json({
        error: 'Invalid pattern type',
        validTypes: PATTERN_TYPES,
      });
      return;
    }

    // Validate timeOfDay if provided
    if (timeOfDay && !TIME_OF_DAY.includes(timeOfDay as TimeOfDay)) {
      res.status(400).json({
        error: 'Invalid time of day',
        validValues: TIME_OF_DAY,
      });
      return;
    }

    // Validate dayOfWeek if provided
    if (dayOfWeek && !DAY_OF_WEEK.includes(dayOfWeek as DayOfWeek)) {
      res.status(400).json({
        error: 'Invalid day of week',
        validValues: DAY_OF_WEEK,
      });
      return;
    }

    const patterns = await getAllPatterns({
      type: type as PatternType | undefined,
      status,
      minConfidence,
      timeOfDay: timeOfDay as TimeOfDay | undefined,
      dayOfWeek: dayOfWeek as DayOfWeek | undefined,
      limit,
    });

    res.json({ patterns, count: patterns.length });
  } catch (error) {
    console.error('Failed to list patterns:', error);
    res.status(500).json({ error: 'Failed to list patterns' });
  }
});

/**
 * GET /api/patterns/stats
 * Get pattern statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getPatternStats();
    res.json({
      stats,
      types: PATTERN_TYPES,
      timeValues: TIME_OF_DAY,
      dayValues: DAY_OF_WEEK,
    });
  } catch (error) {
    console.error('Failed to get pattern stats:', error);
    res.status(500).json({ error: 'Failed to get pattern stats' });
  }
});

/**
 * GET /api/patterns/type/:type
 * Get patterns by type
 */
router.get('/type/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type } = req.params;

    if (!type || !isValidPatternType(type)) {
      res.status(400).json({
        error: 'Invalid pattern type',
        validTypes: PATTERN_TYPES,
      });
      return;
    }

    const patterns = await getPatternsByType(type);
    res.json({ patterns, count: patterns.length });
  } catch (error) {
    console.error('Failed to get patterns by type:', error);
    res.status(500).json({ error: 'Failed to get patterns by type' });
  }
});

/**
 * GET /api/patterns/entity/:entityId
 * Get patterns about a specific entity
 */
router.get('/entity/:entityId', async (req: Request, res: Response): Promise<void> => {
  try {
    const entityId = req.params.entityId;
    if (!entityId) {
      res.status(400).json({ error: 'Entity ID required' });
      return;
    }
    const patterns = await getPatternsByEntity(entityId);
    res.json({ patterns, count: patterns.length });
  } catch (error) {
    console.error('Failed to get patterns by entity:', error);
    res.status(500).json({ error: 'Failed to get patterns by entity' });
  }
});

/**
 * GET /api/patterns/:id
 * Get a specific pattern by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Pattern ID required' });
      return;
    }

    const pattern = await getPattern(id);
    if (!pattern) {
      res.status(404).json({ error: 'Pattern not found' });
      return;
    }

    res.json({ pattern });
  } catch (error) {
    console.error('Failed to get pattern:', error);
    res.status(500).json({ error: 'Failed to get pattern' });
  }
});

/**
 * GET /api/patterns/:id/evidence
 * Get evidence (memories) supporting a pattern
 */
router.get('/:id/evidence', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Pattern ID required' });
      return;
    }

    const pattern = await getPattern(id);
    if (!pattern) {
      res.status(404).json({ error: 'Pattern not found' });
      return;
    }

    const evidence = await getPatternEvidence(id);
    res.json({ pattern, evidence, count: evidence.length });
  } catch (error) {
    console.error('Failed to get pattern evidence:', error);
    res.status(500).json({ error: 'Failed to get pattern evidence' });
  }
});

export default router;
