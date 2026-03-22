'use client';

import { useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/lib/hooks/useWebSocket';
import { joinConversationRoom } from '@/lib/hooks/useWebSocket';
import { initWebSocketListeners, useChatStore } from '@/lib/stores/chatStore';

// Debounce delay for graph invalidation (ms)
// Prevents rapid rebuilds during consolidation bursts
const GRAPH_INVALIDATION_DEBOUNCE = 2000;

interface WebSocketProviderProps {
  children: ReactNode;
}

/**
 * WebSocketProvider
 *
 * Initializes the WebSocket connection and wires up:
 * - Chat streaming listeners (P6-T4)
 * - Memory/Insight notification handlers with query invalidation (P6-T5)
 *
 * Must be rendered inside QueryClientProvider.
 */
export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const queryClient = useQueryClient();

  // Initialize the socket connection and get event subscription methods
  const { isConnected, onMemoryCreated, onInsightCreated } = useWebSocket();

  // Initialize chat streaming listeners
  useEffect(() => {
    const cleanup = initWebSocketListeners();
    return cleanup;
  }, []);

  // Load persisted chat history on mount
  useEffect(() => {
    useChatStore.getState().loadRecentConversation();
  }, []);

  // Debounced graph invalidation ref
  const graphInvalidationTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingGraphInvalidation = useRef(false);

  // Debounced function to invalidate graph queries
  const invalidateGraphQueries = useCallback(() => {
    // Mark that we have a pending invalidation
    pendingGraphInvalidation.current = true;

    // Clear existing timer if any
    if (graphInvalidationTimer.current) {
      clearTimeout(graphInvalidationTimer.current);
    }

    // Set new debounced timer
    graphInvalidationTimer.current = setTimeout(() => {
      if (pendingGraphInvalidation.current) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[WebSocketProvider] Invalidating graph queries (debounced)');
        }
        // Invalidate all graph-related queries (visualization, stats, subgraphs)
        queryClient.invalidateQueries({ queryKey: ['graph'] });
        pendingGraphInvalidation.current = false;
      }
    }, GRAPH_INVALIDATION_DEBOUNCE);
  }, [queryClient]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (graphInvalidationTimer.current) {
        clearTimeout(graphInvalidationTimer.current);
      }
    };
  }, []);

  // Handle memory:created events - invalidate memory and graph queries
  useEffect(() => {
    const unsubscribe = onMemoryCreated((payload) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[WebSocketProvider] memory:created', payload.memory.id);
      }

      // Invalidate all memory-related queries so lists refresh
      queryClient.invalidateQueries({ queryKey: ['memories'] });

      // Debounced invalidation of graph queries for Memory Village
      // This prevents rapid rebuilds during consolidation bursts
      invalidateGraphQueries();
    });

    return unsubscribe;
  }, [onMemoryCreated, queryClient, invalidateGraphQueries]);

  // Handle insight:created events - invalidate insight queries (P6-T5)
  useEffect(() => {
    const unsubscribe = onInsightCreated((payload) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[WebSocketProvider] insight:created', payload.insight.id);
      }

      // Invalidate all insight-related queries so lists refresh
      queryClient.invalidateQueries({ queryKey: ['insights'] });
    });

    return unsubscribe;
  }, [onInsightCreated, queryClient]);

  // Track connection state for reconnection detection
  const wasConnected = useRef(false);
  const hasEverConnected = useRef(false);

  // Rejoin conversation room on reconnection + reset stuck streaming state
  useEffect(() => {
    if (isConnected && !wasConnected.current) {
      const isReconnect = hasEverConnected.current;
      hasEverConnected.current = true;

      const state = useChatStore.getState();
      const conversationId = state.conversationId;

      // Rejoin conversation room
      if (conversationId) {
        console.log('[WebSocketProvider] Rejoining room after connect:', conversationId);
        joinConversationRoom(conversationId);
      }

      // On RECONNECT (not initial connect), reset stuck streaming state.
      // If we were streaming when the socket dropped, the server already
      // emitted chat:done to the old socket — we'll never receive it.
      if (isReconnect && (state.isStreaming || state.isLoading)) {
        // Brief delay to allow chat:done to arrive on the new socket
        // (server now broadcasts to room, so it may still arrive)
        const timeout = setTimeout(() => {
          const current = useChatStore.getState();
          if (current.isStreaming || current.isLoading) {
            console.log('[WebSocketProvider] Clearing stuck streaming state after reconnect');
            current.finishStreaming();
          }
        }, 3000);
        return () => clearTimeout(timeout);
      }
    }
    wasConnected.current = isConnected;
  }, [isConnected]);

  // Log connection status in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[WebSocketProvider] Connected:', isConnected);
    }
  }, [isConnected]);

  return <>{children}</>;
}
