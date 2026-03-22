// ============================================
// SQUIRE WEB - LISTS API CLIENT
// ============================================

import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type {
  List,
  ListWithItems,
  ListItem,
  CreateListInput,
  CreateListItemInput,
} from '@/lib/types';

// ============================================
// Lists API Functions
// ============================================

interface ListListOptions {
  category?: string;
  entity_id?: string;
  is_pinned?: boolean;
  list_type?: 'checklist' | 'simple' | 'ranked';
  limit?: number;
  offset?: number;
}

/**
 * List all lists with optional filters
 */
export async function fetchLists(options: ListListOptions = {}): Promise<List[]> {
  const params: Record<string, string | number | boolean | undefined> = {};
  if (options.category) params.category = options.category;
  if (options.entity_id) params.entity_id = options.entity_id;
  if (options.is_pinned !== undefined) params.is_pinned = options.is_pinned;
  if (options.list_type) params.list_type = options.list_type;
  if (options.limit) params.limit = options.limit;
  if (options.offset) params.offset = options.offset;

  const response = await apiGet<{ lists: List[] }>('/api/lists', { params });
  return response.lists;
}

/**
 * Get a list with all its items
 */
export async function fetchListWithItems(id: string): Promise<ListWithItems> {
  return apiGet<ListWithItems>(`/api/lists/${id}`, { params: { items: true } });
}

/**
 * Create a new list
 */
export async function createList(input: CreateListInput): Promise<List> {
  return apiPost<List, CreateListInput>('/api/lists', input);
}

/**
 * Update an existing list
 */
export async function updateList(
  id: string,
  input: Partial<CreateListInput>
): Promise<List> {
  return apiPatch<List, Partial<CreateListInput>>(`/api/lists/${id}`, input);
}

/**
 * Archive a list (soft delete)
 */
export async function archiveList(id: string): Promise<void> {
  await apiPost<void>(`/api/lists/${id}/archive`);
}

/**
 * Delete a list permanently
 */
export async function deleteList(id: string): Promise<void> {
  await apiDelete<void>(`/api/lists/${id}`);
}

/**
 * Complete all items in a list
 */
export async function completeAllItems(listId: string): Promise<void> {
  await apiPost<void>(`/api/lists/${listId}/complete-all`);
}

/**
 * Clear completed items from a list
 */
export async function clearCompletedItems(listId: string): Promise<void> {
  await apiPost<void>(`/api/lists/${listId}/clear-completed`);
}

/**
 * Reorder items in a list
 */
export async function reorderItems(
  listId: string,
  itemIds: string[]
): Promise<void> {
  await apiPost<void>(`/api/lists/${listId}/reorder`, { item_ids: itemIds });
}

// ============================================
// List Items API Functions
// ============================================

/**
 * Add an item to a list
 */
export async function addItem(
  listId: string,
  input: CreateListItemInput
): Promise<ListItem> {
  return apiPost<ListItem, CreateListItemInput>(
    `/api/lists/${listId}/items`,
    input
  );
}

/**
 * Update an item
 */
export async function updateItem(
  listId: string,
  itemId: string,
  input: Partial<CreateListItemInput>
): Promise<ListItem> {
  return apiPatch<ListItem, Partial<CreateListItemInput>>(
    `/api/lists/${listId}/items/${itemId}`,
    input
  );
}

/**
 * Delete an item
 */
export async function deleteItem(listId: string, itemId: string): Promise<void> {
  await apiDelete<void>(`/api/lists/${listId}/items/${itemId}`);
}

/**
 * Toggle item completion
 */
export async function toggleItem(
  listId: string,
  itemId: string
): Promise<ListItem> {
  return apiPost<ListItem>(`/api/lists/${listId}/items/${itemId}/toggle`);
}

/**
 * Export a list
 */
export async function exportList(
  id: string,
  format: 'json' | 'markdown' | 'csv' | 'txt' = 'markdown'
): Promise<Blob> {
  const response = await fetch(`/api/lists/${id}/export?format=${format}`);
  if (!response.ok) {
    throw new Error('Failed to export list');
  }
  return response.blob();
}

/**
 * Export all lists
 */
export async function exportAllLists(
  format: 'json' | 'markdown' | 'csv' = 'markdown',
  options: { entity_id?: string; category?: string } = {}
): Promise<Blob> {
  const params: Record<string, string | undefined> = {
    format,
    ...options,
  };

  const response = await fetch(
    `/api/lists/export?${new URLSearchParams(params as Record<string, string>).toString()}`
  );

  if (!response.ok) {
    throw new Error('Failed to export lists');
  }

  return response.blob();
}
