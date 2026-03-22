-- Migration 032: Commitment Candidates (Phase 4)
--
-- Adds candidate workflow for commitments:
-- - Commitments start as 'candidate' status
-- - User confirms → 'open' (active)
-- - User dismisses → 'dismissed'
-- - 24h no response → 'expired'
--
-- This prevents false positives from becoming tracked tasks.

-- Add new statuses to the constraint
ALTER TABLE commitments DROP CONSTRAINT IF EXISTS valid_commitment_status;
ALTER TABLE commitments ADD CONSTRAINT valid_commitment_status CHECK (status IN (
  'candidate', 'open', 'in_progress', 'completed', 'canceled', 'snoozed', 'dismissed', 'expired'
));

-- Add columns for candidate workflow
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS confirmation_offered_at TIMESTAMPTZ;
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS auto_expires_at TIMESTAMPTZ;

-- Index for finding candidates to surface
CREATE INDEX IF NOT EXISTS idx_commitments_candidates 
  ON commitments (status, created_at) 
  WHERE status = 'candidate';

-- Index for expiration job
CREATE INDEX IF NOT EXISTS idx_commitments_expiring 
  ON commitments (auto_expires_at) 
  WHERE status = 'candidate' AND auto_expires_at IS NOT NULL;

-- Update existing 'open' commitments to remain as 'open' (they're already confirmed)
-- New commitments will start as 'candidate'

COMMENT ON COLUMN commitments.confirmation_offered_at IS 'When user was asked to confirm this candidate';
COMMENT ON COLUMN commitments.auto_expires_at IS 'When this candidate auto-expires if not confirmed';
