-- Reminders: Scheduled notifications for commitments or standalone
-- Supports commitment-linked reminders (offset-based) and standalone ("remind me in X")
-- Includes delivery tracking, retry logic, and snooze support

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- What this reminder is for (NULL for standalone reminders)
  commitment_id UUID REFERENCES commitments(id) ON DELETE CASCADE,

  -- Standalone reminders (from "remind me in 2 hours to X")
  title TEXT,  -- Required if no commitment_id
  body TEXT,

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(50) DEFAULT 'America/Chicago',

  -- Relative timing (for commitment-linked reminders)
  -- Stored as offset from commitment.due_at
  offset_type VARCHAR(20),  -- 'before' | 'after' | 'exact'
  offset_minutes INTEGER,   -- e.g., 60 = 1 hour before, 1440 = 1 day before, 10080 = 1 week

  -- Delivery channel
  channel VARCHAR(20) NOT NULL DEFAULT 'push',  -- 'push' | 'in_app' | 'sms' | 'email'

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'acknowledged' | 'snoozed' | 'canceled' | 'failed'

  -- Execution tracking
  sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,  -- User dismissed/acted on it
  failure_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,

  -- Snooze support
  snoozed_until TIMESTAMPTZ,
  original_scheduled_for TIMESTAMPTZ,  -- Preserved when snoozed

  -- Metadata for extensions
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_reminder_channel CHECK (channel IN ('push', 'in_app', 'sms', 'email')),
  CONSTRAINT valid_reminder_status CHECK (status IN (
    'pending', 'sent', 'acknowledged', 'snoozed', 'canceled', 'failed'
  )),
  CONSTRAINT valid_offset_type CHECK (offset_type IS NULL OR offset_type IN ('before', 'after', 'exact')),
  CONSTRAINT reminder_has_target CHECK (commitment_id IS NOT NULL OR title IS NOT NULL)
);

-- Indexes for common query patterns
-- Scheduler needs to find pending reminders by scheduled time
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders (scheduled_for) WHERE status = 'pending';

-- Look up reminders by commitment
CREATE INDEX IF NOT EXISTS idx_reminders_commitment ON reminders (commitment_id) WHERE commitment_id IS NOT NULL;

-- Filter by status
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders (status);

-- Retry queue for failed reminders
CREATE INDEX IF NOT EXISTS idx_reminders_retry ON reminders (next_retry_at) WHERE status = 'failed' AND next_retry_at IS NOT NULL;

-- Snoozed reminders that need to be rescheduled
CREATE INDEX IF NOT EXISTS idx_reminders_snoozed ON reminders (snoozed_until) WHERE status = 'snoozed' AND snoozed_until IS NOT NULL;

-- Comments
COMMENT ON TABLE reminders IS 'Scheduled notifications - linked to commitments or standalone';
COMMENT ON COLUMN reminders.commitment_id IS 'Link to commitment (NULL for standalone reminders like "remind me in 2 hours")';
COMMENT ON COLUMN reminders.title IS 'For standalone reminders - the reminder text';
COMMENT ON COLUMN reminders.offset_type IS 'Relative timing: before/after commitment due_at, or exact for standalone';
COMMENT ON COLUMN reminders.offset_minutes IS 'Minutes before/after commitment due_at (e.g., 60=1hr, 1440=1day, 10080=1week)';
COMMENT ON COLUMN reminders.channel IS 'Delivery channel: push (PWA), in_app, sms, email';
COMMENT ON COLUMN reminders.status IS 'Lifecycle: pending → sent → acknowledged, or snoozed/canceled/failed';
COMMENT ON COLUMN reminders.original_scheduled_for IS 'Original time before snoozing (for display/tracking)';
