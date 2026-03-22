'use client';

import { useRef, useEffect } from 'react';
import { ConversationCard } from './ConversationCard';
import type { ConversationPair } from '@/lib/types';

interface CardListProps {
  pairs: ConversationPair[];
  onBookmark?: (pair: ConversationPair) => void;
  bookmarkedIds?: Set<string>;
}

export function CardList({ pairs, onBookmark, bookmarkedIds }: CardListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevPairCountRef = useRef(pairs.length);

  // Newest-first: scroll to top when new pairs arrive
  useEffect(() => {
    if (pairs.length > prevPairCountRef.current) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    prevPairCountRef.current = pairs.length;
  }, [pairs.length]);

  // Reversed pairs: newest first
  const reversedPairs = [...pairs].reverse();

  if (pairs.length === 0) {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-foreground mb-1">Squire</h2>
          <p className="text-sm text-foreground-muted max-w-xs">
            Your AI memory that knows you. Ask me anything.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto py-4 px-4 space-y-3">
        {reversedPairs.map((pair, index) => (
          <ConversationCard
            key={pair.id}
            pair={pair}
            index={index}
            onBookmark={onBookmark}
            isBookmarked={bookmarkedIds?.has(pair.id)}
          />
        ))}
      </div>
    </div>
  );
}
