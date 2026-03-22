import { Router, Request, Response } from 'express';
import {
  getAllInsights,
  getInsight,
  getInsightsByType,
  getInsightSources,
  getInsightsBySource,
  getInsightStats,
  dismissInsight,
  actionInsight,
  isValidInsightType,
  INSIGHT_TYPES,
  INSIGHT_PRIORITIES,
  INSIGHT_STATUSES,
  SOURCE_TYPES,
  type InsightType,
  type InsightPriority,
  type InsightStatus,
  type SourceType,
} from '../../services/insights.js';

const router = Router();

/**
 * GET /api/insights
 * List all insights with optional filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const priority = req.query.priority as string | undefined;
    const minConfidence = req.query.minConfidence
      ? parseFloat(req.query.minConfidence as string)
      : undefined;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 50;

    // Validate type if provided
    if (type && !isValidInsightType(type)) {
      res.status(400).json({
        error: 'Invalid insight type',
        validTypes: INSIGHT_TYPES,
      });
      return;
    }

    // Validate status if provided
    if (status && !INSIGHT_STATUSES.includes(status as InsightStatus)) {
      res.status(400).json({
        error: 'Invalid status',
        validStatuses: INSIGHT_STATUSES,
      });
      return;
    }

    // Validate priority if provided
    if (priority && !INSIGHT_PRIORITIES.includes(priority as InsightPriority)) {
      res.status(400).json({
        error: 'Invalid priority',
        validPriorities: INSIGHT_PRIORITIES,
      });
      return;
    }

    const insights = await getAllInsights({
      type: type as InsightType | undefined,
      status: status as InsightStatus | undefined,
      priority: priority as InsightPriority | undefined,
      minConfidence,
      limit,
    });

    res.json({ insights, count: insights.length });
  } catch (error) {
    console.error('Failed to list insights:', error);
    res.status(500).json({ error: 'Failed to list insights' });
  }
});

/**
 * GET /api/insights/stats
 * Get insight statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getInsightStats();
    res.json({
      stats,
      types: INSIGHT_TYPES,
      priorities: INSIGHT_PRIORITIES,
      statuses: INSIGHT_STATUSES,
    });
  } catch (error) {
    console.error('Failed to get insight stats:', error);
    res.status(500).json({ error: 'Failed to get insight stats' });
  }
});

/**
 * GET /api/insights/type/:type
 * Get insights by type
 */
router.get('/type/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type } = req.params;

    if (!type || !isValidInsightType(type)) {
      res.status(400).json({
        error: 'Invalid insight type',
        validTypes: INSIGHT_TYPES,
      });
      return;
    }

    const insights = await getInsightsByType(type);
    res.json({ insights, count: insights.length });
  } catch (error) {
    console.error('Failed to get insights by type:', error);
    res.status(500).json({ error: 'Failed to get insights by type' });
  }
});

/**
 * GET /api/insights/source/:sourceType/:sourceId
 * Get insights referencing a specific source
 */
router.get('/source/:sourceType/:sourceId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sourceType, sourceId } = req.params;

    if (!sourceType || !SOURCE_TYPES.includes(sourceType as SourceType)) {
      res.status(400).json({
        error: 'Invalid source type',
        validTypes: SOURCE_TYPES,
      });
      return;
    }

    if (!sourceId) {
      res.status(400).json({ error: 'Source ID required' });
      return;
    }

    const insights = await getInsightsBySource(sourceType as SourceType, sourceId);
    res.json({ insights, count: insights.length });
  } catch (error) {
    console.error('Failed to get insights by source:', error);
    res.status(500).json({ error: 'Failed to get insights by source' });
  }
});

/**
 * GET /api/insights/:id
 * Get a specific insight by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Insight ID required' });
      return;
    }

    const insight = await getInsight(id);
    if (!insight) {
      res.status(404).json({ error: 'Insight not found' });
      return;
    }

    res.json({ insight });
  } catch (error) {
    console.error('Failed to get insight:', error);
    res.status(500).json({ error: 'Failed to get insight' });
  }
});

/**
 * GET /api/insights/:id/sources
 * Get sources (memories, beliefs, patterns) for an insight
 */
router.get('/:id/sources', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Insight ID required' });
      return;
    }

    const insight = await getInsight(id);
    if (!insight) {
      res.status(404).json({ error: 'Insight not found' });
      return;
    }

    const sources = await getInsightSources(id);
    res.json({ insight, sources, count: sources.length });
  } catch (error) {
    console.error('Failed to get insight sources:', error);
    res.status(500).json({ error: 'Failed to get insight sources' });
  }
});

/**
 * POST /api/insights/:id/dismiss
 * Dismiss an insight (user says not relevant)
 */
router.post('/:id/dismiss', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Insight ID required' });
      return;
    }

    const reason = req.body.reason as string | undefined;

    const insight = await dismissInsight(id, reason);
    res.json({ insight, message: 'Insight dismissed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Failed to dismiss insight:', error);
    res.status(500).json({ error: 'Failed to dismiss insight' });
  }
});

/**
 * POST /api/insights/:id/action
 * Mark an insight as actioned (user did something about it)
 */
router.post('/:id/action', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Insight ID required' });
      return;
    }

    const insight = await actionInsight(id);
    res.json({ insight, message: 'Insight marked as actioned' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Failed to action insight:', error);
    res.status(500).json({ error: 'Failed to action insight' });
  }
});

export default router;
