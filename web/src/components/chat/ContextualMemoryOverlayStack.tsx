'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { MemoryCard } from '@/components/cards/MemoryCard';
import { OverlayPortal } from '@/components/layout/OverlayPortal';
import {
  useOverlayCards,
  useOverlayVisible,
  useOverlayLoading,
  useDismissCard,
  useHideMemories,
} from '@/lib/stores/overlayStore';

interface ContextualMemoryOverlayStackProps {
  position?: 'right' | 'left';
  offset?: number;
}

/**
 * Floating stack of memory cards displayed alongside chat
 * Shows memories used as context for a specific message
 */
export function ContextualMemoryOverlayStack({
  position = 'right',
  offset = 16,
}: ContextualMemoryOverlayStackProps) {
  const cards = useOverlayCards();
  const isVisible = useOverlayVisible();
  const isLoading = useOverlayLoading();
  const dismissCard = useDismissCard();
  const hideMemories = useHideMemories();

  // Only render when visible (loading or has cards)
  if (!isVisible && !isLoading) {
    return null;
  }

  const positionStyles =
    position === 'right'
      ? { right: offset, left: 'auto' }
      : { left: offset, right: 'auto' };

  return (
    <OverlayPortal>
      <div
        className="fixed top-20 bottom-4 w-80 pointer-events-auto flex flex-col"
        style={positionStyles}
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-3 px-1"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-primary">
              🧠 Related Memories
            </span>
            {!isLoading && (
              <span className="text-xs text-foreground-muted bg-background-tertiary px-2 py-0.5 rounded-full">
                {cards.length}
              </span>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={hideMemories}
            className="p-1.5 text-foreground-muted hover:text-foreground transition-colors"
            title="Close"
          >
            ✕
          </button>
        </motion.div>

        {/* Loading state */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass rounded-lg p-6 text-center"
          >
            <div className="animate-pulse text-primary text-2xl mb-2">🧠</div>
            <span className="text-sm text-foreground-muted">Loading memories...</span>
          </motion.div>
        )}

        {/* Cards stack */}
        <AnimatePresence mode="popLayout">
          {isVisible && !isLoading && cards.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex-1 overflow-y-auto space-y-3 pr-1"
            >
              {cards.map((card, index) => (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, x: 20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  transition={{
                    duration: 0.3,
                    delay: index * 0.05,
                  }}
                >
                  <MemoryCard
                    memory={card.memory}
                    entities={card.entities}
                    onDismiss={() => dismissCard(card.id)}
                    compact
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </OverlayPortal>
  );
}

export default ContextualMemoryOverlayStack;
