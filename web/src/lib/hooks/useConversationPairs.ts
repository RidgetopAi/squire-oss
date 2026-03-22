import { useMemo } from 'react';
import type { ChatMessage, ConversationPair } from '@/lib/types';

/**
 * Derive conversation pairs from a flat messages array.
 * Groups user messages with their following assistant response.
 * Pure derivation — does not modify the store.
 */
export function useConversationPairs(
  messages: ChatMessage[],
  streamingMessageId?: string | null
): ConversationPair[] {
  return useMemo(() => {
    const pairs: ConversationPair[] = [];
    let i = 0;

    while (i < messages.length) {
      const msg = messages[i];

      // Skip system messages
      if (msg.role === 'system') {
        i++;
        continue;
      }

      if (msg.role === 'user') {
        // Look for the next assistant message
        const next = messages[i + 1];
        if (next && next.role === 'assistant') {
          pairs.push({
            id: `pair_${msg.id}`,
            userMessage: msg,
            assistantMessage: next,
            isStreaming: next.id === streamingMessageId,
          });
          i += 2;
        } else {
          // User message with no response yet (streaming or waiting)
          pairs.push({
            id: `pair_${msg.id}`,
            userMessage: msg,
            assistantMessage: null,
            isStreaming: true,
          });
          i++;
        }
      } else if (msg.role === 'assistant') {
        // Orphaned assistant message (no preceding user message)
        // Create a synthetic pair
        pairs.push({
          id: `pair_orphan_${msg.id}`,
          userMessage: {
            id: `synthetic_${msg.id}`,
            role: 'user',
            content: '',
            timestamp: msg.timestamp,
          },
          assistantMessage: msg,
          isStreaming: msg.id === streamingMessageId,
        });
        i++;
      } else {
        i++;
      }
    }

    return pairs;
  }, [messages, streamingMessageId]);
}
