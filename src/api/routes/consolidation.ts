import { Router, Request, Response } from 'express';
import {
  consolidateAll,
  consolidatePendingSessions,
  getConsolidationStats,
  CONSOLIDATION_CONFIG,
} from '../../services/consolidation.js';
import {
  startSession,
  endSession,
  getCurrentSession,
  listSessions,
  getSessionStats,
} from '../../services/sessions.js';
import { getRelatedMemories, getEdgeStats } from '../../services/edges.js';

const router = Router();

/**
 * POST /api/consolidation/run
 * Run consolidation (decay, strengthen, edges)
 */
router.post('/run', async (_req: Request, res: Response) => {
  try {
    const result = await consolidateAll();
    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Consolidation failed:', error);
    res.status(500).json({ error: 'Consolidation failed' });
  }
});

/**
 * POST /api/consolidation/pending
 * Run consolidation for all pending sessions
 */
router.post('/pending', async (_req: Request, res: Response) => {
  try {
    const results = await consolidatePendingSessions();
    res.json({
      success: true,
      sessionsProcessed: results.length,
      results,
    });
  } catch (error) {
    console.error('Consolidation failed:', error);
    res.status(500).json({ error: 'Consolidation failed' });
  }
});

/**
 * GET /api/consolidation/stats
 * Get consolidation statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [consolidationStats, edgeStats, sessionStats] = await Promise.all([
      getConsolidationStats(),
      getEdgeStats(),
      getSessionStats(),
    ]);

    res.json({
      consolidation: consolidationStats,
      edges: edgeStats,
      sessions: sessionStats,
      config: CONSOLIDATION_CONFIG,
    });
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * GET /api/sessions
 * List sessions
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as 'pending' | 'completed' | 'failed' | undefined;

    const sessions = await listSessions({ limit, status });
    res.json({ sessions });
  } catch (error) {
    console.error('Failed to list sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/**
 * GET /api/sessions/current
 * Get the current active session
 */
router.get('/sessions/current', async (_req: Request, res: Response) => {
  try {
    const session = await getCurrentSession();
    res.json({ session });
  } catch (error) {
    console.error('Failed to get current session:', error);
    res.status(500).json({ error: 'Failed to get current session' });
  }
});

/**
 * POST /api/sessions
 * Start a new session
 */
router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const { session_type, metadata } = req.body;
    const session = await startSession({ session_type, metadata });
    res.status(201).json({ session });
  } catch (error) {
    console.error('Failed to start session:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

/**
 * POST /api/sessions/:id/end
 * End a session (marks it for consolidation)
 */
router.post('/sessions/:id/end', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.id;
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID required' });
      return;
    }
    const session = await endSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ session });
  } catch (error) {
    console.error('Failed to end session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

/**
 * GET /api/memories/:id/related
 * Get memories related via SIMILAR edges
 */
router.get('/memories/:id/related', async (req: Request, res: Response): Promise<void> => {
  try {
    const memoryId = req.params.id;
    if (!memoryId) {
      res.status(400).json({ error: 'Memory ID required' });
      return;
    }
    const limit = parseInt(req.query.limit as string) || 10;
    const minWeight = parseFloat(req.query.minWeight as string) || 0.2;

    const related = await getRelatedMemories(memoryId, { limit, minWeight });
    res.json({ related });
  } catch (error) {
    console.error('Failed to get related memories:', error);
    res.status(500).json({ error: 'Failed to get related memories' });
  }
});

export default router;
