'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getSocketInstance,
  getConnectionStatus,
  type ChatChunkPayload,
  type ChatDonePayload,
  type ChatErrorPayload,
} from './useWebSocket';
import type { StoredDocument } from '@/lib/api/documents';

interface DiscussionMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface UseDocumentDiscussionReturn {
  messages: DiscussionMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
}

function generateId(): string {
  return `ddm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function useDocumentDiscussion(document: StoredDocument | null): UseDocumentDiscussionReturn {
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string>('');

  // Generate a stable conversation ID per document
  useEffect(() => {
    if (document) {
      conversationIdRef.current = `doc-discuss-${document.id}-${Date.now()}`;
      setMessages([]);
      setError(null);
    }
  }, [document]);

  // Set up WebSocket listeners
  useEffect(() => {
    if (!document) return;

    const { connected } = getConnectionStatus();
    if (!connected) return;

    const socket = getSocketInstance();

    const handleChunk = (payload: ChatChunkPayload) => {
      if (payload.conversationId !== conversationIdRef.current) return;

      setIsStreaming(true);
      setIsLoading(false);

      const sid = streamingIdRef.current;
      if (!sid) return;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === sid ? { ...m, content: m.content + payload.chunk } : m
        )
      );
    };

    const handleDone = (payload: ChatDonePayload) => {
      if (payload.conversationId !== conversationIdRef.current) return;
      setIsStreaming(false);
      setIsLoading(false);
      streamingIdRef.current = null;
    };

    const handleError = (payload: ChatErrorPayload) => {
      if (payload.conversationId !== conversationIdRef.current) return;
      setError(payload.error);
      setIsStreaming(false);
      setIsLoading(false);
      streamingIdRef.current = null;
    };

    socket.on('chat:chunk', handleChunk);
    socket.on('chat:done', handleDone);
    socket.on('chat:error', handleError);

    return () => {
      socket.off('chat:chunk', handleChunk);
      socket.off('chat:done', handleDone);
      socket.off('chat:error', handleError);
    };
  }, [document]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!document || !content.trim()) return;

      const { connected } = getConnectionStatus();
      if (!connected) {
        setError('Not connected. Please try again.');
        return;
      }

      setError(null);

      // Add user message
      const userMsg: DiscussionMessage = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      // Add empty assistant message for streaming
      const assistantId = generateId();
      const assistantMsg: DiscussionMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };

      streamingIdRef.current = assistantId;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      // Build history from existing messages (exclude the empty streaming message)
      const history = messages
        .filter((m) => m.content.length > 0)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      // Emit via WebSocket
      const socket = getSocketInstance();
      socket.emit('chat:message', {
        conversationId: conversationIdRef.current,
        message: content.trim(),
        history,
        includeContext: false,
        documentId: document.id,
      });
    },
    [document, messages]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    streamingIdRef.current = null;
  }, []);

  return { messages, isLoading, isStreaming, error, sendMessage, clearMessages };
}
