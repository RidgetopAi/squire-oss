'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ListWithItems, ListItem, CreateListItemInput } from '@/lib/types';
import {
  fetchListWithItems,
  toggleItem,
  updateItem,
  deleteItem,
  addItem,
  reorderItems,
  completeAllItems,
  clearCompletedItems,
  exportList,
} from '@/lib/api/lists';
import { ListView } from './ListView';
import { formatRelativeTime } from '@/lib/utils/formatting';
import { ExportModal, type ExportFormat } from '@/components/common';

interface ListDetailViewProps {
  listId: string;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
}

const listTypeLabels: Record<string, string> = {
  checklist: 'Checklist',
  simple: 'Simple List',
  ranked: 'Ranked List',
};

export function ListDetailView({ listId, isOpen, onClose, onEdit }: ListDetailViewProps) {
  const [list, setList] = useState<ListWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    if (!list) return;
    const blob = await exportList(list.id, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = format === 'markdown' ? 'md' : format;
    const safeName = list.name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    a.download = `${safeName}-${new Date().toISOString().split('T')[0]}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadList = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchListWithItems(listId);
      setList(data);
    } catch (err) {
      console.error('Failed to load list:', err);
      setError('Failed to load list');
    } finally {
      setIsLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    if (isOpen && listId) {
      loadList();
    }
  }, [isOpen, listId, loadList]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  const handleToggleItem = async (item: ListItem) => {
    if (!list) return;
    try {
      const updated = await toggleItem(list.id, item.id);
      setList({
        ...list,
        items: list.items.map((i) => (i.id === item.id ? updated : i)),
      });
    } catch (err) {
      console.error('Failed to toggle item:', err);
    }
  };

  const handleUpdateItem = async (item: ListItem, content: string) => {
    if (!list) return;
    try {
      const updated = await updateItem(list.id, item.id, { content });
      setList({
        ...list,
        items: list.items.map((i) => (i.id === item.id ? updated : i)),
      });
    } catch (err) {
      console.error('Failed to update item:', err);
    }
  };

  const handleDeleteItem = async (item: ListItem) => {
    if (!list) return;
    try {
      await deleteItem(list.id, item.id);
      setList({
        ...list,
        items: list.items.filter((i) => i.id !== item.id),
      });
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const handleAddItem = async (content: string) => {
    if (!list) return;
    try {
      const newItem = await addItem(list.id, { content });
      setList({
        ...list,
        items: [...list.items, newItem],
      });
    } catch (err) {
      console.error('Failed to add item:', err);
    }
  };

  const handleReorderItems = async (itemIds: string[]) => {
    if (!list) return;
    try {
      await reorderItems(list.id, itemIds);
    } catch (err) {
      console.error('Failed to reorder items:', err);
    }
  };

  const handleCompleteAll = async () => {
    if (!list) return;
    try {
      await completeAllItems(list.id);
      await loadList();
    } catch (err) {
      console.error('Failed to complete all:', err);
    }
  };

  const handleClearCompleted = async () => {
    if (!list) return;
    try {
      await clearCompletedItems(list.id);
      await loadList();
    } catch (err) {
      console.error('Failed to clear completed:', err);
    }
  };

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Slide-out panel */}
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ duration: 0.2 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-xl z-50 glass border-l border-glass-border flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-glass-border">
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-background-tertiary transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {list && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{list.name}</h2>
                    <p className="text-xs text-foreground-muted">
                      {listTypeLabels[list.list_type]} · Updated {formatRelativeTime(list.updated_at)}
                    </p>
                  </div>
                )}
              </div>
              {list && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
                    title="Export list"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                  <button
                    onClick={onEdit}
                    className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
                    title="Edit list"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="animate-pulse h-12 bg-background-tertiary rounded-lg" />
                  ))}
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-red-400 mb-2">{error}</p>
                  <button onClick={loadList} className="text-primary hover:underline">
                    Retry
                  </button>
                </div>
              ) : list ? (
                <>
                  {/* Description */}
                  {list.description && (
                    <p className="text-sm text-foreground-muted mb-4">{list.description}</p>
                  )}

                  {/* Entity badge */}
                  {list.primary_entity && (
                    <div className="mb-4">
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/30">
                        {list.primary_entity.name}
                      </span>
                    </div>
                  )}

                  {/* List view */}
                  <ListView
                    list={list}
                    onToggleItem={handleToggleItem}
                    onUpdateItem={handleUpdateItem}
                    onDeleteItem={handleDeleteItem}
                    onAddItem={handleAddItem}
                    onReorderItems={handleReorderItems}
                    onCompleteAll={handleCompleteAll}
                    onClearCompleted={handleClearCompleted}
                  />
                </>
              ) : null}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        title={`Export "${list?.name || 'List'}"`}
        formats={['json', 'markdown', 'csv', 'txt']}
      />
    </>
  );
}

export default ListDetailView;
