import { create } from 'zustand';
import type { ScoredMemory, EntitySummary } from '@/lib/types';
import { fetchMemoriesByIds, memoryToScoredMemory } from '@/lib/api/memories';

// Memory card with additional display info
export interface OverlayCard {
  id: string;
  memory: ScoredMemory;
  entities?: EntitySummary[];
  addedAt: number;
}

interface OverlayState {
  // State
  cards: OverlayCard[];
  isVisible: boolean;
  isLoading: boolean;
  activeMessageId: string | null; // Which message's memories are being shown
  maxCards: number;

  // Actions
  showMemoriesForMessage: (messageId: string, memoryIds: string[]) => Promise<void>;
  hideMemories: () => void;
  dismissCard: (id: string) => void;
  clearCards: () => void;

  // Legacy actions (kept for compatibility)
  pushCard: (memory: ScoredMemory, entities?: EntitySummary[]) => void;
  pushCards: (memories: ScoredMemory[], entitiesMap?: Map<string, EntitySummary[]>) => void;
  setVisible: (visible: boolean) => void;
  toggleVisible: () => void;
}

export const useOverlayStore = create<OverlayState>((set, get) => ({
  // Initial state
  cards: [],
  isVisible: false,
  isLoading: false,
  activeMessageId: null,
  maxCards: 10,

  // Show memories for a specific message (toggle behavior)
  showMemoriesForMessage: async (messageId, memoryIds) => {
    const { activeMessageId, isVisible } = get();

    // Toggle off if clicking same message
    if (isVisible && activeMessageId === messageId) {
      set({ isVisible: false, activeMessageId: null });
      return;
    }

    // No memories to show
    if (memoryIds.length === 0) {
      return;
    }

    // Start loading
    set({ isLoading: true, activeMessageId: messageId });

    try {
      const memories = await fetchMemoriesByIds(memoryIds);
      const cards: OverlayCard[] = memories.map((memory) => ({
        id: memory.id,
        memory: memoryToScoredMemory(memory),
        addedAt: Date.now(),
      }));

      set({
        cards,
        isVisible: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to fetch memories for overlay:', error);
      set({ isLoading: false });
    }
  },

  // Hide memories overlay
  hideMemories: () => {
    set({ isVisible: false, activeMessageId: null });
  },

  // Dismiss a single card
  dismissCard: (id) => {
    set((state) => ({
      cards: state.cards.filter((c) => c.id !== id),
    }));
  },

  // Clear all cards
  clearCards: () => {
    set({ cards: [], isVisible: false, activeMessageId: null });
  },

  // Legacy: Push a single card (kept for compatibility)
  pushCard: (memory, entities) => {
    const { cards, maxCards } = get();
    if (cards.some((c) => c.memory.id === memory.id)) return;

    const newCard: OverlayCard = {
      id: memory.id,
      memory,
      entities,
      addedAt: Date.now(),
    };

    set({
      cards: [...cards.slice(-(maxCards - 1)), newCard],
      isVisible: true,
    });
  },

  // Legacy: Push multiple cards (kept for compatibility)
  pushCards: (memories, entitiesMap) => {
    const { maxCards } = get();
    const existingIds = new Set(get().cards.map((c) => c.memory.id));
    const newCards: OverlayCard[] = memories
      .filter((m) => !existingIds.has(m.id))
      .map((memory) => ({
        id: memory.id,
        memory,
        entities: entitiesMap?.get(memory.id),
        addedAt: Date.now(),
      }));

    if (newCards.length === 0) return;
    set({ cards: newCards.slice(-maxCards), isVisible: true });
  },

  // Legacy: Set visibility
  setVisible: (visible) => {
    set({ isVisible: visible });
  },

  // Legacy: Toggle visibility
  toggleVisible: () => {
    set((state) => ({ isVisible: !state.isVisible }));
  },
}));

// Selector hooks (for reactive state)
export const useOverlayCards = () => useOverlayStore((state) => state.cards);
export const useOverlayVisible = () => useOverlayStore((state) => state.isVisible);
export const useOverlayLoading = () => useOverlayStore((state) => state.isLoading);
export const useActiveMessageId = () => useOverlayStore((state) => state.activeMessageId);

// Action selectors (stable references - won't cause re-renders)
export const useShowMemoriesForMessage = () => useOverlayStore((state) => state.showMemoriesForMessage);
export const useHideMemories = () => useOverlayStore((state) => state.hideMemories);
export const useDismissCard = () => useOverlayStore((state) => state.dismissCard);
