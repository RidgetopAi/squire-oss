import { pool } from '../db/pool.js';
import { getOrCreateSession } from './sessions.js';

// =============================================
// TYPES
// =============================================

export interface Conversation {
  id: string;
  client_id: string | null;
  session_id: string | null;
  title: string | null;
  status: 'active' | 'archived' | 'deleted';
  message_count: number;
  total_tokens: number;
  created_at: Date;
  updated_at: Date;
  last_message_at: Date | null;
}

export interface ChatMessageDB {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  context_memory_ids: string[];
  disclosure_id: string | null;
  context_profile: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  sequence_number: number;
  created_at: Date;
  extraction_status: 'pending' | 'skipped' | 'extracted';
  extracted_at: Date | null;
  metadata: Record<string, unknown> | null;
}

export interface CreateConversationInput {
  clientId?: string;
  title?: string;
}

export interface AddMessageInput {
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  memoryIds?: string[];
  disclosureId?: string;
  contextProfile?: string;
  promptTokens?: number;
  completionTokens?: number;
  metadata?: Record<string, unknown> | null;
}

// =============================================
// CONVERSATION FUNCTIONS
// =============================================

/**
 * Create a new conversation
 */
export async function createConversation(
  input: CreateConversationInput = {}
): Promise<Conversation> {
  const session = await getOrCreateSession();

  const result = await pool.query(
    `INSERT INTO conversations (client_id, session_id, title)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.clientId ?? null, session.id, input.title ?? null]
  );

  return result.rows[0] as Conversation;
}

/**
 * Get a conversation by ID
 */
export async function getConversation(id: string): Promise<Conversation | null> {
  const result = await pool.query(
    `SELECT * FROM conversations WHERE id = $1 AND status != 'deleted'`,
    [id]
  );
  return (result.rows[0] as Conversation) ?? null;
}

/**
 * Get a conversation by client-generated ID
 */
export async function getConversationByClientId(
  clientId: string
): Promise<Conversation | null> {
  const result = await pool.query(
    `SELECT * FROM conversations WHERE client_id = $1 AND status != 'deleted'`,
    [clientId]
  );
  return (result.rows[0] as Conversation) ?? null;
}

/**
 * Get or create a conversation by client ID
 * Used when persisting messages - ensures conversation exists
 */
export async function getOrCreateConversation(
  clientId: string
): Promise<Conversation> {
  const existing = await getConversationByClientId(clientId);
  if (existing) return existing;
  return createConversation({ clientId });
}

/**
 * List conversations with optional filtering
 */
export async function listConversations(options: {
  limit?: number;
  offset?: number;
  status?: 'active' | 'archived';
} = {}): Promise<Conversation[]> {
  const { limit = 20, offset = 0, status = 'active' } = options;

  const result = await pool.query(
    `SELECT * FROM conversations
     WHERE status = $1
     ORDER BY COALESCE(last_message_at, created_at) DESC
     LIMIT $2 OFFSET $3`,
    [status, limit, offset]
  );

  return result.rows as Conversation[];
}

/**
 * Archive a conversation
 */
export async function archiveConversation(id: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE conversations
     SET status = 'archived', updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(
  id: string,
  title: string
): Promise<Conversation | null> {
  const result = await pool.query(
    `UPDATE conversations
     SET title = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, title]
  );
  return (result.rows[0] as Conversation) ?? null;
}

// =============================================
// MESSAGE FUNCTIONS
// =============================================

/**
 * Add a message to a conversation
 * Handles sequence numbering, stats update, and memory junction table
 */
export async function addMessage(input: AddMessageInput): Promise<ChatMessageDB> {
  const {
    conversationId,
    role,
    content,
    memoryIds = [],
    disclosureId,
    contextProfile,
    promptTokens,
    completionTokens,
    metadata,
  } = input;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get next sequence number
    const seqResult = await client.query(
      `SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq
       FROM chat_messages WHERE conversation_id = $1`,
      [conversationId]
    );
    const sequenceNumber = seqResult.rows[0].next_seq;

    // Insert message
    const messageResult = await client.query(
      `INSERT INTO chat_messages (
        conversation_id, role, content, context_memory_ids,
        disclosure_id, context_profile, prompt_tokens, completion_tokens,
        sequence_number, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        conversationId,
        role,
        content,
        memoryIds,
        disclosureId ?? null,
        contextProfile ?? null,
        promptTokens ?? null,
        completionTokens ?? null,
        sequenceNumber,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    const message = messageResult.rows[0] as ChatMessageDB;

    // Insert junction table entries for memory linkage
    if (memoryIds.length > 0) {
      const values = memoryIds
        .map((_, i) => `($1, $${i + 2}, 'context')`)
        .join(', ');

      await client.query(
        `INSERT INTO chat_message_memories (message_id, memory_id, usage_type)
         VALUES ${values}
         ON CONFLICT (message_id, memory_id) DO NOTHING`,
        [message.id, ...memoryIds]
      );
    }

    // Update conversation stats
    const tokens = (promptTokens ?? 0) + (completionTokens ?? 0);
    await client.query(
      `UPDATE conversations SET
        message_count = message_count + 1,
        total_tokens = total_tokens + $2,
        last_message_at = NOW(),
        updated_at = NOW()
       WHERE id = $1`,
      [conversationId, tokens]
    );

    await client.query('COMMIT');
    return message;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get messages for a conversation
 */
export async function getMessages(
  conversationId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ChatMessageDB[]> {
  const { limit = 100, offset = 0 } = options;

  const result = await pool.query(
    `SELECT * FROM chat_messages
     WHERE conversation_id = $1
     ORDER BY sequence_number ASC
     LIMIT $2 OFFSET $3`,
    [conversationId, limit, offset]
  );

  return result.rows as ChatMessageDB[];
}

/**
 * Get the primary conversation with its messages
 * Used for loading chat history on page load.
 * Looks for the 'primary' conversation first (the main chat),
 * then falls back to the most recent non-document-discussion conversation.
 */
export async function getRecentConversationWithMessages(): Promise<{
  conversation: Conversation;
  messages: ChatMessageDB[];
} | null> {
  // First, look for the primary conversation (main chat)
  const primary = await getConversationByClientId('primary');
  if (primary && primary.status !== 'deleted') {
    const messages = await getMessages(primary.id, { limit: 10000 });
    return { conversation: primary, messages };
  }

  // Fallback: most recent conversation, excluding document discussions
  const result = await pool.query(
    `SELECT * FROM conversations
     WHERE status = 'active'
       AND (client_id IS NULL OR client_id NOT LIKE 'doc-discuss-%')
     ORDER BY COALESCE(last_message_at, created_at) DESC
     LIMIT 1`
  );
  const conversation = result.rows[0] as Conversation | undefined;
  if (!conversation) return null;

  const messages = await getMessages(conversation.id, { limit: 10000 });
  return { conversation, messages };
}

