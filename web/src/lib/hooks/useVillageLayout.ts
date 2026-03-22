'use client';

// ============================================
// SQUIRE WEB - VILLAGE LAYOUT HOOK
// ============================================
// Fetches graph data and transforms to village layout

import { useMemo } from 'react';
import { useGraphVisualization } from './useGraphData';
import { buildVillageLayout, createEmptyLayout, generateProps, generateVillagers } from '@/lib/village';
import type { VillageLayout, VillageLayoutOptions, VillageProp, VillageVillager } from '@/lib/types/village';

// ============================================
// HOOK OPTIONS
// ============================================

export interface UseVillageLayoutOptions extends VillageLayoutOptions {
  /** Enable/disable the query */
  enabled?: boolean;
  /** Minimum salience to include (0-1) */
  minSalience?: number;
}

// ============================================
// HOOK RESULT
// ============================================

export interface UseVillageLayoutResult {
  /** The computed village layout */
  layout: VillageLayout;
  /** Generated props for decoration */
  props: VillageProp[];
  /** Generated villagers from entities */
  villagers: VillageVillager[];
  /** Whether the layout is currently loading (initial load) */
  isLoading: boolean;
  /** Whether data is being fetched (includes refetches) */
  isFetching: boolean;
  /** Whether there's an error */
  isError: boolean;
  /** Error message if any */
  error: Error | null;
  /** Whether layout is empty (no memories) */
  isEmpty: boolean;
  /** Refetch the underlying graph data */
  refetch: () => void;
}

// ============================================
// MAIN HOOK
// ============================================

/**
 * Hook to fetch graph data and transform to village layout
 *
 * Uses useGraphVisualization under the hood and memoizes
 * the layout transformation for performance.
 *
 * @param options - Layout and fetch options
 * @returns Village layout with loading/error states
 */
export function useVillageLayout(
  options: UseVillageLayoutOptions = {}
): UseVillageLayoutResult {
  const {
    enabled = true,
    maxBuildings = 120,
    hexSize = 2,
    minSalience = 0,
    districtSpacing = 1.5,
  } = options;

  // Fetch graph visualization data
  const {
    data: graphData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useGraphVisualization({
    // Request enough nodes to fill the village
    // Don't set entityLimit - layout algorithm filters for memories
    memoryLimit: maxBuildings,
    minSalience,
    includeEdges: true,
    enabled,
  });

  // Memoize layout transformation
  const layout = useMemo(() => {
    console.log('[VillageLayout] graphData:', graphData ? {
      nodeCount: graphData.nodes.length,
      linkCount: graphData.links.length,
      sampleNode: graphData.nodes[0],
    } : 'null');

    if (!graphData) {
      console.log('[VillageLayout] No graphData, returning empty layout');
      return createEmptyLayout();
    }

    const result = buildVillageLayout(graphData, {
      maxBuildings,
      hexSize,
      minSalience,
      districtSpacing,
    });

    console.log('[VillageLayout] Layout result:', {
      buildings: result.buildings.length,
      roads: result.roads.length,
      stats: result.stats,
    });

    return result;
  }, [graphData, maxBuildings, hexSize, minSalience, districtSpacing]);

  // Generate props based on layout (memoized separately)
  const props = useMemo(() => {
    if (layout.buildings.length === 0) return [];
    return generateProps(layout);
  }, [layout]);

  // Generate villagers from entities (memoized)
  const villagers = useMemo(() => {
    if (!graphData || layout.buildings.length === 0) return [];
    return generateVillagers(graphData, layout);
  }, [graphData, layout]);

  // Determine if empty (after loading)
  const isEmpty = !isLoading && !isError && layout.buildings.length === 0;

  return {
    layout,
    props,
    villagers,
    isLoading,
    isFetching,
    isError,
    error: error as Error | null,
    isEmpty,
    refetch,
  };
}

// ============================================
// SELECTION HOOK
// ============================================

import { useState, useCallback } from 'react';
import type { VillageSelection } from '@/lib/types/village';

/**
 * Hook to manage village selection state
 */
export function useVillageSelection() {
  const [selection, setSelection] = useState<VillageSelection>({
    buildingId: null,
    memoryId: null,
    hoveredBuildingId: null,
  });

  const selectBuilding = useCallback((buildingId: string | null, memoryId: string | null) => {
    setSelection(prev => ({
      ...prev,
      buildingId,
      memoryId,
    }));
  }, []);

  const hoverBuilding = useCallback((buildingId: string | null) => {
    setSelection(prev => ({
      ...prev,
      hoveredBuildingId: buildingId,
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setSelection({
      buildingId: null,
      memoryId: null,
      hoveredBuildingId: null,
    });
  }, []);

  return {
    selection,
    selectBuilding,
    hoverBuilding,
    clearSelection,
    isSelected: selection.buildingId !== null,
    isHovered: selection.hoveredBuildingId !== null,
  };
}
