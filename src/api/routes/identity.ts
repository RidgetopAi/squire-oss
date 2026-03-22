/**
 * Identity Routes
 *
 * API endpoints for managing the locked user identity.
 * Most operations are restricted - identity is immutable by design.
 */

import { Router, type Request, type Response } from 'express';
import {
  getUserIdentity,
  renameUser,
  setInitialIdentity,
  lockIdentity,
  unlockIdentity,
} from '../../services/identity.js';

const router = Router();

/**
 * GET /api/identity
 * Get current user identity
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const identity = await getUserIdentity();

    if (!identity) {
      res.json({
        exists: false,
        message: 'No identity set yet. Introduce yourself to Squire!',
      });
      return;
    }

    res.json({
      exists: true,
      name: identity.name,
      is_locked: identity.is_locked,
      locked_at: identity.locked_at,
      source: identity.source,
      created_at: identity.created_at,
      previous_names: identity.previous_names,
    });
  } catch (error) {
    console.error('[Identity] Get identity error:', error);
    res.status(500).json({
      error: 'Failed to get identity',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/identity/rename
 * Explicitly rename the user (only way to change locked identity)
 * Body: { name: string, reason?: string }
 */
router.post('/rename', async (req: Request, res: Response) => {
  try {
    const { name, reason } = req.body as { name?: string; reason?: string };

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const trimmedName = name.trim();

    // Validate name looks reasonable
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      res.status(400).json({ error: 'Name must be 2-50 characters' });
      return;
    }

    const identity = await renameUser(trimmedName, reason || 'User requested rename');

    res.json({
      success: true,
      message: `Identity updated to "${identity.name}"`,
      identity: {
        name: identity.name,
        is_locked: identity.is_locked,
        previous_names: identity.previous_names,
      },
    });
  } catch (error) {
    console.error('[Identity] Rename error:', error);
    res.status(500).json({
      error: 'Failed to rename',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/identity/set
 * Set initial identity (only works if no identity exists)
 * Body: { name: string }
 */
router.post('/set', async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name?: string };

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const existing = await getUserIdentity();
    if (existing) {
      res.status(409).json({
        error: 'Identity already set',
        message: `Identity is "${existing.name}". Use /rename to change.`,
      });
      return;
    }

    const identity = await setInitialIdentity(name.trim(), 'manual');

    res.json({
      success: true,
      message: `Identity set and locked: "${identity.name}"`,
      identity: {
        name: identity.name,
        is_locked: identity.is_locked,
        source: identity.source,
      },
    });
  } catch (error) {
    console.error('[Identity] Set identity error:', error);
    res.status(500).json({
      error: 'Failed to set identity',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/identity/lock
 * Lock the identity (admin operation)
 */
router.post('/lock', async (_req: Request, res: Response) => {
  try {
    await lockIdentity();
    res.json({ success: true, message: 'Identity locked' });
  } catch (error) {
    console.error('[Identity] Lock error:', error);
    res.status(500).json({ error: 'Failed to lock identity' });
  }
});

/**
 * POST /api/identity/unlock
 * Unlock the identity (admin operation - use with caution)
 */
router.post('/unlock', async (_req: Request, res: Response) => {
  try {
    await unlockIdentity();
    res.json({
      success: true,
      message: 'Identity unlocked - detection will run on next message',
      warning: 'This is intended for admin/testing only!',
    });
  } catch (error) {
    console.error('[Identity] Unlock error:', error);
    res.status(500).json({ error: 'Failed to unlock identity' });
  }
});

export default router;
