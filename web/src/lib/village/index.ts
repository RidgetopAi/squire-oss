// ============================================
// SQUIRE WEB - VILLAGE LAYOUT LIBRARY
// ============================================

// Hex grid utilities
export {
  hexToWorld,
  worldToHex,
  spiralHexPositions,
  calculateBounds,
  hexAdd,
  DEFAULT_HEX_SIZE,
} from './hexGrid';

// Layout algorithm
export {
  buildVillageLayout,
  createEmptyLayout,
  generateProps,
  generateVillagers,
} from './layout';

// GLTF model utilities (Phase 3)
export {
  BUILDING_MODEL_CONFIGS,
  getModelConfig,
  preloadAllBuildingModels,
  // Phase 5: Props
  PROP_MODEL_CONFIGS,
  getPropConfig,
  getPropPath,
  preloadAllPropModels,
} from './models';
export type { BuildingModelConfig, PropType, PropModelConfig } from './models';

// Light beam shader utilities (Phase 6: Visual polish)
export {
  createBeamMaterial,
  updateBeamTime,
  createOuterGlowMaterial,
} from './beamShader';
export type { BeamMaterialOptions } from './beamShader';
