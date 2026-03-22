-- Push Subscriptions: Browser push notification endpoints for PWA
-- Stores Web Push API subscription data from navigator.serviceWorker.pushManager
-- Supports multiple devices per user with failure tracking

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Subscription details (from browser PushSubscription object)
  -- These come from: subscription.endpoint, subscription.getKey('p256dh'), subscription.getKey('auth')
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,    -- Public key for encryption (base64)
  auth TEXT NOT NULL,      -- Auth secret for encryption (base64)

  -- Device identification
  user_agent TEXT,         -- Browser/OS info for display
  device_name TEXT,        -- User-friendly name (e.g., "Chrome on MacBook")

  -- Status tracking
  active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,           -- Last successful push
  failure_count INTEGER DEFAULT 0,     -- Consecutive failures
  last_failure_at TIMESTAMPTZ,
  last_failure_reason TEXT,            -- e.g., "410 Gone" means unsubscribed

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
-- Find active subscriptions for sending
CREATE INDEX IF NOT EXISTS idx_push_subs_active ON push_subscriptions (active) WHERE active = TRUE;

-- Lookup by endpoint (already UNIQUE, but explicit for queries)
CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint ON push_subscriptions (endpoint);

-- Find subscriptions needing cleanup (high failure count)
CREATE INDEX IF NOT EXISTS idx_push_subs_failures ON push_subscriptions (failure_count) WHERE failure_count > 0;

-- Comments
COMMENT ON TABLE push_subscriptions IS 'Browser push notification subscriptions for PWA';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Push service URL from PushSubscription.endpoint';
COMMENT ON COLUMN push_subscriptions.p256dh IS 'Public key from PushSubscription.getKey("p256dh"), base64 encoded';
COMMENT ON COLUMN push_subscriptions.auth IS 'Auth secret from PushSubscription.getKey("auth"), base64 encoded';
COMMENT ON COLUMN push_subscriptions.device_name IS 'User-friendly device name for settings UI';
COMMENT ON COLUMN push_subscriptions.failure_count IS 'Consecutive push failures - deactivate after threshold';
COMMENT ON COLUMN push_subscriptions.last_failure_reason IS 'HTTP status or error message from last failure';
