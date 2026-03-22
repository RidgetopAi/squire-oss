-- Chat Persistence: Conversations and Messages
-- Stores chat history with memory linkage for context tracking and future extraction

-- =============================================
-- CONVERSATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Client-generated ID for backward compatibility with frontend
  client_id VARCHAR(100) UNIQUE,

  -- Session linkage (for consolidation)
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,

  -- Conversation metadata
  title VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active',

  -- Statistics (updated on each message)
  message_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_conversation_status CHECK (status IN ('active', 'archived', 'deleted'))
);

-- =============================================
-- CHAT MESSAGES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Conversation reference
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- Message content
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,

  -- Memory context (which memories were used for this message)
  context_memory_ids UUID[] DEFAULT '{}',

  -- Context metadata (full context is in disclosure_log)
  disclosure_id UUID,
  context_profile VARCHAR(100),

  -- Token usage (for analytics)
  prompt_tokens INTEGER,
  completion_tokens INTEGER,

  -- Ordering within conversation
  sequence_number INTEGER NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Future: extraction status for chat-to-memory flow
  extraction_status VARCHAR(20) DEFAULT 'pending',
  extracted_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_message_role CHECK (role IN ('user', 'assistant', 'system')),
  CONSTRAINT valid_extraction_status CHECK (extraction_status IN ('pending', 'skipped', 'extracted'))
);

-- =============================================
-- CHAT MESSAGE MEMORIES JUNCTION TABLE
-- Enables queries like "which messages used this memory?"
-- =============================================
CREATE TABLE IF NOT EXISTS chat_message_memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,

  -- How this memory was used
  usage_type VARCHAR(20) NOT NULL DEFAULT 'context',
  relevance_score FLOAT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicates
  CONSTRAINT unique_message_memory UNIQUE (message_id, memory_id),
  CONSTRAINT valid_usage_type CHECK (usage_type IN ('context', 'extracted', 'referenced'))
);

-- =============================================
-- INDEXES
-- =============================================

-- Conversations
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations (session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations (status);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON conversations (client_id);

-- Chat Messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON chat_messages (role);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sequence ON chat_messages (conversation_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_chat_messages_extraction ON chat_messages (extraction_status)
  WHERE extraction_status = 'pending';

-- Chat Message Memories
CREATE INDEX IF NOT EXISTS idx_cmm_message ON chat_message_memories (message_id);
CREATE INDEX IF NOT EXISTS idx_cmm_memory ON chat_message_memories (memory_id);

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON TABLE conversations IS 'Chat conversations with session and memory linkage';
COMMENT ON TABLE chat_messages IS 'Individual messages within conversations, linked to memory context';
COMMENT ON TABLE chat_message_memories IS 'Junction table linking messages to memories used in context';

COMMENT ON COLUMN conversations.client_id IS 'Frontend-generated ID for backward compatibility';
COMMENT ON COLUMN conversations.session_id IS 'Links to sessions table for consolidation';
COMMENT ON COLUMN chat_messages.context_memory_ids IS 'Quick access to memory IDs; full details via chat_message_memories';
COMMENT ON COLUMN chat_messages.disclosure_id IS 'Links to disclosure_log for full context audit trail';
COMMENT ON COLUMN chat_messages.extraction_status IS 'For future chat-to-memory extraction pipeline';
COMMENT ON COLUMN chat_message_memories.usage_type IS 'context=used for response, extracted=memory created from message, referenced=mentioned';
