import webpush from 'web-push';
import { pool } from '../db/pool.js';

// ========================================
// Types
// ========================================

export interface PushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  device_name: string | null;
  active: boolean;
  last_used_at: Date | null;
  failure_count: number;
  last_failure_at: Date | null;
  last_failure_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface SubscribeInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string;
  device_name?: string;
}

export interface PushPayload {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

export interface SendResult {
  subscription_id: string;
  success: boolean;
  error?: string;
  statusCode?: number;
}

// ========================================
// Configuration
// ========================================

// VAPID keys should be set via environment variables
// Generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || '';

// Max consecutive failures before deactivating subscription
const MAX_FAILURE_COUNT = 5;

// Initialize web-push with VAPID details
let vapidConfigured = false;

function ensureVapidConfigured(): void {
  if (vapidConfigured) return;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys not configured. Push notifications will not work.');
    console.warn('Generate keys with: npx web-push generate-vapid-keys');
    return;
  }

  if (!VAPID_SUBJECT) {
    console.warn('VAPID_SUBJECT not configured. Push notifications may fail on some platforms.');
    console.warn('Set VAPID_SUBJECT to a mailto: URL (e.g., mailto:admin@yourdomain.com)');
    return;
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
}

/**
 * Get the VAPID public key for client subscription
 */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

/**
 * Check if push notifications are configured
 */
export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

// ========================================
// Subscription Management
// ========================================

/**
 * Subscribe a new push endpoint
 */
export async function subscribe(input: SubscribeInput): Promise<PushSubscription> {
  const { endpoint, p256dh, auth, user_agent, device_name } = input;

  // Upsert: update if endpoint exists, insert if new
  const result = await pool.query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, device_name, active)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (endpoint) DO UPDATE SET
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent),
       device_name = COALESCE(EXCLUDED.device_name, push_subscriptions.device_name),
       active = true,
       failure_count = 0,
       last_failure_at = NULL,
       last_failure_reason = NULL,
       updated_at = NOW()
     RETURNING *`,
    [endpoint, p256dh, auth, user_agent ?? null, device_name ?? null]
  );

  return result.rows[0] as PushSubscription;
}

/**
 * Unsubscribe a push endpoint
 */
export async function unsubscribe(endpoint: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM push_subscriptions WHERE endpoint = $1',
    [endpoint]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Deactivate a subscription (soft delete)
 */
export async function deactivateSubscription(id: string): Promise<PushSubscription | null> {
  const result = await pool.query(
    `UPDATE push_subscriptions
     SET active = false, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return (result.rows[0] as PushSubscription) ?? null;
}

/**
 * Get a subscription by ID
 */
export async function getSubscription(id: string): Promise<PushSubscription | null> {
  const result = await pool.query(
    'SELECT * FROM push_subscriptions WHERE id = $1',
    [id]
  );
  return (result.rows[0] as PushSubscription) ?? null;
}

/**
 * Get a subscription by endpoint
 */
export async function getSubscriptionByEndpoint(endpoint: string): Promise<PushSubscription | null> {
  const result = await pool.query(
    'SELECT * FROM push_subscriptions WHERE endpoint = $1',
    [endpoint]
  );
  return (result.rows[0] as PushSubscription) ?? null;
}

/**
 * Get all active subscriptions
 */
export async function getActiveSubscriptions(): Promise<PushSubscription[]> {
  const result = await pool.query(
    'SELECT * FROM push_subscriptions WHERE active = true ORDER BY created_at DESC'
  );
  return result.rows as PushSubscription[];
}

/**
 * List all subscriptions
 */
export async function listSubscriptions(
  options: { active_only?: boolean; limit?: number; offset?: number } = {}
): Promise<PushSubscription[]> {
  const { active_only = false, limit = 50, offset = 0 } = options;

  let query = 'SELECT * FROM push_subscriptions';
  const params: (boolean | number)[] = [];
  let paramIndex = 1;

  if (active_only) {
    query += ` WHERE active = $${paramIndex}`;
    params.push(true);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows as PushSubscription[];
}

// ========================================
// Sending Notifications
// ========================================

/**
 * Send push notification to a single subscription
 */
export async function sendToSubscription(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<SendResult> {
  ensureVapidConfigured();

  if (!isPushConfigured()) {
    return {
      subscription_id: subscription.id,
      success: false,
      error: 'VAPID keys not configured',
    };
  }

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  try {
    const response = await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload)
    );

    // Update last_used_at on success
    await pool.query(
      `UPDATE push_subscriptions
       SET last_used_at = NOW(),
           failure_count = 0,
           updated_at = NOW()
       WHERE id = $1`,
      [subscription.id]
    );

    return {
      subscription_id: subscription.id,
      success: true,
      statusCode: response.statusCode,
    };
  } catch (error) {
    const err = error as Error & { statusCode?: number };
    const statusCode = err.statusCode;
    const errorMessage = err.message || 'Unknown error';

    // Update failure tracking
    await pool.query(
      `UPDATE push_subscriptions
       SET failure_count = failure_count + 1,
           last_failure_at = NOW(),
           last_failure_reason = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [errorMessage, subscription.id]
    );

    // Check if we should deactivate
    // 410 Gone means the subscription is no longer valid
    // 404 means endpoint not found
    if (statusCode === 410 || statusCode === 404) {
      await deactivateSubscription(subscription.id);
    } else {
      // Check if we've exceeded max failures
      const updated = await getSubscription(subscription.id);
      if (updated && updated.failure_count >= MAX_FAILURE_COUNT) {
        await deactivateSubscription(subscription.id);
      }
    }

    return {
      subscription_id: subscription.id,
      success: false,
      error: errorMessage,
      statusCode,
    };
  }
}

/**
 * Send push notification to all active subscriptions
 */
export async function sendToAll(payload: PushPayload): Promise<SendResult[]> {
  const subscriptions = await getActiveSubscriptions();

  if (subscriptions.length === 0) {
    return [];
  }

  const results = await Promise.all(
    subscriptions.map(sub => sendToSubscription(sub, payload))
  );

  return results;
}

// ========================================
// Convenience methods for common notifications
// ========================================

/**
 * Send a reminder notification
 */
export async function sendReminderNotification(
  reminderId: string,
  title: string,
  body: string,
  options: {
    commitmentId?: string;
    url?: string;
  } = {}
): Promise<SendResult[]> {
  const payload: PushPayload = {
    title,
    body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: reminderId,
    data: {
      type: 'reminder',
      reminder_id: reminderId,
      commitment_id: options.commitmentId,
      url: options.url || '/app/commitments',
    },
    actions: [
      { action: 'view', title: 'View' },
      { action: 'snooze', title: 'Snooze 1h' },
      { action: 'done', title: 'Done' },
    ],
  };

  return sendToAll(payload);
}

/**
 * Get subscription statistics
 */
export async function getSubscriptionStats(): Promise<{
  total: number;
  active: number;
  inactive: number;
  recent_failures: number;
}> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE active = true) as active,
      COUNT(*) FILTER (WHERE active = false) as inactive,
      COUNT(*) FILTER (WHERE failure_count > 0 AND last_failure_at > NOW() - INTERVAL '24 hours') as recent_failures
    FROM push_subscriptions
  `);

  const row = result.rows[0];
  return {
    total: parseInt(row.total, 10),
    active: parseInt(row.active, 10),
    inactive: parseInt(row.inactive, 10),
    recent_failures: parseInt(row.recent_failures, 10),
  };
}
