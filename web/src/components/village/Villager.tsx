'use client';

// ============================================
// SQUIRE WEB - VILLAGER COMPONENT
// ============================================
// Renders entities as simple villager figures in the village
// Phase 5: Props, Villagers & Performance

import React, { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VillageVillager, VillagerType } from '@/lib/types/village';

// ============================================
// VILLAGER COLORS BY TYPE
// ============================================

const VILLAGER_COLORS: Record<VillagerType, { body: string; head: string }> = {
  peasant: { body: '#8B4513', head: '#DEB887' },
  merchant: { body: '#4B0082', head: '#DEB887' },
  scholar: { body: '#1E3A5F', head: '#DEB887' },
  guard: { body: '#B22222', head: '#DEB887' },
};

// ============================================
// SINGLE VILLAGER
// ============================================

interface VillagerFigureProps {
  villager: VillageVillager;
  hovered?: boolean;
  onClick?: (villager: VillageVillager) => void;
  onPointerOver?: (villager: VillageVillager) => void;
  onPointerOut?: () => void;
}

const VillagerFigure = memo(function VillagerFigure({
  villager,
  hovered,
  onClick,
  onPointerOver,
  onPointerOut,
}: VillagerFigureProps) {
  const groupRef = useRef<THREE.Group>(null);
  const colors = VILLAGER_COLORS[villager.villagerType];

  // Idle animation - visible sine bobbing
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    // Phase offset based on position for variety
    const phase = villager.position.x * 0.5 + villager.position.z * 0.3;
    // Bob up and down with visible amplitude
    groupRef.current.position.y = Math.sin(t * 1.5 + phase) * 0.08;
  });

  const handleClick = () => onClick?.(villager);
  const handlePointerOver = () => onPointerOver?.(villager);

  return (
    <group
      ref={groupRef}
      position={[villager.position.x, 0, villager.position.z]}
      rotation={[0, villager.rotation, 0]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={onPointerOut}
    >
      {/* Body - capsule shape */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.15, 0.5, 4, 8]} />
        <meshStandardMaterial
          color={colors.body}
          roughness={0.7}
          emissive={hovered ? colors.body : '#000000'}
          emissiveIntensity={hovered ? 0.3 : 0}
        />
      </mesh>

      {/* Head - sphere */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial
          color={colors.head}
          roughness={0.6}
        />
      </mesh>

      {/* Name label hover indicator */}
      {hovered && (
        <mesh position={[0, 1.4, 0]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
    </group>
  );
});

// ============================================
// VILLAGERS LAYER
// ============================================

interface VillagersLayerProps {
  villagers: VillageVillager[];
  hoveredVillagerId?: string | null;
  onVillagerClick?: (villager: VillageVillager) => void;
  onVillagerHover?: (villager: VillageVillager | null) => void;
}

export const VillagersLayer = memo(function VillagersLayer({
  villagers,
  hoveredVillagerId,
  onVillagerClick,
  onVillagerHover,
}: VillagersLayerProps) {
  if (villagers.length === 0) return null;

  return (
    <group name="villagers-layer">
      {villagers.map((villager) => (
        <VillagerFigure
          key={villager.id}
          villager={villager}
          hovered={hoveredVillagerId === villager.id}
          onClick={onVillagerClick}
          onPointerOver={onVillagerHover ? (v) => onVillagerHover(v) : undefined}
          onPointerOut={onVillagerHover ? () => onVillagerHover(null) : undefined}
        />
      ))}
    </group>
  );
});

export default VillagersLayer;
