'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { List, CreateListInput } from '@/lib/types';
import {
  fetchLists,
  createList,
  updateList,
  archiveList,
  deleteList,
} from '@/lib/api/lists';
import { ListsList, ListEditor, ListDetailView } from '@/components/lists';

function ListsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openListId = searchParams.get('open');

  const [lists, setLists] = useState<List[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingList, setEditingList] = useState<List | null>(null);
  const [detailListId, setDetailListId] = useState<string | null>(openListId);

  const loadLists = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchLists({ limit: 100 });
      setLists(data);
    } catch (err) {
      console.error('Failed to load lists:', err);
      setError('Failed to load lists');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    if (openListId) {
      setDetailListId(openListId);
    }
  }, [openListId]);

  const handleOpen = (list: List) => {
    setDetailListId(list.id);
    router.push(`/app/lists?open=${list.id}`, { scroll: false });
  };

  const handleCloseDetail = () => {
    setDetailListId(null);
    router.push('/app/lists', { scroll: false });
  };

  const handleEdit = (list: List) => {
    setEditingList(list);
    setEditorOpen(true);
  };

  const handleEditFromDetail = () => {
    if (detailListId) {
      const list = lists.find((l) => l.id === detailListId);
      if (list) {
        handleEdit(list);
      }
    }
  };

  const handleCreateNew = () => {
    setEditingList(null);
    setEditorOpen(true);
  };

  const handleSave = async (input: CreateListInput, listId?: string) => {
    if (listId) {
      const updated = await updateList(listId, input);
      setLists((prev) =>
        prev.map((l) => (l.id === listId ? updated : l))
      );
    } else {
      const created = await createList(input);
      setLists((prev) => [created, ...prev]);
    }
  };

  const handleArchive = async (list: List) => {
    if (!confirm('Archive this list?')) return;
    try {
      await archiveList(list.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
    } catch (err) {
      console.error('Failed to archive list:', err);
    }
  };

  const handleDelete = async (list: List) => {
    if (!confirm('Permanently delete this list? This cannot be undone.')) return;
    try {
      await deleteList(list.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
    } catch (err) {
      console.error('Failed to delete list:', err);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lists</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Organize tasks and track progress
          </p>
        </div>
        <button
          onClick={handleCreateNew}
          className="
            inline-flex items-center gap-2 px-4 py-2 rounded-lg
            bg-primary text-white
            hover:bg-primary/90 transition-colors
          "
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New List
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
          {error}
          <button
            onClick={loadLists}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Lists grid */}
      <ListsList
        lists={lists}
        isLoading={isLoading}
        onOpen={handleOpen}
        onEdit={handleEdit}
        onArchive={handleArchive}
        onDelete={handleDelete}
      />

      {/* List editor modal */}
      <ListEditor
        list={editingList}
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingList(null);
        }}
        onSave={handleSave}
      />

      {/* List detail slide-out */}
      {detailListId && (
        <ListDetailView
          listId={detailListId}
          isOpen={!!detailListId}
          onClose={handleCloseDetail}
          onEdit={handleEditFromDetail}
        />
      )}
    </div>
  );
}

export default function ListsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <ListsPageContent />
    </Suspense>
  );
}
