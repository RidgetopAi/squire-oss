import { Router, Request, Response } from 'express';
import {
  generateContext,
  listProfiles,
  getDisclosureLog,
} from '../../services/context.js';

const router = Router();

/**
 * POST /api/context
 * Generate context package for AI consumption
 *
 * Slice 3: Full context injection with profiles, scoring, and token budgeting
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      profile,
      query,
      max_tokens,
      conversation_id,
    } = req.body;

    const contextPackage = await generateContext({
      profile,
      query,
      maxTokens: max_tokens,
      conversationId: conversation_id,
    });

    res.json(contextPackage);
  } catch (error) {
    console.error('Error generating context:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate context';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/context
 * Generate context (simpler interface)
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = req.query.profile as string | undefined;
    const query = req.query.query as string | undefined;
    const maxTokens = req.query.max_tokens
      ? parseInt(req.query.max_tokens as string)
      : undefined;
    const conversationId = req.query.conversation_id as string | undefined;

    const contextPackage = await generateContext({
      profile,
      query,
      maxTokens,
      conversationId,
    });

    res.json(contextPackage);
  } catch (error) {
    console.error('Error generating context:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate context';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/context/profiles
 * List available context profiles
 */
router.get('/profiles', async (_req: Request, res: Response): Promise<void> => {
  try {
    const profiles = await listProfiles();
    res.json({ profiles });
  } catch (error) {
    console.error('Error listing profiles:', error);
    res.status(500).json({ error: 'Failed to list profiles' });
  }
});

/**
 * GET /api/context/disclosure
 * Get disclosure log entries
 */
router.get('/disclosure', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const conversationId = req.query.conversation_id as string | undefined;

    const entries = await getDisclosureLog(limit, conversationId);
    res.json({ entries });
  } catch (error) {
    console.error('Error getting disclosure log:', error);
    res.status(500).json({ error: 'Failed to get disclosure log' });
  }
});

export default router;
