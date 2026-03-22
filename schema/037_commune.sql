-- Commune: Squire's proactive outreach system
-- Enables AI-initiated communication based on scratchpad entries, upcoming events, stale threads

-- Commune trigger types
CREATE TYPE commune_trigger_type AS ENUM (
  'scratchpad',        -- High-priority scratchpad entry marked for sharing
  'commitment_soon',   -- Upcoming commitment needs attention
  'commitment_overdue', -- Overdue commitment
  'stale_thread',      -- Thread hasn't been updated in a while
  'daily_summary',     -- Daily proactive check-in
  'custom'             -- Manual trigger or other reasons
);

-- Delivery channel
CREATE TYPE commune_channel AS ENUM (
  'telegram',
  'push',
  'email'
);

-- Delivery status
CREATE TYPE commune_status AS ENUM (
  'pending',
  'sent',
  'failed',
  'suppressed'  -- Skipped due to quiet hours or rate limiting
);

CREATE TABLE IF NOT EXISTS commune_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- What triggered this outreach
  trigger_type commune_trigger_type NOT NULL,
  trigger_id TEXT,                    -- ID of the triggering entity (scratchpad_id, commitment_id, etc.)

  -- The message
  message TEXT NOT NULL,
  channel commune_channel NOT NULL DEFAULT 'telegram',

  -- Delivery tracking
  status commune_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error_message TEXT,

  -- Deduplication and rate limiting
  content_hash TEXT,                  -- Hash of message content to prevent duplicates

  -- Metadata for context
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_commune_status ON commune_events (status);
CREATE INDEX IF NOT EXISTS idx_commune_trigger ON commune_events (trigger_type, trigger_id);
CREATE INDEX IF NOT EXISTS idx_commune_created ON commune_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commune_content_hash ON commune_events (content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commune_channel ON commune_events (channel);

-- Config table for commune settings (single row)
CREATE TABLE IF NOT EXISTS commune_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- Singleton

  -- Quiet hours (in 24h format, user's timezone)
  quiet_hours_start INTEGER DEFAULT 22,    -- 10pm
  quiet_hours_end INTEGER DEFAULT 7,       -- 7am

  -- Frequency limits
  max_daily_messages INTEGER DEFAULT 5,
  min_hours_between_messages NUMERIC DEFAULT 2.0,

  -- Channel preferences
  enabled_channels TEXT[] DEFAULT ARRAY['telegram'],
  default_channel commune_channel DEFAULT 'telegram',

  -- Feature flags
  enabled BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default config
INSERT INTO commune_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Index on metadata for JSONB queries
CREATE INDEX IF NOT EXISTS idx_commune_metadata ON commune_events USING GIN (metadata);

COMMENT ON TABLE commune_events IS 'History of proactive AI outreach messages';
COMMENT ON COLUMN commune_events.trigger_type IS 'What caused this outreach: scratchpad entry, upcoming commitment, stale thread, etc.';
COMMENT ON COLUMN commune_events.trigger_id IS 'ID of the entity that triggered the outreach';
COMMENT ON COLUMN commune_events.content_hash IS 'SHA256 of message content for deduplication';
COMMENT ON COLUMN commune_events.status IS 'Delivery status: pending, sent, failed, suppressed';

COMMENT ON TABLE commune_config IS 'Singleton configuration for commune feature';
COMMENT ON COLUMN commune_config.quiet_hours_start IS 'Hour (0-23) when quiet hours begin';
COMMENT ON COLUMN commune_config.quiet_hours_end IS 'Hour (0-23) when quiet hours end';
