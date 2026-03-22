'use client';

// ============================================
// SQUIRE WEB - LIGHT BEAM ROAD COMPONENT
// ============================================
// Animated curved light beam connecting buildings
// Replaces flat box roads with ethereal arcing beams

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VillageRoad } from '@/lib/types/village';
import {
  createBeamMaterial,
  updateBeamTime,
  createOuterGlowMaterial,
} from '@/lib/village/beamShader';

// ============================================
// CONSTANTS
// ============================================

// Arc height calculation
const MIN_ARC_HEIGHT = 2; // Minimum height for short distances
const MAX_ARC_HEIGHT = 8; // Cap for very long distances
const ARC_HEIGHT_RATIO = 0.4; // 40% of distance

// Tube geometry parameters
const TUBE_SEGMENTS = 48; // Smooth curve
const TUBE_RADIUS = 0.08; // Thin beam
const RADIAL_SEGMENTS = 6; // Hexagonal cross-section

// Outer glow parameters
const GLOW_RADIUS_MULTIPLIER = 2.5;

// Road colors by edge type (from original Road.tsx)
const ROAD_COLORS: Record<string, string> = {
  SIMILAR: '#3b82f6',   // blue-500
  TEMPORAL: '#22c55e',  // green-500
  CAUSAL: '#f59e0b',    // amber-500
  CO_OCCURS: '#8b5cf6', // violet-500
  MENTIONS: '#ec4899',  // pink-500
  default: '#60a5fa',   // blue-400 (brighter default for beams)
};

// ============================================
// CURVE GENERATION
// ============================================

/**
 * Create a curved path between two positions
 * Arc goes UP and over to avoid building collisions
 */
function createBeamCurve(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number
): THREE.QuadraticBezierCurve3 {
  // Start and end points slightly above ground
  const start = new THREE.Vector3(fromX, 0.5, fromZ);
  const end = new THREE.Vector3(toX, 0.5, toZ);

  // Calculate arc height based on distance
  const distance = start.distanceTo(end);
  const arcHeight = Math.min(Math.max(distance * ARC_HEIGHT_RATIO, MIN_ARC_HEIGHT), MAX_ARC_HEIGHT);

  // Control point at midpoint, elevated
  const midX = (fromX + toX) / 2;
  const midZ = (fromZ + toZ) / 2;
  const control = new THREE.Vector3(midX, arcHeight, midZ);

  return new THREE.QuadraticBezierCurve3(start, control, end);
}

// ============================================
// LIGHT BEAM COMPONENT
// ============================================

interface LightBeamRoadProps {
  road: VillageRoad;
  /** Unique phase offset for animation variety */
  phaseOffset?: number;
  /** Whether to show the outer glow layer */
  showGlow?: boolean;
}

/**
 * Single light beam road connecting two buildings
 * Features animated undulation and ethereal glow
 */
function LightBeamRoad({
  road,
  phaseOffset = 0,
  showGlow = true,
}: LightBeamRoadProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowMeshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  const { fromPosition, toPosition, edgeType } = road;

  // Get beam color from edge type
  const beamColor = ROAD_COLORS[edgeType] || ROAD_COLORS.default;

  // Memoize curve - only recalculate if positions change
  const curve = useMemo(() => {
    return createBeamCurve(
      fromPosition.x,
      fromPosition.z,
      toPosition.x,
      toPosition.z
    );
  }, [fromPosition.x, fromPosition.z, toPosition.x, toPosition.z]);

  // Memoize tube geometry
  const geometry = useMemo(() => {
    return new THREE.TubeGeometry(
      curve,
      TUBE_SEGMENTS,
      TUBE_RADIUS,
      RADIAL_SEGMENTS,
      false // not closed
    );
  }, [curve]);

  // Memoize outer glow geometry (larger radius)
  const glowGeometry = useMemo(() => {
    if (!showGlow) return null;
    return new THREE.TubeGeometry(
      curve,
      TUBE_SEGMENTS,
      TUBE_RADIUS * GLOW_RADIUS_MULTIPLIER,
      RADIAL_SEGMENTS,
      false
    );
  }, [curve, showGlow]);

  // Create materials
  const material = useMemo(() => {
    const mat = createBeamMaterial({
      color: beamColor,
      phase: phaseOffset,
    });
    materialRef.current = mat;
    return mat;
  }, [beamColor, phaseOffset]);

  const glowMaterial = useMemo(() => {
    if (!showGlow) return null;
    return createOuterGlowMaterial(beamColor);
  }, [beamColor, showGlow]);

  // Animate the beam
  useFrame((state) => {
    if (materialRef.current) {
      updateBeamTime(materialRef.current, state.clock.elapsedTime);
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
      if (glowGeometry) glowGeometry.dispose();
      if (glowMaterial) glowMaterial.dispose();
    };
  }, [geometry, material, glowGeometry, glowMaterial]);

  return (
    <group>
      {/* Main beam with undulating shader */}
      <mesh ref={meshRef} geometry={geometry} material={material} />

      {/* Outer glow layer */}
      {showGlow && glowGeometry && glowMaterial && (
        <mesh ref={glowMeshRef} geometry={glowGeometry} material={glowMaterial} />
      )}
    </group>
  );
}

// ============================================
// LIGHT BEAMS LAYER
// ============================================

interface LightBeamsLayerProps {
  roads: VillageRoad[];
  /** ID of currently selected building - only show connected roads */
  selectedBuildingId: string | null;
}

/**
 * Renders light beam roads only for the selected building's connections
 */
export function LightBeamsLayer({ roads, selectedBuildingId }: LightBeamsLayerProps) {
  // Filter to only roads connected to the selected building
  const visibleRoads = useMemo(() => {
    if (!selectedBuildingId) return [];
    return roads.filter(
      (road) =>
        road.fromId === selectedBuildingId || road.toId === selectedBuildingId
    );
  }, [roads, selectedBuildingId]);

  // If nothing selected, render nothing
  if (visibleRoads.length === 0) {
    return null;
  }

  return (
    <group name="light-beams">
      {visibleRoads.map((road, index) => (
        <LightBeamRoad
          key={road.id}
          road={road}
          phaseOffset={index * 0.7} // Stagger phases for variety
          showGlow={true}
        />
      ))}
    </group>
  );
}

export default LightBeamsLayer;
