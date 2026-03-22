import { Router, Request, Response } from 'express';
import {
  subscribe,
  unsubscribe,
  getVapidPublicKey,
  isPushConfigured,
  getSubscriptionStats,
  listSubscriptions,
  getSubscriptionByEndpoint,
} from '../../services/push.js';

const router = Router();

/**
 * GET /api/notifications/vapid-key
 * Get the VAPID public key for client-side subscription
 */
router.get('/vapid-key', async (_req: Request, res: Response): Promise<void> => {
  try {
    if (!isPushConfigured()) {
      res.status(503).json({
        error: 'Push notifications not configured',
        message: 'VAPID keys are not set. Generate with: npx web-push generate-vapid-keys',
      });
      return;
    }

    const publicKey = getVapidPublicKey();
    res.json({ publicKey });
  } catch (error) {
    console.error('Error getting VAPID key:', error);
    res.status(500).json({ error: 'Failed to get VAPID key' });
  }
});

/**
 * GET /api/notifications/status
 * Get push notification configuration status and statistics
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const configured = isPushConfigured();
    const stats = configured ? await getSubscriptionStats() : null;

    res.json({
      configured,
      stats,
    });
  } catch (error) {
    console.error('Error getting notification status:', error);
    res.status(500).json({ error: 'Failed to get notification status' });
  }
});

/**
 * POST /api/notifications/subscribe
 * Register a push subscription endpoint
 *
 * Body: {
 *   endpoint: string (required) - Push service URL
 *   p256dh: string (required) - Public key for encryption
 *   auth: string (required) - Auth secret
 *   user_agent?: string - Browser/device user agent
 *   device_name?: string - User-friendly device name
 * }
 */
router.post('/subscribe', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isPushConfigured()) {
      res.status(503).json({
        error: 'Push notifications not configured',
        message: 'VAPID keys are not set on the server',
      });
      return;
    }

    const { endpoint, p256dh, auth, user_agent, device_name } = req.body;

    // Validate required fields
    if (!endpoint) {
      res.status(400).json({ error: 'endpoint is required' });
      return;
    }
    if (!p256dh) {
      res.status(400).json({ error: 'p256dh key is required' });
      return;
    }
    if (!auth) {
      res.status(400).json({ error: 'auth secret is required' });
      return;
    }

    // Validate endpoint is a valid URL
    try {
      new URL(endpoint);
    } catch {
      res.status(400).json({ error: 'endpoint must be a valid URL' });
      return;
    }

    const subscription = await subscribe({
      endpoint,
      p256dh,
      auth,
      user_agent,
      device_name,
    });

    res.status(201).json({
      success: true,
      subscription: {
        id: subscription.id,
        endpoint: subscription.endpoint,
        device_name: subscription.device_name,
        created_at: subscription.created_at,
      },
    });
  } catch (error) {
    console.error('Error subscribing to push:', error);
    res.status(500).json({ error: 'Failed to subscribe to push notifications' });
  }
});

/**
 * DELETE /api/notifications/unsubscribe
 * Unsubscribe from push notifications
 *
 * Body: {
 *   endpoint: string (required) - Push service URL to unsubscribe
 * }
 */
router.delete('/unsubscribe', async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      res.status(400).json({ error: 'endpoint is required' });
      return;
    }

    const deleted = await unsubscribe(endpoint);

    if (!deleted) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }

    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing from push:', error);
    res.status(500).json({ error: 'Failed to unsubscribe from push notifications' });
  }
});

/**
 * GET /api/notifications/subscriptions
 * List all push subscriptions (for admin/debug purposes)
 */
router.get('/subscriptions', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const active_only = req.query.active_only === 'true';

    const subscriptions = await listSubscriptions({ active_only, limit, offset });

    // Return minimal info for security (don't expose keys)
    const safeSubscriptions = subscriptions.map(sub => ({
      id: sub.id,
      endpoint_domain: new URL(sub.endpoint).hostname,
      device_name: sub.device_name,
      user_agent: sub.user_agent,
      active: sub.active,
      last_used_at: sub.last_used_at,
      failure_count: sub.failure_count,
      created_at: sub.created_at,
    }));

    res.json({
      subscriptions: safeSubscriptions,
      count: subscriptions.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing subscriptions:', error);
    res.status(500).json({ error: 'Failed to list subscriptions' });
  }
});

/**
 * GET /api/notifications/subscription
 * Check if a specific endpoint is subscribed
 *
 * Query: endpoint - The push endpoint URL to check
 */
router.get('/subscription', async (req: Request, res: Response): Promise<void> => {
  try {
    const endpoint = req.query.endpoint as string;

    if (!endpoint) {
      res.status(400).json({ error: 'endpoint query parameter is required' });
      return;
    }

    const subscription = await getSubscriptionByEndpoint(endpoint);

    if (!subscription) {
      res.json({ subscribed: false });
      return;
    }

    res.json({
      subscribed: true,
      active: subscription.active,
      id: subscription.id,
      device_name: subscription.device_name,
      created_at: subscription.created_at,
    });
  } catch (error) {
    console.error('Error checking subscription:', error);
    res.status(500).json({ error: 'Failed to check subscription' });
  }
});

export default router;
