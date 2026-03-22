// ============================================
// SQUIRE WEB - CONTEXT API CLIENT
// ============================================

import { apiPost } from './client';
import type { ContextPackage } from '@/lib/types';

// === Request Types ===

export interface FetchContextRequest {
  query?: string;
  profile?: string;
  max_tokens?: number;
  conversation_id?: string;
}

// === API Functions ===

/**
 * Fetch context package for a query
 * Uses POST for complex requests with optional query embedding
 */
export async function fetchContext(
  request: FetchContextRequest = {}
): Promise<ContextPackage> {
  return apiPost<ContextPackage>('/api/context', request);
}

