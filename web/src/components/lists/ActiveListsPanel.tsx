'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { List } from '@/lib/types';
import { fetchLists } from '@/lib/api/lists';
import { ListCardCompact } from './ListCard';

interface ActiveListsPanelProps {
  limit?: number;
}

export function ActiveListsPanel({ limit = 4 }: ActiveListsPanelProps) {
  const [lists, setLists] = useState<List[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadLists() {
      try {
        const data = await fetchLists({
          list_type: 'checklist',
          limit: limit + 2,
        });
        const activeLists = data
          .filter((l) => {
            const itemCount = l.item_count ?? 0;
            const completedCount = l.completed_count ?? 0;
            return itemCount > 0 && completedCount < itemCount;
          })
          .slice(0, limit);
        setLists(activeLists);
      } catch (error) {
        console.error('Failed to load active lists:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadLists();
  }, [limit]);

  if (isLoading) {
    return (
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Active Lists</h3>
        </div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse h-16 bg-background-tertiary rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span>☑️</span>
          Active Lists
        </h3>
        <Link
          href="/app/lists"
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          View all →
        </Link>
      </div>

      {lists.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-foreground-muted">No active checklists</p>
          <Link
            href="/app/lists"
            className="text-sm text-primary hover:underline mt-1 inline-block"
          >
            Create a list
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map((list) => (
            <Link key={list.id} href={`/app/lists?open=${list.id}`}>
              <ListCardCompact list={list} />
            </Link>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default ActiveListsPanel;
