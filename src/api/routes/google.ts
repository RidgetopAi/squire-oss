import { Router, Request, Response } from 'express';
import {
  getAuthUrl,
  handleOAuthCallback,
  isGoogleConfigured,
  getConnectionStatus,
  getAccount,
  listAccounts,
  disconnectAccount,
  setSyncEnabled,
} from '../../services/google/auth.js';
import {
  listCalendars,
  getCalendar,
  updateCalendarSettings,
  syncCalendarList,
  getCalendarStats,
} from '../../services/google/calendars.js';
import {
  fullSync,
  incrementalSync,
  getSyncHistory,
  getLastSuccessfulSync,
} from '../../services/google/sync.js';

const router = Router();

/**
 * GET /api/integrations/google/status
 * Get Google connection status and connected accounts
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = await getConnectionStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting Google status:', error);
    res.status(500).json({ error: 'Failed to get Google status' });
  }
});

/**
 * GET /api/integrations/google/auth
 * Start OAuth flow - redirects to Google
 */
router.get('/auth', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isGoogleConfigured()) {
      res.status(503).json({
        error: 'Google integration not configured',
        message: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables',
      });
      return;
    }

    // Optional state parameter for CSRF protection or redirect target
    const state = req.query.state as string | undefined;
    const authUrl = getAuthUrl(state);

    // If this is an API call expecting JSON, return the URL
    if (req.headers.accept?.includes('application/json')) {
      res.json({ authUrl });
    } else {
      // Otherwise redirect directly
      res.redirect(authUrl);
    }
  } catch (error) {
    console.error('Error starting Google auth:', error);
    res.status(500).json({ error: 'Failed to start Google auth' });
  }
});

/**
 * GET /api/integrations/google/callback
 * OAuth callback from Google
 */
router.get('/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.query.code as string;
    const error = req.query.error as string;

    if (error) {
      // User denied access or other error
      res.redirect('/app/settings/integrations?error=' + encodeURIComponent(error));
      return;
    }

    if (!code) {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    const account = await handleOAuthCallback(code);

    // Sync calendar list immediately after connection
    try {
      await syncCalendarList(account.id);
    } catch (syncError) {
      console.error('Failed to sync calendar list:', syncError);
      // Don't fail the connection, just log
    }

    // Redirect to settings page with success
    res.redirect('/app/settings/integrations?connected=' + encodeURIComponent(account.email));
  } catch (error) {
    console.error('Error handling Google callback:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.redirect('/app/settings/integrations?error=' + encodeURIComponent(message));
  }
});

/**
 * DELETE /api/integrations/google/disconnect/:accountId
 * Disconnect a Google account
 */
router.delete('/disconnect/:accountId', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = req.params.accountId as string;

    const success = await disconnectAccount(accountId);

    if (!success) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    res.json({ success: true, message: 'Google account disconnected' });
  } catch (error) {
    console.error('Error disconnecting Google:', error);
    res.status(500).json({ error: 'Failed to disconnect Google account' });
  }
});

/**
 * GET /api/integrations/google/accounts
 * List all connected Google accounts
 */
router.get('/accounts', async (_req: Request, res: Response): Promise<void> => {
  try {
    const accounts = await listAccounts();
    res.json({
      accounts: accounts.map(a => ({
        id: a.id,
        email: a.email,
        display_name: a.display_name,
        sync_enabled: a.sync_enabled,
        last_full_sync_at: a.last_full_sync_at,
        created_at: a.created_at,
      })),
    });
  } catch (error) {
    console.error('Error listing Google accounts:', error);
    res.status(500).json({ error: 'Failed to list accounts' });
  }
});

/**
 * PATCH /api/integrations/google/accounts/:accountId
 * Update account settings (e.g., enable/disable sync)
 */
router.patch('/accounts/:accountId', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = req.params.accountId as string;
    const { sync_enabled } = req.body;

    const account = await getAccount(accountId);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    if (typeof sync_enabled === 'boolean') {
      await setSyncEnabled(accountId, sync_enabled);
    }

    const updated = await getAccount(accountId);
    res.json({ account: updated });
  } catch (error) {
    console.error('Error updating Google account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

/**
 * GET /api/integrations/google/calendars/:accountId
 * List calendars for an account
 */
router.get('/calendars/:accountId', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = req.params.accountId as string;

    const account = await getAccount(accountId);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const calendars = await listCalendars(accountId);
    const stats = await getCalendarStats(accountId);

    res.json({ calendars, stats });
  } catch (error) {
    console.error('Error listing calendars:', error);
    res.status(500).json({ error: 'Failed to list calendars' });
  }
});

/**
 * POST /api/integrations/google/calendars/:accountId/sync
 * Refresh calendar list from Google
 */
router.post('/calendars/:accountId/sync', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = req.params.accountId as string;

    const account = await getAccount(accountId);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const calendars = await syncCalendarList(accountId);
    res.json({ calendars, synced: calendars.length });
  } catch (error) {
    console.error('Error syncing calendars:', error);
    res.status(500).json({ error: 'Failed to sync calendars' });
  }
});

/**
 * PATCH /api/integrations/google/calendars/settings/:calendarId
 * Update calendar sync settings
 */
router.patch('/calendars/settings/:calendarId', async (req: Request, res: Response): Promise<void> => {
  try {
    const calendarId = req.params.calendarId as string;
    const { sync_enabled, sync_direction, is_default_for_push } = req.body;

    const calendar = await getCalendar(calendarId);
    if (!calendar) {
      res.status(404).json({ error: 'Calendar not found' });
      return;
    }

    const updated = await updateCalendarSettings(calendarId, {
      sync_enabled,
      sync_direction,
      is_default_for_push,
    });

    res.json({ calendar: updated });
  } catch (error) {
    console.error('Error updating calendar settings:', error);
    res.status(500).json({ error: 'Failed to update calendar settings' });
  }
});

/**
 * POST /api/integrations/google/sync/:accountId
 * Trigger manual sync for an account
 */
router.post('/sync/:accountId', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = req.params.accountId as string;
    const full = req.query.full as string | undefined;

    const account = await getAccount(accountId);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const result = full === 'true'
      ? await fullSync(accountId)
      : await incrementalSync(accountId);

    res.json({ result });
  } catch (error) {
    console.error('Error syncing:', error);
    res.status(500).json({ error: 'Failed to sync' });
  }
});

/**
 * GET /api/integrations/google/sync/:accountId/history
 * Get sync history for an account
 */
router.get('/sync/:accountId/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = req.params.accountId as string;
    const limit = parseInt(req.query.limit as string) || 20;

    const account = await getAccount(accountId);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const history = await getSyncHistory(accountId, limit);
    const lastSuccess = await getLastSuccessfulSync(accountId);

    res.json({ history, lastSuccess });
  } catch (error) {
    console.error('Error getting sync history:', error);
    res.status(500).json({ error: 'Failed to get sync history' });
  }
});

export default router;
