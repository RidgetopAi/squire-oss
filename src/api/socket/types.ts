/**
 * Socket.IO Event Types (P6-T2)
 *
 * Type-safe definitions for all WebSocket events.
 */

// === CLIENT → SERVER EVENTS ===

export interface ImageContent {
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

export interface ChatMessagePayload {
  conversationId: string;
  message: string;
  images?: ImageContent[];
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  includeContext?: boolean;
  contextProfile?: string;
  documentId?: string; // Triggers document discussion mode
}

export interface ChatCancelPayload {
  conversationId: string;
}

export interface ConversationJoinPayload {
  conversationId: string;
}

export interface ConversationLeavePayload {
  conversationId: string;
}

export interface ClientToServerEvents {
  'chat:message': (payload: ChatMessagePayload) => void;
  'chat:cancel': (payload: ChatCancelPayload) => void;
  'conversation:join': (payload: ConversationJoinPayload) => void;
  'conversation:leave': (payload: ConversationLeavePayload) => void;
  'ping': (callback: () => void) => void;
}

// === SERVER → CLIENT EVENTS ===

export interface ChatChunkPayload {
  conversationId: string;
  chunk: string;
  done: boolean;
}

export interface ChatContextPayload {
  conversationId: string;
  memories: Array<{
    id: string;
    content: string;
    salience: number;
  }>;
  entities: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  summaries: string[];
}

export interface ChatErrorPayload {
  conversationId: string;
  error: string;
  code?: string;
}

export interface ChatDonePayload {
  conversationId: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
  reportData?: {
    title: string;
    summary: string;
    content: string;
    generatedAt: string;
  };
}

export interface MemoryCreatedPayload {
  memory: {
    id: string;
    content: string;
    salience: number;
    source: string;
    created_at: string;
  };
}

export interface InsightCreatedPayload {
  insight: {
    id: string;
    content: string;
    type: string;
    priority: string;
    created_at: string;
  };
}

export interface ConnectionStatusPayload {
  connected: boolean;
  socketId?: string;
  latency?: number;
}

export interface CommitmentCreatedPayload {
  id: string;
  title: string;
}

export interface ReminderCreatedPayload {
  id: string;
  title: string;
  remind_at: string;
}

export interface EmailSummaryPayload {
  summary: {
    count: number;
    emails: Array<{ from: string; subject: string; summary: string }>;
  };
}

export interface MessageSyncedPayload {
  conversationId: string;
  message: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  };
  // Socket ID of the originator (so they can ignore their own messages)
  originSocketId?: string;
}

export interface ServerToClientEvents {
  'chat:chunk': (payload: ChatChunkPayload) => void;
  'chat:context': (payload: ChatContextPayload) => void;
  'chat:error': (payload: ChatErrorPayload) => void;
  'chat:done': (payload: ChatDonePayload) => void;
  'memory:created': (payload: MemoryCreatedPayload) => void;
  'insight:created': (payload: InsightCreatedPayload) => void;
  'connection:status': (payload: ConnectionStatusPayload) => void;
  'commitment:created': (payload: CommitmentCreatedPayload) => void;
  'commitment:candidate': (payload: CommitmentCreatedPayload) => void; // Phase 4: candidate offered
  'commitment:dismissed': (payload: CommitmentCreatedPayload) => void; // Phase 4: candidate dismissed
  'reminder:created': (payload: ReminderCreatedPayload) => void;
  'message:synced': (payload: MessageSyncedPayload) => void;
  'email:summary': (payload: EmailSummaryPayload) => void;
}

// === SOCKET DATA ===

export interface SocketData {
  userId?: string;
  connectedAt: Date;
}
