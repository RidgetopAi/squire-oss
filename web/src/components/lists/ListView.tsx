'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import type { ListWithItems, ListItem, ListType } from '@/lib/types';
import { ListItemRow } from './ListItemRow';

interface ListViewProps {
  list: ListWithItems;
  onToggleItem: (item: ListItem) => void;
  onUpdateItem: (item: ListItem, content: string) => void;
  onDeleteItem: (item: ListItem) => void;
  onAddItem: (content: string) => void;
  onReorderItems: (itemIds: string[]) => void;
  onCompleteAll?: () => void;
  onClearCompleted?: () => void;
}

export function ListView({
  list,
  onToggleItem,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onReorderItems,
  onCompleteAll,
  onClearCompleted,
}: ListViewProps) {
  const [newItemContent, setNewItemContent] = useState('');
  const [items, setItems] = useState<ListItem[]>(list.items);
  const [showCompletedActions, setShowCompletedActions] = useState(false);

  const activeItems = items.filter((item) => !item.is_completed);
  const completedItems = items.filter((item) => item.is_completed);

  const handleAddItem = useCallback(() => {
    const content = newItemContent.trim();
    if (content) {
      onAddItem(content);
      setNewItemContent('');
    }
  }, [newItemContent, onAddItem]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddItem();
    }
  };

  const handleReorder = useCallback(
    (newOrder: ListItem[]) => {
      setItems([...newOrder, ...completedItems]);
      onReorderItems(newOrder.map((item) => item.id));
    },
    [completedItems, onReorderItems]
  );

  // Sync items when list changes
  if (list.items !== items && JSON.stringify(list.items) !== JSON.stringify(items)) {
    setItems(list.items);
  }

  const progress = items.length > 0
    ? Math.round((completedItems.length / items.length) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Progress header (for checklists) */}
      {list.list_type === 'checklist' && items.length > 0 && (
        <div className="glass rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-foreground-muted">
              {completedItems.length} of {items.length} complete
            </span>
            <span className="text-sm font-medium text-foreground">{progress}%</span>
          </div>
          <div className="h-2 bg-background-tertiary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
          
          {/* Bulk actions */}
          <div className="flex items-center gap-2 mt-3">
            {activeItems.length > 0 && (
              <button
                onClick={onCompleteAll}
                className="text-xs px-2 py-1 rounded bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
              >
                Complete all
              </button>
            )}
            {completedItems.length > 0 && (
              <button
                onClick={onClearCompleted}
                className="text-xs px-2 py-1 rounded bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
              >
                Clear completed
              </button>
            )}
          </div>
        </div>
      )}

      {/* Add new item */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newItemContent}
          onChange={(e) => setNewItemContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add an item..."
          className="
            flex-1 px-4 py-2 rounded-lg
            bg-background-tertiary border border-glass-border
            text-sm text-foreground placeholder:text-foreground-muted
            focus:outline-none focus:border-primary/50
          "
        />
        <button
          onClick={handleAddItem}
          disabled={!newItemContent.trim()}
          className="
            px-4 py-2 rounded-lg
            bg-primary text-white
            hover:bg-primary/90 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Active items (draggable) */}
      {activeItems.length > 0 ? (
        <Reorder.Group
          axis="y"
          values={activeItems}
          onReorder={handleReorder}
          className="space-y-1"
        >
          <AnimatePresence mode="popLayout">
            {activeItems.map((item) => (
              <Reorder.Item
                key={item.id}
                value={item}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <ListItemRow
                  item={item}
                  listType={list.list_type}
                  onToggle={onToggleItem}
                  onUpdate={onUpdateItem}
                  onDelete={onDeleteItem}
                />
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>
      ) : completedItems.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-foreground-muted text-sm">
            No items yet. Add your first item above!
          </p>
        </div>
      ) : null}

      {/* Completed items (collapsible) */}
      {completedItems.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowCompletedActions(!showCompletedActions)}
            className="flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground transition-colors mb-2"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showCompletedActions ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>
              {completedItems.length} completed {completedItems.length === 1 ? 'item' : 'items'}
            </span>
          </button>

          <AnimatePresence>
            {showCompletedActions && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-1 pl-4 border-l-2 border-glass-border">
                  {completedItems.map((item) => (
                    <ListItemRow
                      key={item.id}
                      item={item}
                      listType={list.list_type}
                      onToggle={onToggleItem}
                      onUpdate={onUpdateItem}
                      onDelete={onDeleteItem}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default ListView;
