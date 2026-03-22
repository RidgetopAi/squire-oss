'use client';

// ============================================
// SQUIRE WEB - HEX TILE COMPONENT
// ============================================
// Single hex ground tile for district visualization

import { useMemo } from 'react';
import * as THREE from 'three';
import type { HexCoord, VillagePosition, MemoryCategory } from '@/lib/types/village';
import { hexToWorld, DEFAULT_HEX_SIZE } from '@/lib/village/hexGrid';

// ============================================
// DISTRICT COLORS
// ============================================

/**
 * Ground colors for each district (darker than building colors)
 */
export const DISTRICT_GROUND_COLORS: Record<MemoryCategory, string> = {
  social: '#4a1942',      // Dark pink/magenta
  learning: '#1e3a5f',    // Dark blue
  work: '#4a2c17',        // Dark orange/brown
  reflection: '#2d1b4e',  // Dark violet
  travel: '#1a3d2e',      // Dark emerald
  health: '#4a4317',      // Dark yellow/olive
  misc: '#2a2a2e',        // Dark gray
};

/**
 * Edge/border colors for hex tiles
 */
export const DISTRICT_EDGE_COLORS: Record<MemoryCategory, string> = {
  social: '#f472b6',      // pink-400
  learning: '#60a5fa',    // blue-400
  work: '#fb923c',        // orange-400
  reflection: '#a78bfa',  // violet-400
  travel: '#34d399',      // emerald-400
  health: '#facc15',      // yellow-400
  misc: '#71717a',        // zinc-500
};

// ============================================
// HEX GEOMETRY
// ============================================

/**
 * Create a pointy-top hexagon shape
 * @param size - Distance from center to vertex
 */
function createHexShape(size: number): THREE.Shape {
  const shape = new THREE.Shape();

  // Pointy-top hexagon: first vertex at top
  for (let i = 0; i < 6; i++) {
    // Start at -90 degrees (top) and go clockwise
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const x = size * Math.cos(angle);
    const y = size * Math.sin(angle);

    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }
  shape.closePath();

  return shape;
}

// ============================================
// HEX TILE COMPONENT
// ============================================

export interface HexTileProps {
  /** Hex grid coordinates */
  hexCoord: HexCoord;
  /** District category for coloring */
  category: MemoryCategory;
  /** Hex size (default: DEFAULT_HEX_SIZE) */
  hexSize?: number;
  /** Opacity (default: 1) */
  opacity?: number;
  /** Show edge highlight */
  showEdge?: boolean;
  /** Y position offset (default: 0) */
  yOffset?: number;
}

/**
 * Single hex tile ground mesh
 */
function HexTile({
  hexCoord,
  category,
  hexSize = DEFAULT_HEX_SIZE,
  opacity = 1,
  showEdge = false,
  yOffset = 0,
}: HexTileProps) {
  // Convert hex coord to world position
  const position = useMemo(() => {
    return hexToWorld(hexCoord, hexSize);
  }, [hexCoord.q, hexCoord.r, hexSize]);

  // Create hex geometry
  const geometry = useMemo(() => {
    const shape = createHexShape(hexSize * 0.95); // Slightly smaller for gaps
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2); // Lay flat
    return geo;
  }, [hexSize]);

  // Edge geometry (slightly larger)
  const edgeGeometry = useMemo(() => {
    if (!showEdge) return null;
    const shape = createHexShape(hexSize * 0.98);
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [hexSize, showEdge]);

  const groundColor = DISTRICT_GROUND_COLORS[category];
  const edgeColor = DISTRICT_EDGE_COLORS[category];

  return (
    <group position={[position.x, yOffset, position.z]}>
      {/* Edge layer (below) */}
      {showEdge && edgeGeometry && (
        <mesh geometry={edgeGeometry} position={[0, -0.02, 0]} receiveShadow>
          <meshStandardMaterial
            color={edgeColor}
            opacity={opacity * 0.5}
            transparent
          />
        </mesh>
      )}

      {/* Main tile */}
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          color={groundColor}
          opacity={opacity}
          transparent={opacity < 1}
        />
      </mesh>
    </group>
  );
}

// ============================================
// HEX TILES LAYER
// ============================================

export interface HexTilesLayerProps {
  /** Array of hex coordinates to render */
  tiles: { coord: HexCoord; category: MemoryCategory }[];
  /** Hex size */
  hexSize?: number;
  /** Y position offset */
  yOffset?: number;
}

/**
 * Render multiple hex tiles efficiently
 */
export function HexTilesLayer({
  tiles,
  hexSize = DEFAULT_HEX_SIZE,
  yOffset = 0,
}: HexTilesLayerProps) {
  return (
    <group>
      {tiles.map((tile, index) => (
        <HexTile
          key={`hex-${tile.coord.q}-${tile.coord.r}`}
          hexCoord={tile.coord}
          category={tile.category}
          hexSize={hexSize}
          yOffset={yOffset}
        />
      ))}
    </group>
  );
}

export default HexTilesLayer;
