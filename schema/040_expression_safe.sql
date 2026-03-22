-- Migration 040: Add expression_safe column to memories
--
-- Pre-computed expression safety verdict from local Ollama model.
-- Replaces the runtime LLM filter that added 5-15s per message.
--
-- NULL = not yet evaluated (fail-open: treated as safe)
-- TRUE = safe to surface in conversation
-- FALSE = should be blocked from expression

ALTER TABLE memories ADD COLUMN IF NOT EXISTS expression_safe BOOLEAN DEFAULT NULL;

-- Partial index for efficient filtering in context queries
CREATE INDEX IF NOT EXISTS idx_memories_expression_safe
  ON memories (expression_safe)
  WHERE expression_safe IS NOT NULL;
