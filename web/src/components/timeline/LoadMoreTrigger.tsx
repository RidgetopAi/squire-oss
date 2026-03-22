'use client';

import { useEffect, useRef } from 'react';

interface LoadMoreTriggerProps {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  threshold?: number;
  rootMargin?: string;
}

/**
 * Invisible trigger that fires onLoadMore when scrolled into view.
 * Uses IntersectionObserver for efficient scroll detection.
 */
export function LoadMoreTrigger({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 0.1,
  rootMargin = '200px',
}: LoadMoreTriggerProps) {
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !isLoading) {
          onLoadMore();
        }
      },
      {
        threshold,
        rootMargin, // Start loading before trigger is visible
      }
    );

    observer.observe(trigger);

    return () => {
      observer.disconnect();
    };
  }, [onLoadMore, hasMore, isLoading, threshold, rootMargin]);

  // Don't render anything if no more content
  if (!hasMore && !isLoading) {
    return null;
  }

  return (
    <div ref={triggerRef} className="w-full py-8 flex justify-center">
      {isLoading ? (
        <LoadingSpinner />
      ) : hasMore ? (
        <div className="text-xs text-foreground-muted">Scroll for more</div>
      ) : null}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-accent-primary animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      <span className="text-sm text-foreground-muted">Loading more memories...</span>
    </div>
  );
}

/**
 * End of timeline indicator
 */
export function EndOfTimeline({ totalCount }: { totalCount: number }) {
  return (
    <div className="w-full py-8 flex flex-col items-center gap-2 text-center animate-fade-in">
      <div className="w-12 h-0.5 bg-border rounded-full" />
      <p className="text-xs text-foreground-muted">
        You&apos;ve reached the beginning
        {totalCount > 0 && (
          <span className="block mt-0.5">
            <span className="font-medium text-foreground">{totalCount}</span> memories total
          </span>
        )}
      </p>
    </div>
  );
}
