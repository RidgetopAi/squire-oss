'use client';

// ============================================
// SQUIRE WEB - VILLAGE BUILDING COMPONENT
// ============================================
// Renders a memory as a 3D building using GLTF models
// P3-T7: Performance optimizations with memoization and LOD

import React, { memo, useRef, useMemo, useCallback, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Group, Mesh } from 'three';
import type { VillageBuilding } from '@/lib/types/village';
import { BuildingModel } from './BuildingModel';

// ============================================
// LOD FALLBACK (simple box for distant views)
// ============================================

interface SimpleBuildingProps {
  scale: number;
  color: string;
}

/**
 * Simple box geometry for LOD - shown at distance for performance
 */
function SimpleBuilding({ scale, color }: SimpleBuildingProps) {
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[0.8 * scale, 1.2 * scale, 0.8 * scale]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

// Simple distance-based LOD using refs (NO STATE) to avoid re-render cascade
// Directly toggles THREE.js object visibility instead of React state
interface DistanceLODProps {
  threshold: number;
  near: React.ReactNode;
  far: React.ReactNode;
}

// Reusable Vector3 for LOD distance calculations (avoids GC pressure)
const _worldPos = new THREE.Vector3();

function DistanceLOD({ threshold, near, far }: DistanceLODProps) {
  const groupRef = useRef<THREE.Group>(null);
  const nearRef = useRef<THREE.Group>(null);
  const farRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!groupRef.current || !nearRef.current || !farRef.current) return;
    groupRef.current.getWorldPosition(_worldPos);
    const distance = camera.position.distanceTo(_worldPos);
    const shouldBeNear = distance < threshold;

    // Directly set visibility on THREE.js objects - no React re-render!
    nearRef.current.visible = shouldBeNear;
    farRef.current.visible = !shouldBeNear;
  });

  return (
    <group ref={groupRef}>
      <group ref={nearRef}>{near}</group>
      <group ref={farRef} visible={false}>{far}</group>
    </group>
  );
}

// ============================================
// BUILDING COMPONENT
// ============================================

interface BuildingProps {
  building: VillageBuilding;
  /** Whether this building is selected */
  selected?: boolean;
  /** Whether this building is hovered */
  hovered?: boolean;
  /** Click handler */
  onClick?: (building: VillageBuilding) => void;
  /** Hover handlers */
  onPointerOver?: (building: VillageBuilding) => void;
  onPointerOut?: () => void;
}

/**
 * Building component - renders a memory as a 3D building using GLTF models
 * Scale varies based on salience (0.7 to 1.3x)
 *
 * Performance optimizations (P3-T7):
 * - Memoized with React.memo to prevent unnecessary re-renders
 * - LOD (Level of Detail): shows simple box at distance > 40 units
 * - Memoized computed values
 */
const Building = memo(function Building({
  building,
  selected = false,
  hovered = false,
  onClick,
  onPointerOver,
  onPointerOut,
}: BuildingProps) {
  const groupRef = useRef<Group>(null);

  // Validate position - skip rendering if invalid
  if (!Number.isFinite(building.position.x) || !Number.isFinite(building.position.z)) {
    console.warn('[Building] Invalid position:', building.id, building.position);
    return null;
  }

  // Memoize computed values
  const { baseScale, emissiveIntensity } = useMemo(() => {
    const salience = Number.isFinite(building.salience) ? building.salience : 0.5;
    return {
      baseScale: 0.7 + salience * 0.6, // 0.7 to 1.3
      emissiveIntensity: selected ? 0.4 : hovered ? 0.2 : 0,
    };
  }, [building.salience, selected, hovered]);

  // Base Y position for hover animation
  const baseY = 0;

  // Animate hover effect (lift building slightly)
  useFrame((_, delta) => {
    if (groupRef.current) {
      const targetY = hovered || selected ? baseY + 0.15 : baseY;
      groupRef.current.position.y += (targetY - groupRef.current.position.y) * delta * 8;
    }
  });

  // Memoize event handlers
  const handlePointerOver = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
    onPointerOver?.(building);
  }, [building, onPointerOver]);

  const handlePointerOut = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    document.body.style.cursor = 'auto';
    onPointerOut?.();
  }, [onPointerOut]);

  const handleClick = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onClick?.(building);
  }, [building, onClick]);

  return (
    <group
      position={[building.position.x, 0, building.position.z]}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      {/* Animated wrapper for hover lift */}
      <group ref={groupRef} position={[0, baseY, 0]}>
        {/* Distance-based LOD: GLTF when close, simple box when far */}
        <DistanceLOD
          threshold={40}
          near={
            <Suspense fallback={<SimpleBuilding scale={baseScale} color={building.color} />}>
              <BuildingModel
                buildingType={building.buildingType}
                scale={baseScale}
                emissiveIntensity={emissiveIntensity}
                emissiveColor={building.color}
                castShadow
                receiveShadow
              />
            </Suspense>
          }
          far={<SimpleBuilding scale={baseScale} color={building.color} />}
        />
      </group>
    </group>
  );
});

// ============================================
// BUILDINGS LAYER COMPONENT
// ============================================

interface BuildingsLayerProps {
  buildings: VillageBuilding[];
  /** ID of currently selected building */
  selectedBuildingId?: string | null;
  /** ID of currently hovered building */
  hoveredBuildingId?: string | null;
  /** Click handler */
  onBuildingClick?: (building: VillageBuilding) => void;
  /** Hover handlers */
  onBuildingHover?: (building: VillageBuilding | null) => void;
}

/**
 * Renders all buildings in the village
 * Memoized to prevent re-renders when parent updates
 */
export const BuildingsLayer = memo(function BuildingsLayer({
  buildings,
  selectedBuildingId,
  hoveredBuildingId,
  onBuildingClick,
  onBuildingHover,
}: BuildingsLayerProps) {
  // Memoize hover callbacks to prevent Building re-renders
  const handlePointerOver = useCallback((b: VillageBuilding) => {
    onBuildingHover?.(b);
  }, [onBuildingHover]);

  const handlePointerOut = useCallback(() => {
    onBuildingHover?.(null);
  }, [onBuildingHover]);

  return (
    <group name="buildings">
      {buildings.map((building, index) => (
        <Building
          key={building.id}
          building={building}
          selected={building.id === selectedBuildingId}
          hovered={building.id === hoveredBuildingId}
          onClick={onBuildingClick}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        />
      ))}
    </group>
  );
});

export default BuildingsLayer;
