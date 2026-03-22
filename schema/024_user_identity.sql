-- User Identity Table
-- Stores the single user's locked identity for this Squire instance.
-- Once set, the name is immutable unless explicitly changed via command.
-- This is a single-row table (one user per database).

CREATE TABLE IF NOT EXISTS user_identity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Core identity (immutable once locked)
  name VARCHAR(100) NOT NULL,

  -- Lock status
  is_locked BOOLEAN NOT NULL DEFAULT TRUE,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- How the identity was established
  source VARCHAR(50) NOT NULL DEFAULT 'auto_detection',
  -- Values: 'auto_detection', 'onboarding', 'manual', 'import', 'rename_command'

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- History of name changes (for audit)
  previous_names JSONB DEFAULT '[]'::jsonb
);

-- Ensure only one identity row exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_identity_singleton
  ON user_identity ((TRUE));

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_user_identity_name ON user_identity(name);

-- Comment explaining the single-row design
COMMENT ON TABLE user_identity IS
  'Single-row table storing the locked user identity. One user per Squire instance.';

COMMENT ON COLUMN user_identity.is_locked IS
  'When true, identity detection is skipped entirely. Only explicit rename can change.';

COMMENT ON COLUMN user_identity.previous_names IS
  'JSON array of {name, changed_at, reason} for audit trail.';
