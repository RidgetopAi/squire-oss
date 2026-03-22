/**
 * Commune Tools
 *
 * Tool for the commune agent to send messages to Brian via Telegram.
 * This is NOT a courier task - it's a tool the model can call during commune thinking.
 */

import {
  canSendNow,
  createCommuneEvent,
  markEventSent,
  markEventFailed,
  deliverMessage,
} from '../services/commune.js';
import type { ToolHandler, ToolSpec } from './types.js';

// =============================================================================
// COMMUNE SEND TOOL
// =============================================================================

interface CommuneSendArgs {
  message: string;
}

const handleCommuneSend: ToolHandler<CommuneSendArgs> = async (args) => {
  const { message } = args;

  if (!message || message.trim().length === 0) {
    return 'Error: message is required and cannot be empty.';
  }

  // Check rate limits
  const sendStatus = await canSendNow();
  if (!sendStatus.allowed) {
    return `Cannot send: ${sendStatus.reason}`;
  }

  // Record event
  const event = await createCommuneEvent({
    trigger_type: 'custom',
    message: message.trim(),
    channel: 'telegram',
    metadata: { source: 'commune_autonomous' },
  });

  // Deliver
  const result = await deliverMessage(message.trim(), 'telegram');

  if (result.success) {
    await markEventSent(event.id);
    return 'Message sent successfully.';
  } else {
    await markEventFailed(event.id, result.error ?? 'Unknown error');
    return `Failed to send: ${result.error}`;
  }
};

// =============================================================================
// TOOL SPECS EXPORT
// =============================================================================

export const tools: ToolSpec[] = [
  {
    name: 'commune_send',
    description:
      'Send a message to Brian via Telegram. Use sparingly and only when you have something genuine to share. Rate limits are enforced.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message to send to Brian',
        },
      },
      required: ['message'],
    },
    handler: handleCommuneSend as ToolHandler,
  },
];
