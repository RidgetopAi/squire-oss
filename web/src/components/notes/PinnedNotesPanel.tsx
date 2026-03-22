'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import type { Note } from '@/lib/types';
import { fetchPinnedNotes } from '@/lib/api/notes';
import { formatRelativeTime } from '@/lib/utils/formatting';

interface PinnedNotesPanelProps {
  limit?: number;
  onNoteClick?: (note: Note) => void;
}

export function PinnedNotesPanel({ limit = 5, onNoteClick }: PinnedNotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const data = await fetchPinnedNotes();
        setNotes(data.slice(0, limit));
      } catch (err) {
        console.error('Failed to load pinned notes:', err);
        setError('Failed to load');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [limit]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse p-3 rounded-lg bg-background-tertiary/50">
            <div className="h-3 bg-background-tertiary rounded w-2/3 mb-2" />
            <div className="h-3 bg-background-tertiary rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-foreground-muted text-center py-4">
        {error}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="text-3xl mb-2">📌</div>
        <p className="text-sm text-foreground-muted mb-3">No pinned notes yet</p>
        <Link
          href="/app/notes"
          className="text-sm text-primary hover:underline"
        >
          Go to Notes
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout">
        {notes.map((note, index) => (
          <motion.button
            key={note.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => onNoteClick?.(note)}
            className="
              w-full text-left p-3 rounded-lg
              bg-background-tertiary/50 border border-glass-border
              hover:bg-background-tertiary hover:border-primary/30
              transition-all duration-200
            "
          >
            <div className="flex items-start gap-2">
              <span className="text-accent-gold text-sm shrink-0">📌</span>
              <div className="flex-1 min-w-0">
                {note.title && (
                  <p className="text-sm font-medium text-foreground truncate mb-0.5">
                    {note.title}
                  </p>
                )}
                <p className="text-sm text-foreground-muted line-clamp-2">
                  {note.content}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-foreground-muted">
                    {formatRelativeTime(note.created_at)}
                  </span>
                  {note.category && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-background-tertiary text-foreground-muted">
                      {note.category}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.button>
        ))}
      </AnimatePresence>

      {notes.length > 0 && (
        <Link
          href="/app/notes"
          className="
            block w-full text-center text-sm text-foreground-muted
            hover:text-primary transition-colors py-2
          "
        >
          View all notes →
        </Link>
      )}
    </div>
  );
}

export default PinnedNotesPanel;
