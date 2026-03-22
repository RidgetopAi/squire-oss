-- Conversation Mode: Route extraction differently based on conversation context
-- Phase 1 of memory extraction false-positive reduction
--
-- Modes:
--   personal  - Personal life, relationships, health, emotions
--   work      - Professional tasks, projects, career
--   meta_ai   - Conversations about Squire/AI development (dev chatter)
--   other     - General conversation not fitting above categories
--
-- Purpose: Prevent dev chatter like "fix the issue" from polluting personal context

-- Add conversation_mode to memories
ALTER TABLE memories 
ADD COLUMN IF NOT EXISTS conversation_mode VARCHAR(20) DEFAULT 'other';

-- Add conversation_mode to commitments
ALTER TABLE commitments 
ADD COLUMN IF NOT EXISTS conversation_mode VARCHAR(20) DEFAULT 'other';

-- Add conversation_mode to reminders
ALTER TABLE reminders 
ADD COLUMN IF NOT EXISTS conversation_mode VARCHAR(20) DEFAULT 'other';

-- Add conversation_mode to beliefs
ALTER TABLE beliefs 
ADD COLUMN IF NOT EXISTS conversation_mode VARCHAR(20) DEFAULT 'other';

-- Constraint on valid modes
ALTER TABLE memories 
DROP CONSTRAINT IF EXISTS valid_conversation_mode;
ALTER TABLE memories 
ADD CONSTRAINT valid_conversation_mode 
CHECK (conversation_mode IN ('personal', 'work', 'meta_ai', 'other'));

ALTER TABLE commitments 
DROP CONSTRAINT IF EXISTS valid_commitment_conversation_mode;
ALTER TABLE commitments 
ADD CONSTRAINT valid_commitment_conversation_mode 
CHECK (conversation_mode IN ('personal', 'work', 'meta_ai', 'other'));

ALTER TABLE reminders 
DROP CONSTRAINT IF EXISTS valid_reminder_conversation_mode;
ALTER TABLE reminders 
ADD CONSTRAINT valid_reminder_conversation_mode 
CHECK (conversation_mode IN ('personal', 'work', 'meta_ai', 'other'));

ALTER TABLE beliefs 
DROP CONSTRAINT IF EXISTS valid_belief_conversation_mode;
ALTER TABLE beliefs 
ADD CONSTRAINT valid_belief_conversation_mode 
CHECK (conversation_mode IN ('personal', 'work', 'meta_ai', 'other'));

-- Index for filtering by mode in context queries
CREATE INDEX IF NOT EXISTS idx_memories_conversation_mode 
ON memories (conversation_mode);

CREATE INDEX IF NOT EXISTS idx_commitments_conversation_mode 
ON commitments (conversation_mode);

CREATE INDEX IF NOT EXISTS idx_reminders_conversation_mode 
ON reminders (conversation_mode);

CREATE INDEX IF NOT EXISTS idx_beliefs_conversation_mode 
ON beliefs (conversation_mode);

-- Comments
COMMENT ON COLUMN memories.conversation_mode IS 'Context mode: personal, work, meta_ai, or other. Used to filter dev chatter from personal context.';
COMMENT ON COLUMN commitments.conversation_mode IS 'Context mode: personal, work, meta_ai, or other. Used to filter dev chatter from personal context.';
COMMENT ON COLUMN reminders.conversation_mode IS 'Context mode: personal, work, meta_ai, or other. Used to filter dev chatter from personal context.';
COMMENT ON COLUMN beliefs.conversation_mode IS 'Context mode: personal, work, meta_ai, or other. Used to filter dev chatter from personal context.';
