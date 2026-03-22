import { Router, Request, Response } from 'express';
import {
  getAllSummaries,
  getSummary,
  getNonEmptySummaries,
  generateSummary,
  updateAllSummaries,
  getSummaryStats,
  isValidCategory,
  SUMMARY_CATEGORIES,
  refreshCommitmentsSummary,
  type SummaryCategory,
} from '../../services/summaries.js';

const router = Router();

/**
 * GET /api/summaries
 * List all living summaries
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const nonEmptyOnly = req.query.nonEmpty === 'true';
    const summaries = nonEmptyOnly
      ? await getNonEmptySummaries()
      : await getAllSummaries();

    res.json({ summaries });
  } catch (error) {
    console.error('Failed to list summaries:', error);
    res.status(500).json({ error: 'Failed to list summaries' });
  }
});

/**
 * GET /api/summaries/stats
 * Get summary statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getSummaryStats();
    res.json({
      stats,
      categories: SUMMARY_CATEGORIES,
    });
  } catch (error) {
    console.error('Failed to get summary stats:', error);
    res.status(500).json({ error: 'Failed to get summary stats' });
  }
});

/**
 * GET /api/summaries/:category
 * Get a specific summary by category
 */
router.get('/:category', async (req: Request, res: Response): Promise<void> => {
  try {
    const { category } = req.params;

    if (!category || !isValidCategory(category)) {
      res.status(400).json({
        error: 'Invalid category',
        validCategories: SUMMARY_CATEGORIES,
      });
      return;
    }

    const summary = await getSummary(category);
    if (!summary) {
      res.status(404).json({ error: 'Summary not found' });
      return;
    }

    res.json({ summary });
  } catch (error) {
    console.error('Failed to get summary:', error);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

/**
 * POST /api/summaries/:category/generate
 * Generate or update a summary for a category
 */
router.post('/:category/generate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { category } = req.params;

    if (!category || !isValidCategory(category)) {
      res.status(400).json({
        error: 'Invalid category',
        validCategories: SUMMARY_CATEGORIES,
      });
      return;
    }

    const result = await generateSummary(category as SummaryCategory);

    res.json({
      success: true,
      summary: result.summary,
      memoriesProcessed: result.memoriesProcessed,
    });
  } catch (error) {
    console.error('Failed to generate summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

/**
 * POST /api/summaries/generate-all
 * Update all summaries that have pending memories
 */
router.post('/generate-all', async (_req: Request, res: Response) => {
  try {
    const result = await updateAllSummaries();

    res.json({
      success: true,
      updated: result.updated,
      memoriesProcessed: result.memoriesProcessed,
    });
  } catch (error) {
    console.error('Failed to update summaries:', error);
    res.status(500).json({ error: 'Failed to update summaries' });
  }
});

/**
 * POST /api/summaries/commitments/refresh
 * Force refresh the commitments summary from actual commitment data.
 * Use this when the summary is stale (contains outdated dates/events).
 */
router.post('/commitments/refresh', async (_req: Request, res: Response) => {
  try {
    const summary = await refreshCommitmentsSummary();

    res.json({
      success: true,
      summary,
      message: 'Commitments summary refreshed from current data',
    });
  } catch (error) {
    console.error('Failed to refresh commitments summary:', error);
    res.status(500).json({ error: 'Failed to refresh commitments summary' });
  }
});

export default router;
