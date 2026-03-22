// ============================================
// SQUIRE WEB - CHAT API CLIENT
// ============================================

import { apiPost } from './client';
import type { ChatMessage } from '@/lib/types';

// === Request/Response Types ===

export interface ImageContent {
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

export interface ChatApiRequest {
  message: string;
  images?: ImageContent[];
  history?: ChatMessage[];
  includeContext?: boolean;
  contextQuery?: string;
  contextProfile?: string;
  maxContextTokens?: number;
}

export interface ChatContextInfo {
  memoryCount: number;
  entityCount: number;
  summaryCount: number;
  tokenCount: number;
  disclosureId: string;
}

export interface ChatApiResponse {
  message: string;
  role: 'assistant';
  context?: ChatContextInfo;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

// === API Functions ===

/**
 * Send a chat message and get a response
 * Full-featured with memory context injection
 */
export async function sendChatMessage(
  request: ChatApiRequest
): Promise<ChatApiResponse> {
  const response = await apiPost<ApiSuccessResponse<ChatApiResponse>>(
    '/api/chat',
    request
  );
  return response.data;
}



/**
 * Convert ChatMessage array to the format expected by the API
 * (strips out client-side fields if needed)
 */
export function prepareHistoryForApi(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
  }));
}
