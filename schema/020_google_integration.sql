-- Google Calendar Integration
-- OAuth accounts, calendar selection, and event caching for bidirectional sync

-- ============================================================================
-- Google OAuth Accounts
-- ============================================================================
-- Stores OAuth tokens and sync state for connected Google accounts
CREATE TABLE IF NOT EXISTS google_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Google identity
  google_user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,

  -- OAuth tokens (encrypted in production via application layer)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] DEFAULT '{}',

  -- Sync state
  calendars_sync_token TEXT,  -- For incremental calendar list sync
  last_full_sync_at TIMESTAMPTZ,
  sync_enabled BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_google_accounts_email ON google_accounts (email);
CREATE INDEX IF NOT EXISTS idx_google_accounts_sync ON google_accounts (sync_enabled) WHERE sync_enabled = TRUE;

-- Comments
COMMENT ON TABLE google_accounts IS 'Google OAuth accounts for Calendar integration';
COMMENT ON COLUMN google_accounts.google_user_id IS 'Unique Google account ID from OAuth';
COMMENT ON COLUMN google_accounts.calendars_sync_token IS 'Token for incremental calendar list sync';
COMMENT ON COLUMN google_accounts.last_full_sync_at IS 'Last time a full sync was performed';

-- ============================================================================
-- Google Calendars
-- ============================================================================
-- Which calendars to sync and their sync settings
CREATE TABLE IF NOT EXISTS google_calendars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  google_account_id UUID NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,  -- Google calendar ID (e.g., "primary" or email address)

  -- Calendar metadata
  summary TEXT,  -- Calendar name/title
  description TEXT,
  color_id TEXT,
  background_color TEXT,
  foreground_color TEXT,
  timezone VARCHAR(50),
  access_role VARCHAR(20),  -- 'owner' | 'writer' | 'reader' | 'freeBusyReader'

  -- Sync settings
  sync_enabled BOOLEAN DEFAULT TRUE,
  sync_direction VARCHAR(20) DEFAULT 'bidirectional',  -- 'read_only' | 'write_only' | 'bidirectional'
  events_sync_token TEXT,  -- For incremental event sync
  last_synced_at TIMESTAMPTZ,

  -- Which Squire items to push to this calendar
  is_default_for_push BOOLEAN DEFAULT FALSE,  -- New Squire commitments go here
  is_primary BOOLEAN DEFAULT FALSE,  -- Google's primary calendar

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE (google_account_id, calendar_id),
  CONSTRAINT valid_sync_direction CHECK (sync_direction IN ('read_only', 'write_only', 'bidirectional')),
  CONSTRAINT valid_access_role CHECK (access_role IS NULL OR access_role IN ('owner', 'writer', 'reader', 'freeBusyReader'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_google_calendars_account ON google_calendars (google_account_id);
CREATE INDEX IF NOT EXISTS idx_google_calendars_sync ON google_calendars (sync_enabled) WHERE sync_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_google_calendars_default ON google_calendars (is_default_for_push) WHERE is_default_for_push = TRUE;

-- Comments
COMMENT ON TABLE google_calendars IS 'Google calendars available for sync';
COMMENT ON COLUMN google_calendars.calendar_id IS 'Google calendar ID (primary or email address)';
COMMENT ON COLUMN google_calendars.sync_direction IS 'read_only: pull only, write_only: push only, bidirectional: both';
COMMENT ON COLUMN google_calendars.events_sync_token IS 'Token for incremental event sync from Google';
COMMENT ON COLUMN google_calendars.is_default_for_push IS 'New Squire commitments sync to this calendar';

-- ============================================================================
-- Google Events (Cached)
-- ============================================================================
-- Cached Google calendar events for display and conflict detection
CREATE TABLE IF NOT EXISTS google_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  google_calendar_id UUID NOT NULL REFERENCES google_calendars(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,  -- Google event ID

  -- Event data
  summary TEXT,
  description TEXT,
  location TEXT,
  html_link TEXT,

  -- Timing
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT FALSE,
  timezone VARCHAR(50),

  -- Recurrence
  rrule TEXT,  -- RRULE string for recurring events
  recurring_event_id TEXT,  -- Parent event ID for instances
  original_start_time TIMESTAMPTZ,  -- Original time for modified instances

  -- Status and sync
  status VARCHAR(20) DEFAULT 'confirmed',  -- 'confirmed' | 'tentative' | 'cancelled'
  visibility VARCHAR(20) DEFAULT 'default',  -- 'default' | 'public' | 'private' | 'confidential'
  etag TEXT,  -- For conflict detection

  -- Attendees (simplified - full list in raw)
  organizer_email TEXT,
  attendee_count INTEGER DEFAULT 0,
  user_response_status VARCHAR(20),  -- 'needsAction' | 'declined' | 'tentative' | 'accepted'

  -- Link to Squire commitment (if created from Squire or synced)
  commitment_id UUID REFERENCES commitments(id) ON DELETE SET NULL,

  -- Raw Google API response for edge cases
  raw JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE (google_calendar_id, event_id),
  CONSTRAINT valid_event_status CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  CONSTRAINT valid_visibility CHECK (visibility IN ('default', 'public', 'private', 'confidential')),
  CONSTRAINT valid_response_status CHECK (user_response_status IS NULL OR user_response_status IN (
    'needsAction', 'declined', 'tentative', 'accepted'
  ))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_google_events_calendar ON google_events (google_calendar_id);
CREATE INDEX IF NOT EXISTS idx_google_events_time ON google_events (start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_google_events_time_range ON google_events (google_calendar_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_google_events_commitment ON google_events (commitment_id) WHERE commitment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_google_events_recurring ON google_events (recurring_event_id) WHERE recurring_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_google_events_status ON google_events (status) WHERE status != 'cancelled';

-- Comments
COMMENT ON TABLE google_events IS 'Cached Google calendar events for display and sync';
COMMENT ON COLUMN google_events.event_id IS 'Google event ID within the calendar';
COMMENT ON COLUMN google_events.recurring_event_id IS 'Parent event ID for recurring event instances';
COMMENT ON COLUMN google_events.original_start_time IS 'Original start time for modified recurring instances';
COMMENT ON COLUMN google_events.etag IS 'ETag for conflict detection during sync';
COMMENT ON COLUMN google_events.commitment_id IS 'Linked Squire commitment if synced';
COMMENT ON COLUMN google_events.raw IS 'Full Google API response for edge cases';

-- ============================================================================
-- Add FK from commitments to google_accounts
-- ============================================================================
-- This was deferred in 018_commitments.sql since google_accounts didn't exist yet
ALTER TABLE commitments
  ADD CONSTRAINT fk_commitments_google_account
  FOREIGN KEY (google_account_id) REFERENCES google_accounts(id) ON DELETE SET NULL;

-- ============================================================================
-- Sync History (Optional - for debugging and analytics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS google_sync_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  google_account_id UUID NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
  google_calendar_id UUID REFERENCES google_calendars(id) ON DELETE CASCADE,

  -- Sync details
  sync_type VARCHAR(20) NOT NULL,  -- 'full' | 'incremental' | 'push' | 'pull'
  status VARCHAR(20) NOT NULL DEFAULT 'started',  -- 'started' | 'completed' | 'failed'

  -- Results
  events_pulled INTEGER DEFAULT 0,
  events_pushed INTEGER DEFAULT 0,
  events_updated INTEGER DEFAULT 0,
  events_deleted INTEGER DEFAULT 0,
  conflicts_found INTEGER DEFAULT 0,
  conflicts_resolved INTEGER DEFAULT 0,

  -- Error tracking
  error_message TEXT,
  error_details JSONB,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT valid_sync_type CHECK (sync_type IN ('full', 'incremental', 'push', 'pull')),
  CONSTRAINT valid_sync_status CHECK (status IN ('started', 'completed', 'failed'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sync_history_account ON google_sync_history (google_account_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_calendar ON google_sync_history (google_calendar_id) WHERE google_calendar_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_history_time ON google_sync_history (started_at DESC);

-- Comments
COMMENT ON TABLE google_sync_history IS 'Audit log of Google Calendar sync operations';
COMMENT ON COLUMN google_sync_history.sync_type IS 'full: complete resync, incremental: delta, push/pull: one direction';
