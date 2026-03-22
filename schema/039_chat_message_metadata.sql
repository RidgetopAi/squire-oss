-- Add metadata JSONB column to chat_messages for storing report data and other extras
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
