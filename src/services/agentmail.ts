/**
 * AgentMail Service
 *
 * Provides access to Squire's email inbox at squire@agentmail.to
 * AgentMail is an API-first email platform designed for AI agents.
 */

import fetch from 'node-fetch';
import { config } from '../config/index.js';

const BASE_URL = 'https://api.agentmail.to/v0';
const INBOX_ID = 'squireagent@agentmail.to';

export interface AgentMailAddress {
  email: string;
  name?: string;
}

export interface AgentMailMessage {
  message_id: string;
  inbox_id: string;
  from: AgentMailAddress[] | string;
  to: AgentMailAddress[] | string[];
  subject: string;
  text?: string;
  html?: string;
  preview?: string;
  timestamp: string;
  thread_id?: string;
  labels?: string[];
}

export interface AgentMailListResponse {
  messages: AgentMailMessage[];
  total?: number;
  count?: number;
}

/**
 * Make an API call to AgentMail
 */
async function apiCall(method: string, path: string, body?: object): Promise<any> {
  const apiKey = config.agentmail?.apiKey || process.env['AGENTMAIL_API_KEY'];

  if (!apiKey) {
    throw new Error('AGENTMAIL_API_KEY not configured');
  }

  const url = `${BASE_URL}${path}`;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AgentMail API error ${res.status}: ${text}`);
    }

    return res.json();
  } catch (error) {
    console.error('[AgentMail] API call failed:', { method, path, error });
    throw error;
  }
}

export const agentmail = {
  INBOX_ID,

  /**
   * List messages in Squire's inbox
   */
  async listMessages(limit = 20, page = 1): Promise<AgentMailListResponse> {
    console.log('[AgentMail] Listing messages', { limit, page });
    return apiCall('GET', `/inboxes/${encodeURIComponent(INBOX_ID)}/messages?limit=${limit}&page=${page}`);
  },

  /**
   * Get a specific message by ID
   */
  async getMessage(messageId: string): Promise<AgentMailMessage> {
    console.log('[AgentMail] Getting message', { messageId });
    return apiCall('GET', `/inboxes/${encodeURIComponent(INBOX_ID)}/messages/${messageId}`);
  },

  /**
   * Send an email from squire@agentmail.to
   */
  async sendMessage(to: string, subject: string, text: string, html?: string): Promise<AgentMailMessage> {
    console.log('[AgentMail] Sending message', { to, subject });
    return apiCall('POST', `/inboxes/${encodeURIComponent(INBOX_ID)}/messages/send`, { to, subject, text, html });
  },

  /**
   * Reply to a message
   */
  async replyToMessage(messageId: string, text: string, html?: string): Promise<AgentMailMessage> {
    console.log('[AgentMail] Replying to message', { messageId });
    return apiCall('POST', `/inboxes/${INBOX_ID}/messages/${messageId}/reply`, { text, html });
  },

  /**
   * Create the inbox (one-time setup)
   */
  async createInbox(): Promise<any> {
    console.log('[AgentMail] Creating inbox');
    return apiCall('POST', '/inboxes', { username: 'squire' });
  },
};
