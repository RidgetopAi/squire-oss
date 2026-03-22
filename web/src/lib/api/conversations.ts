// ============================================
// SQUIRE WEB - CONVERSATIONS API
// ============================================

import { apiGet, apiPost } from './client';

// === API Response Types ===

export interface ConversationResponse {
  id: string;
  client_id: string | null;
  session_id: string | null;
  title: string | null;
  status: 'active' | 'archived' | 'deleted';
  message_count: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface MessageResponse {
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
  created_at: string;
  extraction_status: 'pending' | 'skipped' | 'extracted';
  metadata: Record<string, unknown> | null;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// === Conversation API Functions ===

/**
 * Fetch the most recent conversation with its messages
 * Used for loading chat history on page load
 */
export async function fetchRecentConversation(): Promise<{
  conversation: ConversationResponse;
  messages: MessageResponse[];
} | null> {
  const response = await apiGet<ApiResponse<{
    conversation: ConversationResponse;
    messages: MessageResponse[];
  } | null>>('/api/chat/conversations/recent');

  return response.data;
}

/**
 * Create a new conversation
 */
export async function createConversation(input: {
  clientId?: string;
  title?: string;
}): Promise<ConversationResponse> {
  const response = await apiPost<ApiResponse<ConversationResponse>>(
    '/api/chat/conversations',
    input
  );

  return response.data;
}

