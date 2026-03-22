// ============================================
// SQUIRE WEB - VILLAGE GLTF MODELS
// ============================================
// GLTF model configuration and preloading utilities
// Phase 3: KayKit medieval building integration

import { useGLTF } from '@react-three/drei';
import type { BuildingType } from '@/lib/types/village';

// ============================================
// MODEL PATHS
// ============================================

/**
 * Base path for all building models
 */
const MODELS_BASE_PATH = '/models/buildings';

/**
 * Base path for prop models
 */
const PROPS_BASE_PATH = '/models/props';

/**
 * Model configuration for each building type
 */
export interface BuildingModelConfig {
  /** Path to GLTF file (relative to public/) */
  path: string;
  /** Default scale multiplier */
  scale: number;
  /** Y-axis rotation in radians (for proper orientation) */
  rotationY: number;
  /** Y offset to place building on ground */
  yOffset: number;
}

/**
 * GLTF model paths for each building type
 * Uses KayKit Medieval Hexagon Pack (CC0 license)
 * https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0
 *
 * Model mappings:
 * - tavern: building_tavern_blue
 * - library: building_tower_A_blue
 * - blacksmith: building_blacksmith_blue
 * - church: building_church_blue
 * - market: building_market_blue
 * - barracks: building_barracks_blue
 * - house: building_home_A_blue
 */
/**
 * Model configurations tuned for hex size of 2 units.
 * KayKit models designed for 1-unit hexes, so base scale ~2.0.
 * Rotation values add visual variety and proper orientation.
 */
export const BUILDING_MODEL_CONFIGS: Record<BuildingType, BuildingModelConfig> = {
  tavern: {
    path: `${MODELS_BASE_PATH}/tavern.gltf`,
    scale: 2.0,
    rotationY: Math.PI / 6, // 30° - angled for visual interest
    yOffset: 0,
  },
  library: {
    path: `${MODELS_BASE_PATH}/library.gltf`,
    scale: 2.0,
    rotationY: 0,
    yOffset: 0,
  },
  blacksmith: {
    path: `${MODELS_BASE_PATH}/blacksmith.gltf`,
    scale: 2.0,
    rotationY: -Math.PI / 6, // -30°
    yOffset: 0,
  },
  church: {
    path: `${MODELS_BASE_PATH}/church.gltf`,
    scale: 2.0,
    rotationY: Math.PI / 3, // 60° - face forward prominently
    yOffset: 0,
  },
  market: {
    path: `${MODELS_BASE_PATH}/market.gltf`,
    scale: 2.0,
    rotationY: Math.PI / 4, // 45°
    yOffset: 0,
  },
  barracks: {
    path: `${MODELS_BASE_PATH}/barracks.gltf`,
    scale: 2.0,
    rotationY: -Math.PI / 4, // -45°
    yOffset: 0,
  },
  house: {
    path: `${MODELS_BASE_PATH}/house.gltf`,
    scale: 1.8, // Slightly smaller for houses
    rotationY: 0,
    yOffset: 0,
  },
};

// ============================================
// PRELOADING
// ============================================

/**
 * All building types for iteration
 */
const ALL_BUILDING_TYPES: BuildingType[] = [
  'tavern',
  'library',
  'blacksmith',
  'church',
  'market',
  'barracks',
  'house',
];

/**
 * Get the model path for a building type
 */
function getModelPath(buildingType: BuildingType): string {
  return BUILDING_MODEL_CONFIGS[buildingType].path;
}

/**
 * Get the full model config for a building type
 */
export function getModelConfig(buildingType: BuildingType): BuildingModelConfig {
  return BUILDING_MODEL_CONFIGS[buildingType];
}

/**
 * Preload all building models
 * Call this in VillageCanvas or a parent component to start loading models early
 *
 * @example
 * // In VillageCanvas.tsx or VillageScene.tsx:
 * useEffect(() => {
 *   preloadAllBuildingModels();
 * }, []);
 */
export function preloadAllBuildingModels(): void {
  ALL_BUILDING_TYPES.forEach((type) => {
    const path = getModelPath(type);
    useGLTF.preload(path);
  });
}


// ============================================
// PROP MODELS
// ============================================

/**
 * Prop types available for village decoration
 */
export type PropType =
  | 'barrel'
  | 'crate_a'
  | 'crate_b'
  | 'sack'
  | 'bucket'
  | 'wheelbarrow'
  | 'tree_a'
  | 'tree_b'
  | 'rock_a'
  | 'rock_b';

/**
 * Prop model configuration
 */
export interface PropModelConfig {
  path: string;
  scale: number;
  rotationY: number;
  yOffset: number;
}

/**
 * Prop model configurations
 */
export const PROP_MODEL_CONFIGS: Record<PropType, PropModelConfig> = {
  barrel: {
    path: `${PROPS_BASE_PATH}/barrel.gltf`,
    scale: 2.0,
    rotationY: 0,
    yOffset: 0,
  },
  crate_a: {
    path: `${PROPS_BASE_PATH}/crate_A_small.gltf`,
    scale: 2.0,
    rotationY: 0,
    yOffset: 0,
  },
  crate_b: {
    path: `${PROPS_BASE_PATH}/crate_B_small.gltf`,
    scale: 2.0,
    rotationY: Math.PI / 4,
    yOffset: 0,
  },
  sack: {
    path: `${PROPS_BASE_PATH}/sack.gltf`,
    scale: 2.0,
    rotationY: 0,
    yOffset: 0,
  },
  bucket: {
    path: `${PROPS_BASE_PATH}/bucket_water.gltf`,
    scale: 2.0,
    rotationY: 0,
    yOffset: 0,
  },
  wheelbarrow: {
    path: `${PROPS_BASE_PATH}/wheelbarrow.gltf`,
    scale: 2.0,
    rotationY: Math.PI / 6,
    yOffset: 0,
  },
  tree_a: {
    path: `${PROPS_BASE_PATH}/tree_single_A.gltf`,
    scale: 2.5,
    rotationY: 0,
    yOffset: 0,
  },
  tree_b: {
    path: `${PROPS_BASE_PATH}/tree_single_B.gltf`,
    scale: 2.5,
    rotationY: 0,
    yOffset: 0,
  },
  rock_a: {
    path: `${PROPS_BASE_PATH}/rock_single_A.gltf`,
    scale: 2.0,
    rotationY: 0,
    yOffset: 0,
  },
  rock_b: {
    path: `${PROPS_BASE_PATH}/rock_single_B.gltf`,
    scale: 2.0,
    rotationY: Math.PI / 3,
    yOffset: 0,
  },
};

/**
 * All prop types for iteration
 */
const ALL_PROP_TYPES: PropType[] = [
  'barrel',
  'crate_a',
  'crate_b',
  'sack',
  'bucket',
  'wheelbarrow',
  'tree_a',
  'tree_b',
  'rock_a',
  'rock_b',
];

/**
 * Get prop model config
 */
export function getPropConfig(propType: PropType): PropModelConfig {
  return PROP_MODEL_CONFIGS[propType];
}

/**
 * Get prop model path
 */
export function getPropPath(propType: PropType): string {
  return PROP_MODEL_CONFIGS[propType].path;
}

/**
 * Preload all prop models
 */
export function preloadAllPropModels(): void {
  ALL_PROP_TYPES.forEach((type) => {
    useGLTF.preload(getPropPath(type));
  });
}

