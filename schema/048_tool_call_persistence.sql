-- Tool Call Persistence: Store tool calls and results in chat history
-- so the model has full awareness of what it did within a session.
-- Fixes the double-entry bug where tool actions were invisible next turn.

-- Add tool_call_id column for tool result messages
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS tool_call_id TEXT DEFAULT NULL;

-- Add tool_calls column for assistant messages that include tool calls
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS tool_calls JSONB DEFAULT NULL;

-- Update role constraint to allow 'tool' role
ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_role_check;

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_role_check
  CHECK (role IN ('user', 'assistant', 'system', 'tool'));

-- Index for looking up tool results by tool_call_id
CREATE INDEX IF NOT EXISTS idx_chat_messages_tool_call_id
  ON chat_messages (tool_call_id)
  WHERE tool_call_id IS NOT NULL;
