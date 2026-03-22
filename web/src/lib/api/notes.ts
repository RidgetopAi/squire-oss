// ============================================
// SQUIRE WEB - NOTES API CLIENT
// ============================================

import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type {
  Note,
  CreateNoteInput,
  UpdateNoteInput,
  ListNotesOptions,
} from '@/lib/types';

// ============================================
// Notes API Functions
// ============================================

/**
 * List notes with optional filters
 */
export async function fetchNotes(options: ListNotesOptions = {}): Promise<Note[]> {
  const params: Record<string, string | number | boolean | undefined> = {};
  if (options.category) params.category = options.category;
  if (options.entity_id) params.entity_id = options.entity_id;
  if (options.is_pinned !== undefined) params.is_pinned = options.is_pinned;
  if (options.limit) params.limit = options.limit;
  if (options.offset) params.offset = options.offset;

  const response = await apiGet<{ notes: Note[] }>('/api/notes', { params });
  return response.notes;
}

/**
 * Get pinned notes
 */
export async function fetchPinnedNotes(): Promise<Note[]> {
  const response = await apiGet<{ notes: Note[] }>('/api/notes/pinned');
  return response.notes;
}

/**
 * Create a new note
 */
export async function createNote(input: CreateNoteInput): Promise<Note> {
  return apiPost<Note, CreateNoteInput>('/api/notes', input);
}

/**
 * Update an existing note
 */
export async function updateNote(id: string, input: UpdateNoteInput): Promise<Note> {
  return apiPatch<Note, UpdateNoteInput>(`/api/notes/${id}`, input);
}

/**
 * Archive a note (soft delete)
 */
export async function archiveNote(id: string): Promise<void> {
  await apiPost<void>(`/api/notes/${id}/archive`);
}

/**
 * Delete a note permanently
 */
export async function deleteNote(id: string): Promise<void> {
  await apiDelete<void>(`/api/notes/${id}`);
}

/**
 * Pin a note
 */
export async function pinNote(id: string): Promise<Note> {
  return apiPost<Note>(`/api/notes/${id}/pin`);
}

/**
 * Unpin a note
 */
export async function unpinNote(id: string): Promise<Note> {
  return apiPost<Note>(`/api/notes/${id}/unpin`);
}

/**
 * Export notes
 */
export async function exportNotes(
  format: 'json' | 'markdown' | 'csv' = 'markdown',
  options: { entity_id?: string; category?: string } = {}
): Promise<Blob> {
  const params: Record<string, string | undefined> = {
    format,
    ...options,
  };

  const response = await fetch(
    `/api/notes/export?${new URLSearchParams(params as Record<string, string>).toString()}`
  );

  if (!response.ok) {
    throw new Error('Failed to export notes');
  }

  return response.blob();
}
