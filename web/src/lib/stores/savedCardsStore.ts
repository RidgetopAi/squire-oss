import { create } from 'zustand';
import { apiGet, apiPost, apiDelete } from '@/lib/api/client';
import type { ConversationPair, ReportData } from '@/lib/types';

export interface SavedCard {
  id: string;
  userMessage: string;
  assistantContent: string;
  reportData?: ReportData;
  tags: string[];
  similarity?: number;
  createdAt: string;
}

export interface TagCount {
  tag: string;
  count: number;
}

interface SavedCardsState {
  savedCards: SavedCard[];
  tags: TagCount[];
  activeFilters: string[];
  searchQuery: string;
  isFilterMode: boolean;
  isLoading: boolean;

  // Single source of truth: pairId → savedCardId
  // Used for bookmark icon state AND for unsaving from chat view
  bookmarks: Map<string, string>;

  // Actions
  saveCard: (pair: ConversationPair, tags: string[]) => Promise<void>;
  unsaveCard: (savedCardId: string) => Promise<void>;
  toggleBookmark: (pair: ConversationPair) => void;
  isBookmarked: (pairId: string) => boolean;
  fetchSavedCards: (filters?: { tag?: string; q?: string }) => Promise<void>;
  fetchTags: () => Promise<void>;
  setFilterMode: (on: boolean) => void;
  toggleTag: (tag: string) => void;
  setSearchQuery: (q: string) => void;
  searchCards: () => Promise<void>;
}

export const useSavedCardsStore = create<SavedCardsState>((set, get) => ({
  savedCards: [],
  tags: [],
  activeFilters: [],
  searchQuery: '',
  isFilterMode: false,
  isLoading: false,
  bookmarks: new Map(),

  saveCard: async (pair, tags) => {
    try {
      const result = await apiPost<SavedCard>('/api/saved-cards', {
        userMessage: pair.userMessage.content,
        assistantContent: pair.assistantMessage?.content || '',
        reportData: pair.assistantMessage?.reportData || undefined,
        tags,
      });

      set((state) => {
        const newBookmarks = new Map(state.bookmarks);
        newBookmarks.set(pair.id, result.id);
        return {
          savedCards: [result, ...state.savedCards],
          bookmarks: newBookmarks,
        };
      });

      // Refresh tags
      get().fetchTags();
    } catch (error) {
      console.error('[SavedCards] Failed to save:', error);
      throw error;
    }
  },

  unsaveCard: async (savedCardId) => {
    try {
      await apiDelete(`/api/saved-cards/${savedCardId}`);

      set((state) => {
        // Remove from bookmarks map (find by savedCardId value)
        const newBookmarks = new Map(state.bookmarks);
        for (const [pairId, cardId] of newBookmarks) {
          if (cardId === savedCardId) {
            newBookmarks.delete(pairId);
            break;
          }
        }
        return {
          savedCards: state.savedCards.filter((c) => c.id !== savedCardId),
          bookmarks: newBookmarks,
        };
      });
    } catch (error) {
      console.error('[SavedCards] Failed to unsave:', error);
      throw error;
    }
  },

  toggleBookmark: (pair) => {
    const { bookmarks } = get();
    const savedCardId = bookmarks.get(pair.id);
    if (savedCardId) {
      // Already saved — unsave it
      get().unsaveCard(savedCardId);
    }
    // If not saved, the caller should open the tag input
    // (handled in ChatWindowV2)
  },

  isBookmarked: (pairId) => {
    return get().bookmarks.has(pairId);
  },

  fetchSavedCards: async (filters) => {
    set({ isLoading: true });
    try {
      const params: Record<string, string> = {};
      if (filters?.tag) params.tag = filters.tag;
      if (filters?.q) params.q = filters.q;

      const result = await apiGet<{ cards: SavedCard[] }>('/api/saved-cards', { params });
      set({ savedCards: result.cards, isLoading: false });
    } catch (error) {
      console.error('[SavedCards] Failed to fetch:', error);
      set({ isLoading: false });
    }
  },

  fetchTags: async () => {
    try {
      const result = await apiGet<{ tags: TagCount[] }>('/api/saved-cards/tags');
      set({ tags: result.tags });
    } catch (error) {
      console.error('[SavedCards] Failed to fetch tags:', error);
    }
  },

  setFilterMode: (on) => {
    set({ isFilterMode: on });
    if (on) {
      get().fetchSavedCards();
      get().fetchTags();
    }
  },

  toggleTag: (tag) => {
    const { activeFilters } = get();
    const newFilters = activeFilters.includes(tag)
      ? activeFilters.filter((t) => t !== tag)
      : [...activeFilters, tag];
    set({ activeFilters: newFilters });

    // Refetch with first active tag (API supports single tag filter)
    get().fetchSavedCards(newFilters.length > 0 ? { tag: newFilters[0] } : undefined);
  },

  setSearchQuery: (q) => {
    set({ searchQuery: q });
  },

  searchCards: async () => {
    const { searchQuery, activeFilters } = get();
    const filters: { tag?: string; q?: string } = {};
    if (searchQuery) filters.q = searchQuery;
    if (activeFilters.length > 0) filters.tag = activeFilters[0];
    await get().fetchSavedCards(filters);
  },
}));
