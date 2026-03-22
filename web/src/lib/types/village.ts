// ============================================
// SQUIRE WEB - VILLAGE TYPES
// ============================================
// Types for Memory Village 3D visualization

import type { PropType } from '@/lib/village/models';

// ============================================
// BUILDING TYPES
// ============================================

/**
 * Building types mapped from memory categories
 */
export type BuildingType =
  | 'tavern'      // social memories
  | 'library'     // learning memories
  | 'blacksmith'  // work memories
  | 'church'      // reflection memories
  | 'market'      // travel memories
  | 'barracks'    // health memories
  | 'house';      // misc/default

/**
 * Memory categories for district assignment
 */
export type MemoryCategory =
  | 'social'
  | 'learning'
  | 'work'
  | 'reflection'
  | 'travel'
  | 'health'
  | 'misc';

/**
 * Mapping from memory category to building type
 */
export const CATEGORY_TO_BUILDING: Record<MemoryCategory, BuildingType> = {
  social: 'tavern',
  learning: 'library',
  work: 'blacksmith',
  reflection: 'church',
  travel: 'market',
  health: 'barracks',
  misc: 'house',
};

/**
 * Building colors for each type (matching the cyber theme)
 */
export const BUILDING_COLORS: Record<BuildingType, string> = {
  tavern: '#f472b6',      // pink-400 (social)
  library: '#60a5fa',     // blue-400 (learning)
  blacksmith: '#fb923c',  // orange-400 (work)
  church: '#a78bfa',      // violet-400 (reflection)
  market: '#34d399',      // emerald-400 (travel)
  barracks: '#facc15',    // yellow-400 (health)
  house: '#71717a',       // zinc-500 (misc)
};

// ============================================
// VILLAGE BUILDING
// ============================================

/**
 * 2D position on the village grid
 */
export interface VillagePosition {
  x: number;  // World X coordinate
  z: number;  // World Z coordinate (depth)
}

/**
 * Hex grid coordinates (axial)
 */
export interface HexCoord {
  q: number;  // Column
  r: number;  // Row
}

/**
 * A building in the village (represents a memory)
 */
export interface VillageBuilding {
  id: string;
  memoryId: string;
  position: VillagePosition;
  hexCoord: HexCoord;
  buildingType: BuildingType;
  category: MemoryCategory;
  label: string;
  salience: number;       // 0-1, affects building size
  emotionalValence: number;  // -1 to 1
  color: string;
  district: string;       // District name for grouping
}

// ============================================
// VILLAGE ROADS
// ============================================

/**
 * A road connecting two buildings (represents an edge)
 */
export interface VillageRoad {
  id: string;
  fromId: string;         // Building ID
  toId: string;           // Building ID
  fromPosition: VillagePosition;
  toPosition: VillagePosition;
  weight: number;         // Edge weight, affects road width
  edgeType: string;       // SIMILAR, TEMPORAL, etc.
}

// ============================================
// DISTRICTS
// ============================================

/**
 * District configuration for layout
 */
export interface DistrictConfig {
  category: MemoryCategory;
  centerOffset: HexCoord;  // Offset from world center
  color: string;           // District boundary color
}

/**
 * District boundary for visualization
 */
export interface VillageDistrict {
  category: MemoryCategory;
  center: VillagePosition;
  buildingCount: number;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
}

// ============================================
// COMPLETE LAYOUT
// ============================================

/**
 * Complete village layout ready for rendering
 */
export interface VillageLayout {
  buildings: VillageBuilding[];
  roads: VillageRoad[];
  districts: VillageDistrict[];
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  stats: {
    totalBuildings: number;
    totalRoads: number;
    memoriesSkipped: number;  // Memories over cap
  };
}

// ============================================
// LAYOUT OPTIONS
// ============================================

/**
 * Options for building the village layout
 */
export interface VillageLayoutOptions {
  maxBuildings?: number;   // Cap (default: 120)
  hexSize?: number;        // Hex tile size (default: 2)
  minSalience?: number;    // Filter low-salience memories
  districtSpacing?: number; // Space between districts
}

// ============================================
// SELECTION STATE
// ============================================

/**
 * Currently selected/hovered building
 */
export interface VillageSelection {
  buildingId: string | null;
  memoryId: string | null;
  hoveredBuildingId: string | null;
}

// ============================================
// DISTRICT LAYOUT CONFIGURATION
// ============================================

/**
 * Pre-defined district positions on hex grid
 * Layout:
 *         [learning/North]
 *              |
 *    [work]---[center]---[social]
 *              |
 *        [reflection]
 *              |
 *     [travel]   [health]
 *              |
 *           [misc]
 */
export const DISTRICT_LAYOUT: Record<MemoryCategory, HexCoord> = {
  learning: { q: 0, r: -3 },    // North
  social: { q: 3, r: 0 },       // East
  work: { q: -3, r: 0 },        // West
  reflection: { q: 0, r: 3 },   // South
  travel: { q: -2, r: 4 },      // Southwest
  health: { q: 2, r: 4 },       // Southeast
  misc: { q: 0, r: 6 },         // Far south
};

// ============================================
// KEYWORD CLASSIFICATION
// ============================================

/**
 * Keywords to help classify memories into categories
 */
// ============================================
// PROP PLACEMENT TYPES
// ============================================

/**
 * A prop placement in the village
 */
export interface VillageProp {
  id: string;
  propType: PropType;
  position: VillagePosition;
  rotation: number;
  scale: number;
}

/**
 * Extended village layout with props
 */
export interface VillageLayoutWithProps extends VillageLayout {
  props: VillageProp[];
}

// ============================================
// VILLAGER TYPES (Phase 5)
// ============================================

/**
 * Villager types for entity representation
 */
export type VillagerType = 'peasant' | 'merchant' | 'scholar' | 'guard';

/**
 * A villager in the village (represents an entity)
 */
export interface VillageVillager {
  id: string;
  entityId: string;
  name: string;
  entityType: string;
  villagerType: VillagerType;
  position: VillagePosition;
  rotation: number;
  nearBuildingId: string | null;
}

/**
 * Extended village layout with props and villagers
 */
export interface VillageLayoutFull extends VillageLayoutWithProps {
  villagers: VillageVillager[];
}

export const CATEGORY_KEYWORDS: Record<MemoryCategory, string[]> = {
  social: [
    'friend', 'family', 'people', 'relationship', 'conversation',
    'party', 'meeting', 'together', 'group', 'team', 'colleague',
    'partner', 'spouse', 'mom', 'dad', 'parent', 'child', 'sibling',
  ],
  learning: [
    'learn', 'study', 'read', 'book', 'course', 'class', 'education',
    'skill', 'practice', 'training', 'workshop', 'tutorial', 'lecture',
    'understand', 'discover', 'knowledge', 'research',
  ],
  work: [
    'work', 'job', 'project', 'career', 'office', 'business',
    'deadline', 'task', 'client', 'meeting', 'presentation',
    'code', 'develop', 'build', 'create', 'deliver', 'ship',
  ],
  reflection: [
    'think', 'feel', 'believe', 'realize', 'understand', 'self',
    'journal', 'meditate', 'pray', 'contemplate', 'reflect',
    'insight', 'awareness', 'growth', 'change', 'goal', 'value',
  ],
  travel: [
    'travel', 'trip', 'vacation', 'visit', 'explore', 'adventure',
    'city', 'country', 'place', 'destination', 'flight', 'drive',
    'hotel', 'restaurant', 'sight', 'tour', 'journey',
  ],
  health: [
    'health', 'exercise', 'workout', 'run', 'gym', 'fitness',
    'diet', 'sleep', 'doctor', 'medical', 'wellness', 'yoga',
    'mental', 'stress', 'energy', 'weight', 'nutrition',
  ],
  misc: [], // Default category, no keywords needed
};
