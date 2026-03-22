/**
 * Broadcast Module (P6-T5)
 *
 * Holds a reference to the Socket.IO server and provides
 * broadcast functions that services can call safely without
 * circular import issues.
 */

import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, SocketData } from './types.js';

type TypedIO = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

// Singleton reference to Socket.IO server
let ioInstance: TypedIO | null = null;

/**
 * Set the Socket.IO server instance (called from server.ts on startup)
 */
export function setSocketServer(io: TypedIO): void {
  ioInstance = io;
  console.log('[Broadcast] Socket.IO server registered for broadcasts');
}

/**
 * Broadcast that a new memory was created
 */
export function broadcastMemoryCreated(memory: {
  id: string;
  content: string;
  salience_score: number;
  source: string;
  created_at: Date | string;
}): void {
  if (!ioInstance) {
    console.warn('[Broadcast] Cannot broadcast memory:created - Socket.IO not initialized');
    return;
  }

  ioInstance.emit('memory:created', {
    memory: {
      id: memory.id,
      content: memory.content,
      salience: memory.salience_score,
      source: memory.source,
      created_at: typeof memory.created_at === 'string'
        ? memory.created_at
        : memory.created_at.toISOString(),
    },
  });

  console.log(`[Broadcast] memory:created - ${memory.id}`);
}

/**
 * Broadcast that a new insight was created
 */
export function broadcastInsightCreated(insight: {
  id: string;
  content: string;
  insight_type: string;
  priority: string;
  created_at: Date | string;
}): void {
  if (!ioInstance) {
    console.warn('[Broadcast] Cannot broadcast insight:created - Socket.IO not initialized');
    return;
  }

  ioInstance.emit('insight:created', {
    insight: {
      id: insight.id,
      content: insight.content,
      type: insight.insight_type,
      priority: insight.priority,
      created_at: typeof insight.created_at === 'string'
        ? insight.created_at
        : insight.created_at.toISOString(),
    },
  });

  console.log(`[Broadcast] insight:created - ${insight.id}`);
}

/**
 * Broadcast email summary from Courier
 */
export function broadcastEmailSummary(summary: {
  count: number;
  emails: Array<{ from: string; subject: string; summary: string }>;
}): void {
  if (!ioInstance) {
    console.warn('[Broadcast] Cannot broadcast email:summary - Socket.IO not initialized');
    return;
  }

  ioInstance.emit('email:summary', { summary });
  console.log(`[Broadcast] email:summary - ${summary.count} emails`);
}
