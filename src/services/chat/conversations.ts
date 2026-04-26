import { pool } from '../../db/pool.js';
import { getOrCreateSession } from '../sessions.js';

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
  role: 'user' | 'assistant' | 'system' | 'tool';
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
  tool_call_id: string | null;
  tool_calls: unknown[] | null;
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

export interface PersistToolTurnInput {
  conversationId: string;
  /** Assistant-turn text that preceded the tool calls (may be empty) */
  assistantContent: string;
  toolCalls: unknown[];
  results: Array<{ toolCallId: string; toolName: string; content: string }>;
}

/**
 * Persist one tool turn atomically: the assistant message with tool_calls
 * followed by each tool result, all under one transaction on a single
 * client connection.
 *
 * Why atomic: sequence numbers are computed as MAX(sequence_number)+1.
 * If the assistant row and tool rows were written under separate pool
 * clients, a concurrent writer (e.g. the user's next message) could steal
 * a sequence number in the middle and land a 'user' row between the
 * assistant's tool_use and the corresponding tool_results. Anthropic's
 * API rejects that shape. Taking one client and holding BEGIN/COMMIT
 * guarantees contiguous sequence numbers.
 */
export async function persistToolTurn(input: PersistToolTurnInput): Promise<void> {
  const { conversationId, assistantContent, toolCalls, results } = input;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seqResult = await client.query(
      `SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq
       FROM chat_messages WHERE conversation_id = $1`,
      [conversationId]
    );
    let sequenceNumber: number = seqResult.rows[0].next_seq;

    await client.query(
      `INSERT INTO chat_messages (
        conversation_id, role, content, sequence_number,
        tool_calls, extraction_status
      ) VALUES ($1, 'assistant', $2, $3, $4, 'skipped')`,
      [conversationId, assistantContent, sequenceNumber, JSON.stringify(toolCalls)]
    );
    sequenceNumber += 1;

    for (const result of results) {
      await client.query(
        `INSERT INTO chat_messages (
          conversation_id, role, content, sequence_number,
          tool_call_id, extraction_status, metadata
        ) VALUES ($1, 'tool', $2, $3, $4, 'skipped', $5)`,
        [
          conversationId,
          result.content,
          sequenceNumber,
          result.toolCallId,
          JSON.stringify({ tool_name: result.toolName }),
        ]
      );
      sequenceNumber += 1;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

type ContextMessage = { role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string };

/**
 * Get recent messages for a conversation including tool messages,
 * formatted for injection into the LLM message array.
 *
 * Returns the last N messages ordered chronologically, and — critically —
 * trims the leading edge so it never starts with an orphan tool_result or
 * an assistant(tool_calls) whose results were truncated off by the LIMIT.
 *
 * Anthropic's Messages API requires every tool_result to be immediately
 * preceded by an assistant message whose tool_use ids match. If we hand
 * it a history that starts mid-tool-turn, it returns a 400 on the first
 * call. The trim below guarantees the first message returned is a safe
 * boundary: either a user message, or a plain assistant message (no
 * tool_calls), or a complete assistant(tool_calls) with all of its
 * tool_result messages present in the window.
 */
export async function getRecentMessagesForContext(
  conversationId: string,
  limit = 60
): Promise<ContextMessage[]> {
  const result = await pool.query(
    `SELECT role, content, tool_calls, tool_call_id
     FROM chat_messages
     WHERE conversation_id = $1
     ORDER BY sequence_number DESC
     LIMIT $2`,
    [conversationId, limit]
  );

  // Back to chronological order
  const rows = (result.rows as Array<{
    role: string;
    content: string;
    tool_calls: unknown[] | null;
    tool_call_id: string | null;
  }>).reverse();

  const msgs: ContextMessage[] = rows.map((row) => {
    const m: ContextMessage = { role: row.role, content: row.content };
    if (row.tool_calls) m.tool_calls = row.tool_calls;
    if (row.tool_call_id) m.tool_call_id = row.tool_call_id;
    return m;
  });

  // Find the first safe starting index. Walk forward and stop at a row
  // that can legally be the first message sent to the provider.
  let start = 0;
  while (start < msgs.length) {
    const m = msgs[start]!;
    if (m.role === 'tool') {
      start += 1;
      continue;
    }
    if (m.role === 'assistant' && m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const expectedIds = new Set(
        (m.tool_calls as Array<{ id?: string }>).map((tc) => tc?.id).filter((id): id is string => Boolean(id))
      );
      // Gather tool_call_ids from the immediately following run of tool messages
      const presentIds = new Set<string>();
      let j = start + 1;
      while (j < msgs.length && msgs[j]!.role === 'tool') {
        const tcid = msgs[j]!.tool_call_id;
        if (tcid) presentIds.add(tcid);
        j += 1;
      }
      const allPresent = [...expectedIds].every((id) => presentIds.has(id));
      if (allPresent) break;
      // tool_results were sliced off — skip this orphan assistant and its dangling tool rows, if any
      start = j;
      continue;
    }
    // role === 'user' or plain 'assistant' → safe boundary
    break;
  }

  return start === 0 ? msgs : msgs.slice(start);
}
