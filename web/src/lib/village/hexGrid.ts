// ============================================
// SQUIRE WEB - HEX GRID UTILITIES
// ============================================
// Hex grid math for village layout using axial coordinates

import type { HexCoord, VillagePosition } from '@/lib/types/village';

// ============================================
// CONSTANTS
// ============================================

/**
 * Default hex size (distance from center to corner)
 */
export const DEFAULT_HEX_SIZE = 2;

// ============================================
// COORDINATE CONVERSIONS
// ============================================

/**
 * Convert axial hex coordinates to world position
 * Uses pointy-top hex orientation
 *
 * @param coord - Axial hex coordinates (q, r)
 * @param hexSize - Size of each hex tile
 * @returns World position (x, z)
 */
export function hexToWorld(coord: HexCoord, hexSize: number = DEFAULT_HEX_SIZE): VillagePosition {
  // Validate inputs
  if (!coord || !Number.isFinite(coord.q) || !Number.isFinite(coord.r)) {
    console.warn('[hexToWorld] Invalid coord:', coord);
    return { x: 0, z: 0 };
  }
  if (!Number.isFinite(hexSize) || hexSize <= 0) {
    console.warn('[hexToWorld] Invalid hexSize:', hexSize);
    return { x: 0, z: 0 };
  }

  const { q, r } = coord;

  // Pointy-top hex layout
  const x = hexSize * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const z = hexSize * ((3 / 2) * r);

  return { x, z };
}

/**
 * Convert world position to nearest hex coordinates
 *
 * @param position - World position (x, z)
 * @param hexSize - Size of each hex tile
 * @returns Nearest axial hex coordinates
 */
export function worldToHex(position: VillagePosition, hexSize: number = DEFAULT_HEX_SIZE): HexCoord {
  const { x, z } = position;

  // Convert to fractional hex coordinates
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * z) / hexSize;
  const r = ((2 / 3) * z) / hexSize;

  // Round to nearest hex
  return hexRound(q, r);
}

/**
 * Round fractional hex coordinates to nearest integer hex
 * Uses cube coordinate rounding for accuracy
 */
function hexRound(q: number, r: number): HexCoord {
  // Convert to cube coordinates
  const s = -q - r;

  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);

  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);

  // Cube coordinates must sum to 0
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }

  return { q: rq, r: rr };
}

// ============================================
// SPIRAL PLACEMENT
// ============================================

/**
 * Generate hex positions in a spiral pattern from center
 * Used to place buildings within a district
 *
 * @param count - Number of positions to generate
 * @returns Array of hex coordinates in spiral order
 */
export function spiralHexPositions(count: number): HexCoord[] {
  if (count <= 0) return [];

  const positions: HexCoord[] = [{ q: 0, r: 0 }]; // Start at center

  if (count === 1) return positions;

  // Direction vectors for pointy-top hex (6 directions)
  // Order: SE, SW, W, NW, NE, E (walking counterclockwise from East start)
  const directions: HexCoord[] = [
    { q: 0, r: 1 },   // SE
    { q: -1, r: 1 },  // SW
    { q: -1, r: 0 },  // W
    { q: 0, r: -1 },  // NW
    { q: 1, r: -1 },  // NE
    { q: 1, r: 0 },   // E
  ];

  let current: HexCoord = { q: 0, r: 0 };
  let ring = 1;

  while (positions.length < count) {
    // Move to the start of the next ring (East direction)
    current = { q: current.q + 1, r: current.r };
    // Push the starting position of this ring
    positions.push({ ...current });
    if (positions.length >= count) break;

    // Walk around the ring (6 sides, each with 'ring' steps)
    for (let side = 0; side < 6 && positions.length < count; side++) {
      // Number of steps per side equals the ring number
      // On first side, we already pushed the start, so start from step 1
      const startStep = (side === 0) ? 1 : 0;
      for (let step = startStep; step < ring && positions.length < count; step++) {
        // Move in the current direction
        const dir = directions[side];
        current = { q: current.q + dir.q, r: current.r + dir.r };
        positions.push({ ...current });
      }
    }

    ring++;

    // Safety limit to prevent infinite loops
    if (ring > 20) break;
  }

  return positions.slice(0, count);
}

// ============================================
// BOUNDS CALCULATIONS
// ============================================

/**
 * Calculate bounding box from a list of positions
 */
export function calculateBounds(positions: VillagePosition[]): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  if (positions.length === 0) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const pos of positions) {
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x);
    minZ = Math.min(minZ, pos.z);
    maxZ = Math.max(maxZ, pos.z);
  }

  return { minX, maxX, minZ, maxZ };
}

// ============================================
// HEX OFFSET UTILITIES
// ============================================

/**
 * Add two hex coordinates together
 */
export function hexAdd(a: HexCoord, b: HexCoord): HexCoord {
  if (!a || !b) {
    console.warn('[hexAdd] Invalid input:', { a, b });
    return { q: 0, r: 0 };
  }
  return { q: a.q + b.q, r: a.r + b.r };
}

