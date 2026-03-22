import { create } from 'zustand';
import type {
  Memory,
  Belief,
  Pattern,
  Entity,
  Insight,
  LivingSummary,
} from '@/lib/types';

// Union type for all displayable items
export type DetailItem =
  | { type: 'memory'; data: Memory }
  | { type: 'belief'; data: Belief }
  | { type: 'pattern'; data: Pattern }
  | { type: 'entity'; data: Entity }
  | { type: 'insight'; data: Insight }
  | { type: 'summary'; data: LivingSummary };

interface DetailModalState {
  // State
  item: DetailItem | null;
  isOpen: boolean;

  // Actions
  openMemory: (memory: Memory) => void;
  openBelief: (belief: Belief) => void;
  openPattern: (pattern: Pattern) => void;
  openEntity: (entity: Entity) => void;
  openInsight: (insight: Insight) => void;
  openSummary: (summary: LivingSummary) => void;
  close: () => void;
}

const useDetailModalStore = create<DetailModalState>((set) => ({
  item: null,
  isOpen: false,

  openMemory: (memory) => set({ item: { type: 'memory', data: memory }, isOpen: true }),
  openBelief: (belief) => set({ item: { type: 'belief', data: belief }, isOpen: true }),
  openPattern: (pattern) => set({ item: { type: 'pattern', data: pattern }, isOpen: true }),
  openEntity: (entity) => set({ item: { type: 'entity', data: entity }, isOpen: true }),
  openInsight: (insight) => set({ item: { type: 'insight', data: insight }, isOpen: true }),
  openSummary: (summary) => set({ item: { type: 'summary', data: summary }, isOpen: true }),
  close: () => set({ item: null, isOpen: false }),
}));

// Selector hooks
export const useDetailItem = () => useDetailModalStore((state) => state.item);
export const useDetailModalOpen = () => useDetailModalStore((state) => state.isOpen);

// Action hooks
export const useOpenMemoryDetail = () => useDetailModalStore((state) => state.openMemory);
export const useOpenBeliefDetail = () => useDetailModalStore((state) => state.openBelief);
export const useOpenPatternDetail = () => useDetailModalStore((state) => state.openPattern);
export const useOpenEntityDetail = () => useDetailModalStore((state) => state.openEntity);
export const useOpenInsightDetail = () => useDetailModalStore((state) => state.openInsight);
export const useOpenSummaryDetail = () => useDetailModalStore((state) => state.openSummary);
export const useCloseDetailModal = () => useDetailModalStore((state) => state.close);
