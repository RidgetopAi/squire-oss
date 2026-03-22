// ============================================
// SQUIRE WEB - VILLAGE LAYOUT ALGORITHM
// ============================================
// Transforms graph API data into village layout

import type { ForceGraphData, ForceGraphNode, ForceGraphLink } from '@/lib/api/graph';
import type {
  VillageLayout,
  VillageBuilding,
  VillageRoad,
  VillageDistrict,
  VillageLayoutOptions,
  MemoryCategory,
  BuildingType,
  HexCoord,
  VillagePosition,
  VillageProp,
  VillageLayoutWithProps,
  VillageVillager,
  VillagerType,
  VillageLayoutFull,
} from '@/lib/types/village';
import type { PropType } from '@/lib/village/models';
import {
  DISTRICT_LAYOUT,
  CATEGORY_TO_BUILDING,
  BUILDING_COLORS,
  CATEGORY_KEYWORDS,
} from '@/lib/types/village';
import {
  hexToWorld,
  worldToHex,
  hexAdd,
  spiralHexPositions,
  calculateBounds,
  DEFAULT_HEX_SIZE,
} from './hexGrid';

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_OPTIONS: Required<VillageLayoutOptions> = {
  maxBuildings: 120,
  hexSize: DEFAULT_HEX_SIZE,
  minSalience: 0,
  districtSpacing: 1.5, // Multiplier for district spread
};

// ============================================
// MAIN LAYOUT FUNCTION
// ============================================

/**
 * Transform graph visualization data into village layout
 *
 * @param graphData - Force graph data from API
 * @param options - Layout options
 * @returns Complete village layout ready for rendering
 */
export function buildVillageLayout(
  graphData: ForceGraphData,
  options: VillageLayoutOptions = {}
): VillageLayout {
  // Filter out undefined values so they don't override defaults
  const cleanOptions = Object.fromEntries(
    Object.entries(options).filter(([_, v]) => v !== undefined)
  );
  const opts = { ...DEFAULT_OPTIONS, ...cleanOptions } as Required<VillageLayoutOptions>;

  // Filter to memory nodes only (entities become decorations in Phase 3)
  const memoryNodes = graphData.nodes.filter(node => node.type === 'memory');

  console.log('[buildVillageLayout] Input:', {
    totalNodes: graphData.nodes.length,
    memoryNodes: memoryNodes.length,
    nodeTypes: [...new Set(graphData.nodes.map(n => n.type))],
  });

  // Sort by salience (highest first) and filter by min salience
  const sortedMemories = memoryNodes
    .filter(node => {
      const salience = (node.attributes?.salience as number) ?? 0.5;
      return salience >= opts.minSalience;
    })
    .sort((a, b) => {
      const salienceA = (a.attributes?.salience as number) ?? 0.5;
      const salienceB = (b.attributes?.salience as number) ?? 0.5;
      return salienceB - salienceA;
    });

  // Cap to max buildings
  const memoriesSkipped = Math.max(0, sortedMemories.length - opts.maxBuildings);
  const memoriesToPlace = sortedMemories.slice(0, opts.maxBuildings);

  // Categorize memories into districts
  const categorized = categorizeMemories(memoriesToPlace);

  // Place buildings in districts
  const buildings = placeBuildingsInDistricts(categorized, opts);

  // Create building ID lookup for road generation
  const buildingByMemoryId = new Map(buildings.map(b => [b.memoryId, b]));

  // Generate roads from graph edges
  const roads = generateRoads(graphData.links, buildingByMemoryId);

  // Calculate district bounds
  const districts = calculateDistricts(buildings);

  // Calculate overall bounds
  const allPositions = buildings.map(b => b.position);
  const bounds = calculateBounds(allPositions);

  // Add padding to bounds
  const padding = opts.hexSize * 2;
  bounds.minX -= padding;
  bounds.maxX += padding;
  bounds.minZ -= padding;
  bounds.maxZ += padding;

  return {
    buildings,
    roads,
    districts,
    bounds,
    stats: {
      totalBuildings: buildings.length,
      totalRoads: roads.length,
      memoriesSkipped,
    },
  };
}

// ============================================
// MEMORY CATEGORIZATION
// ============================================

/**
 * Categorize memories into districts based on tags and content
 */
function categorizeMemories(
  memories: ForceGraphNode[]
): Map<MemoryCategory, ForceGraphNode[]> {
  const categorized = new Map<MemoryCategory, ForceGraphNode[]>();

  // Initialize all categories
  for (const category of Object.keys(DISTRICT_LAYOUT) as MemoryCategory[]) {
    categorized.set(category, []);
  }

  for (const memory of memories) {
    const category = classifyMemory(memory);
    categorized.get(category)!.push(memory);
  }

  return categorized;
}

/**
 * Classify a single memory into a category
 */
function classifyMemory(memory: ForceGraphNode): MemoryCategory {
  const label = memory.label.toLowerCase();
  const tags = (memory.attributes?.tags as string[]) ?? [];
  const content = (memory.attributes?.content as string) ?? '';
  const textToSearch = `${label} ${tags.join(' ')} ${content}`.toLowerCase();

  // Check each category's keywords
  let bestCategory: MemoryCategory = 'misc';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [MemoryCategory, string[]][]) {
    if (keywords.length === 0) continue; // Skip misc

    let score = 0;
    for (const keyword of keywords) {
      if (textToSearch.includes(keyword)) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  // If no keywords matched, check tags for direct category matches
  if (bestScore === 0) {
    const tagStr = tags.join(' ').toLowerCase();
    for (const category of Object.keys(DISTRICT_LAYOUT) as MemoryCategory[]) {
      if (tagStr.includes(category)) {
        return category;
      }
    }
  }

  return bestCategory;
}

// ============================================
// BUILDING PLACEMENT
// ============================================

/**
 * Place buildings within their districts using spiral placement
 */
function placeBuildingsInDistricts(
  categorized: Map<MemoryCategory, ForceGraphNode[]>,
  opts: Required<VillageLayoutOptions>
): VillageBuilding[] {
  const buildings: VillageBuilding[] = [];

  for (const [category, memories] of categorized) {
    if (memories.length === 0) continue;

    // Get district center offset
    const districtOffset = DISTRICT_LAYOUT[category];
    if (!districtOffset) {
      console.warn('[placeBuildingsInDistricts] No district offset for category:', category);
      continue;
    }

    // Scale the district offset for spacing
    const scaledOffset: HexCoord = {
      q: Math.round(districtOffset.q * opts.districtSpacing),
      r: Math.round(districtOffset.r * opts.districtSpacing),
    };

    // Generate spiral positions for this district
    const spiralPositions = spiralHexPositions(memories.length);

    console.log(`[placeBuildingsInDistricts] ${category}: ${memories.length} memories, ${spiralPositions.length} positions`);

    for (let i = 0; i < memories.length; i++) {
      const memory = memories[i];
      const localHex = spiralPositions[i];

      // Safety check for missing spiral position
      if (!localHex) {
        console.warn(`[placeBuildingsInDistricts] Missing spiral position at index ${i} for ${category}`);
        continue;
      }

      // Combine district offset with local position
      const hexCoord = hexAdd(scaledOffset, localHex);
      const position = hexToWorld(hexCoord, opts.hexSize);

      // Validate position
      if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) {
        console.warn('[placeBuildingsInDistricts] NaN position:', {
          memoryId: memory.id,
          category,
          index: i,
          localHex,
          scaledOffset,
          hexCoord,
          position,
          hexSize: opts.hexSize,
        });
        continue;
      }

      // Extract memory attributes
      const salience = (memory.attributes?.salience as number) ?? 0.5;
      const emotionalValence = (memory.attributes?.emotionalValence as number) ?? 0;

      // Determine building type
      const buildingType: BuildingType = CATEGORY_TO_BUILDING[category];

      buildings.push({
        id: `building-${memory.id}`,
        memoryId: memory.id,
        position,
        hexCoord,
        buildingType,
        category,
        label: memory.label,
        salience,
        emotionalValence,
        color: BUILDING_COLORS[buildingType],
        district: category,
      });
    }
  }

  return buildings;
}

// ============================================
// ROAD GENERATION
// ============================================

/**
 * Generate roads from graph edges between placed buildings
 */
function generateRoads(
  edges: ForceGraphLink[],
  buildingByMemoryId: Map<string, VillageBuilding>
): VillageRoad[] {
  const roads: VillageRoad[] = [];
  const roadSet = new Set<string>(); // Prevent duplicate roads

  for (const edge of edges) {
    // Get source and target as strings (may be objects after force graph processing)
    const sourceId = typeof edge.source === 'string' ? edge.source : (edge.source as { id: string }).id;
    const targetId = typeof edge.target === 'string' ? edge.target : (edge.target as { id: string }).id;

    const fromBuilding = buildingByMemoryId.get(sourceId);
    const toBuilding = buildingByMemoryId.get(targetId);

    // Only create roads between placed buildings
    if (!fromBuilding || !toBuilding) continue;

    // Skip self-loops
    if (fromBuilding.id === toBuilding.id) continue;

    // Create unique road ID (sorted to prevent duplicates)
    const roadKey = [fromBuilding.id, toBuilding.id].sort().join('-');
    if (roadSet.has(roadKey)) continue;
    roadSet.add(roadKey);

    roads.push({
      id: `road-${roadKey}`,
      fromId: fromBuilding.id,
      toId: toBuilding.id,
      fromPosition: fromBuilding.position,
      toPosition: toBuilding.position,
      weight: edge.weight,
      edgeType: edge.type,
    });
  }

  return roads;
}

// ============================================
// DISTRICT CALCULATION
// ============================================

/**
 * Calculate district boundaries from placed buildings
 */
function calculateDistricts(buildings: VillageBuilding[]): VillageDistrict[] {
  const districtBuildings = new Map<MemoryCategory, VillageBuilding[]>();

  // Group buildings by district
  for (const building of buildings) {
    const category = building.category;
    if (!districtBuildings.has(category)) {
      districtBuildings.set(category, []);
    }
    districtBuildings.get(category)!.push(building);
  }

  // Calculate district info
  const districts: VillageDistrict[] = [];

  for (const [category, districtBldgs] of districtBuildings) {
    if (districtBldgs.length === 0) continue;

    // Calculate center (average position)
    const sumX = districtBldgs.reduce((sum, b) => sum + b.position.x, 0);
    const sumZ = districtBldgs.reduce((sum, b) => sum + b.position.z, 0);

    const center: VillagePosition = {
      x: sumX / districtBldgs.length,
      z: sumZ / districtBldgs.length,
    };

    // Calculate bounds
    const positions = districtBldgs.map(b => b.position);
    const bounds = calculateBounds(positions);

    districts.push({
      category,
      center,
      buildingCount: districtBldgs.length,
      bounds,
    });
  }

  return districts;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Create an empty layout (for loading/error states)
 */
export function createEmptyLayout(): VillageLayout {
  return {
    buildings: [],
    roads: [],
    districts: [],
    bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
    stats: {
      totalBuildings: 0,
      totalRoads: 0,
      memoriesSkipped: 0,
    },
  };
}


// ============================================
// PROP GENERATION (Phase 5)
// ============================================

const TREE_TYPES: PropType[] = ['tree_a', 'tree_b'];
const DECOR_TYPES: PropType[] = ['barrel', 'crate_a', 'crate_b', 'sack'];
const ROCK_TYPES: PropType[] = ['rock_a', 'rock_b'];

// District-specific prop preferences (Phase 5 T7)
const DISTRICT_PROPS: Record<MemoryCategory, PropType[]> = {
  social: ['barrel', 'bucket', 'sack'],           // Tavern props
  learning: ['crate_a', 'crate_b', 'barrel'],     // Books/storage
  work: ['barrel', 'wheelbarrow', 'crate_a'],     // Workshop props
  reflection: ['rock_a', 'rock_b', 'bucket'],     // Peaceful props
  travel: ['crate_a', 'crate_b', 'sack'],         // Market goods
  health: ['barrel', 'bucket', 'sack'],           // Supplies
  misc: ['barrel', 'crate_a', 'sack'],            // General
};

/**
 * Generate valid hex tile set from layout (same logic as VillageGround)
 */
function generateValidHexTiles(layout: VillageLayout, hexSize: number = DEFAULT_HEX_SIZE): Set<string> {
  const validTiles = new Set<string>();
  const padding = 1; // Same as VillageGround
  
  // Add tiles for each district
  for (const district of layout.districts) {
    const { minX, maxX, minZ, maxZ } = district.bounds;
    const minHex = worldToHex({ x: minX, z: minZ }, hexSize);
    const maxHex = worldToHex({ x: maxX, z: maxZ }, hexSize);
    
    for (let q = minHex.q - padding; q <= maxHex.q + padding; q++) {
      for (let r = minHex.r - padding; r <= maxHex.r + padding; r++) {
        const worldPos = hexToWorld({ q, r }, hexSize);
        const inBounds =
          worldPos.x >= minX - hexSize * 2 &&
          worldPos.x <= maxX + hexSize * 2 &&
          worldPos.z >= minZ - hexSize * 2 &&
          worldPos.z <= maxZ + hexSize * 2;
        if (inBounds) {
          validTiles.add(`${q},${r}`);
        }
      }
    }
  }
  
  // Add center connector tiles
  const centerRange = 3;
  for (let q = -centerRange; q <= centerRange; q++) {
    for (let r = -centerRange; r <= centerRange; r++) {
      validTiles.add(`${q},${r}`);
    }
  }
  
  return validTiles;
}

/**
 * Generate props around buildings and at district edges
 */
export function generateProps(
  layout: VillageLayout,
  options: { propsPerBuilding?: number; treeDensity?: number } = {}
): VillageProp[] {
  const { propsPerBuilding = 2, treeDensity = 0.3 } = options;
  const props: VillageProp[] = [];
  const occupiedPositions = new Set<string>();
  const hexSize = DEFAULT_HEX_SIZE;
  
  // Generate valid hex tiles to constrain prop placement
  const validHexTiles = generateValidHexTiles(layout, hexSize);

  // Track building positions to avoid overlap
  layout.buildings.forEach((b) => {
    occupiedPositions.add(`${Math.round(b.position.x)},${Math.round(b.position.z)}`);
  });

  const isOccupied = (x: number, z: number): boolean => {
    const key = `${Math.round(x)},${Math.round(z)}`;
    return occupiedPositions.has(key);
  };

  const addOccupied = (x: number, z: number): void => {
    occupiedPositions.add(`${Math.round(x)},${Math.round(z)}`);
  };
  
  // Check if position is on valid hex tile
  const isOnValidTile = (x: number, z: number): boolean => {
    const hex = worldToHex({ x, z }, hexSize);
    return validHexTiles.has(`${hex.q},${hex.r}`);
  };

  // 1. Add decoration props near each building (district-specific)
  layout.buildings.forEach((building, buildingIdx) => {
    for (let i = 0; i < propsPerBuilding; i++) {
      const angle = (Math.PI * 2 * i) / propsPerBuilding + buildingIdx * 0.5;
      const distance = 1.5 + Math.random() * 0.5;
      const x = building.position.x + Math.cos(angle) * distance;
      const z = building.position.z + Math.sin(angle) * distance;

      if (isOccupied(x, z) || !isOnValidTile(x, z)) continue;

      // Use district-specific props for variety
      const districtProps = DISTRICT_PROPS[building.category] ?? DECOR_TYPES;
      const propType = districtProps[(buildingIdx + i) % districtProps.length];
      props.push({
        id: `prop-${building.id}-${i}`,
        propType,
        position: { x, z },
        rotation: Math.random() * Math.PI * 2,
        scale: 0.8 + Math.random() * 0.4,
      });
      addOccupied(x, z);
    }
  });

  // 2. Add trees and rocks on valid hex tiles (edge areas of districts)
  // Convert valid tiles to array for sampling
  const validTileArray = Array.from(validHexTiles).map(key => {
    const [q, r] = key.split(',').map(Number);
    return hexToWorld({ q, r }, hexSize);
  });
  
  // Shuffle for random distribution (seeded by layout size for consistency)
  const shuffled = [...validTileArray].sort(() => Math.random() - 0.5);
  
  // Place trees on valid tiles (no offset - place at hex centers only)
  const numTrees = Math.floor(layout.buildings.length * treeDensity * 1.5);
  let treeCount = 0;
  for (let i = 0; i < shuffled.length && treeCount < numTrees; i++) {
    const pos = shuffled[i];
    // Use hex center position directly - no offset that could push off tile
    const x = pos.x;
    const z = pos.z;
    
    if (isOccupied(x, z) || !isOnValidTile(x, z)) continue;
    
    props.push({
      id: `tree-${treeCount}`,
      propType: TREE_TYPES[treeCount % TREE_TYPES.length],
      position: { x, z },
      rotation: Math.random() * Math.PI * 2,
      scale: 0.9 + Math.random() * 0.3,
    });
    addOccupied(x, z);
    treeCount++;
  }

  // 3. Add scattered rocks on valid tiles (hex centers only)
  const numRocks = Math.floor(layout.buildings.length * 0.15);
  let rockCount = 0;
  for (let i = shuffled.length - 1; i >= 0 && rockCount < numRocks; i--) {
    const pos = shuffled[i];
    const x = pos.x;
    const z = pos.z;

    if (isOccupied(x, z) || !isOnValidTile(x, z)) continue;

    props.push({
      id: `rock-${rockCount}`,
      propType: ROCK_TYPES[rockCount % ROCK_TYPES.length],
      position: { x, z },
      rotation: Math.random() * Math.PI * 2,
      scale: 0.7 + Math.random() * 0.6,
    });
    addOccupied(x, z);
    rockCount++;
  }

  return props;
}


// ============================================
// VILLAGER GENERATION (Phase 5)
// ============================================

const ENTITY_TYPE_TO_VILLAGER: Record<string, VillagerType> = {
  person: 'peasant',
  organization: 'merchant',
  concept: 'scholar',
  location: 'guard',
  event: 'peasant',
  object: 'merchant',
};

/**
 * Generate villagers from entity nodes
 * Places villagers near buildings they're connected to
 */
export function generateVillagers(
  graphData: ForceGraphData,
  layout: VillageLayout
): VillageVillager[] {
  const villagers: VillageVillager[] = [];
  
  // Get entity nodes
  const entityNodes = graphData.nodes.filter(node => node.type === 'entity');
  
  // Build lookup for memory -> building
  const buildingByMemoryId = new Map(layout.buildings.map(b => [b.memoryId, b]));
  
  // Build lookup for entity -> connected memories (from edges)
  const entityToMemories = new Map<string, string[]>();
  
  graphData.links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as { id: string }).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as { id: string }).id;
    
    // Find edges connecting entities to memories
    const sourceNode = graphData.nodes.find(n => n.id === sourceId);
    const targetNode = graphData.nodes.find(n => n.id === targetId);
    
    if (sourceNode?.type === 'entity' && targetNode?.type === 'memory') {
      const list = entityToMemories.get(sourceId) ?? [];
      list.push(targetId);
      entityToMemories.set(sourceId, list);
    } else if (targetNode?.type === 'entity' && sourceNode?.type === 'memory') {
      const list = entityToMemories.get(targetId) ?? [];
      list.push(sourceId);
      entityToMemories.set(targetId, list);
    }
  });
  
  // Place villagers near their most connected building
  entityNodes.forEach((entity, idx) => {
    const connectedMemoryIds = entityToMemories.get(entity.id) ?? [];
    
    // Find the building with the most connections to this entity
    let bestBuilding: VillageBuilding | null = null;
    let maxConnections = 0;
    
    const buildingConnections = new Map<string, number>();
    connectedMemoryIds.forEach(memId => {
      const building = buildingByMemoryId.get(memId);
      if (building) {
        const count = (buildingConnections.get(building.id) ?? 0) + 1;
        buildingConnections.set(building.id, count);
        if (count > maxConnections) {
          maxConnections = count;
          bestBuilding = building;
        }
      }
    });
    
    // If no connected building, place near a random building
    if (!bestBuilding && layout.buildings.length > 0) {
      bestBuilding = layout.buildings[idx % layout.buildings.length];
    }
    
    if (!bestBuilding) return;
    
    // Position villager offset from building
    const angle = (idx * 137.5 * Math.PI / 180); // Golden angle for distribution
    const distance = 2 + (idx % 3) * 0.5;
    const position: VillagePosition = {
      x: bestBuilding.position.x + Math.cos(angle) * distance,
      z: bestBuilding.position.z + Math.sin(angle) * distance,
    };
    
    // Determine villager type from entity type
    const entityType = (entity.attributes?.entity_type as string) ?? 'person';
    const villagerType = ENTITY_TYPE_TO_VILLAGER[entityType] ?? 'peasant';
    
    villagers.push({
      id: `villager-${entity.id}`,
      entityId: entity.id,
      name: entity.label,
      entityType,
      villagerType,
      position,
      rotation: Math.random() * Math.PI * 2,
      nearBuildingId: bestBuilding.id,
    });
  });
  
  // Cap villagers for performance (max 30)
  return villagers.slice(0, 30);
}

