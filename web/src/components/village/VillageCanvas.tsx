'use client';

// ============================================
// SQUIRE WEB - VILLAGE CANVAS
// ============================================
// Main 3D scene content for Memory Village

import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls, PerspectiveCamera, Html } from '@react-three/drei';
import { useVillageLayout, useVillageSelection } from '@/lib/hooks/useVillageLayout';
import { useCameraMode } from '@/lib/stores';
import { BuildingsLayer } from './Building';
import { LightBeamsLayer } from './LightBeamRoad';
import { VillageGround } from './DistrictGround';
import { DISTRICT_EDGE_COLORS } from './HexTile';
import { PropsLayer } from './InstancedProps';
import { VillagersLayer } from './Villager';
import { FirstPersonControls } from './FirstPersonControls';
import { GroundMist, EtherealWisps } from './GroundMist';
import { MistPuffs } from './MistPuffs';
import { AuroraSky } from './AuroraSky';
import { DreamParticles } from './DreamParticles';
// DreamEffects (post-processing) removed - too GPU heavy
// import { DreamEffects } from './DreamEffects';
import { DreamLighting, DreamAtmosphere } from './DreamLighting';
import { preloadAllBuildingModels, preloadAllPropModels } from '@/lib/village/models';
import type { VillageBuilding, VillageLayout, VillageDistrict, VillageProp, VillageVillager } from '@/lib/types/village';
import type { CameraMode } from '@/lib/stores';

// Preload all GLTF models at module load time
// This starts fetching models before the scene renders
preloadAllBuildingModels();
preloadAllPropModels();

// ============================================
// SIMPLE GROUND (for loading/empty states)
// ============================================

function SimpleGround() {
  return (
    <>
      {/* Simple dark ground plane for loading/empty states */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[30, 32]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      {/* Shadow receiver */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <shadowMaterial opacity={0.3} />
      </mesh>
    </>
  );
}

// ============================================
// ATMOSPHERE & LIGHTING
// ============================================
// Now using DreamAtmosphere and DreamLighting from DreamLighting.tsx
// for enhanced dreamy effects with animated color shifts

// ============================================
// DISTRICT ACCENT LIGHTS
// ============================================

interface DistrictLightsProps {
  districts: VillageDistrict[];
}

/**
 * Colored point lights at each district center
 * Creates localized atmosphere matching district theme
 */
function DistrictLights({ districts }: DistrictLightsProps) {
  return (
    <group>
      {districts.map((district) => {
        const color = DISTRICT_EDGE_COLORS[district.category];
        return (
          <pointLight
            key={`district-light-${district.category}`}
            position={[district.center.x, 4, district.center.z]}
            intensity={0.4}
            color={color}
            distance={15}
            decay={2}
          />
        );
      })}
    </group>
  );
}

// ============================================
// CAMERA RIG
// ============================================

interface CameraRigProps {
  bounds: VillageLayout['bounds'];
  mode: CameraMode;
  buildings: VillageBuilding[];
  onBuildingProximity?: (building: VillageBuilding | null) => void;
  onBuildingInteract?: (building: VillageBuilding) => void;
}

// Memoize initial position to prevent object recreation
const useCameraCenter = (bounds: VillageLayout['bounds']) => {
  return useMemo(() => {
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const rangeX = bounds.maxX - bounds.minX;
    const rangeZ = bounds.maxZ - bounds.minZ;
    const maxRange = Math.max(rangeX, rangeZ, 20);
    const cameraDistance = maxRange * 0.8;
    return { centerX, centerZ, cameraDistance };
  }, [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ]);
};

function CameraRig({ bounds, mode, buildings, onBuildingProximity, onBuildingInteract }: CameraRigProps) {
  const { centerX, centerZ, cameraDistance } = useCameraCenter(bounds);

  if (mode === 'walk') {
    return (
      <>
        <PerspectiveCamera
          makeDefault
          fov={70}
          near={0.1}
          far={500}
        />
        <FirstPersonControls
          bounds={bounds}
          buildings={buildings}
          onBuildingProximity={onBuildingProximity}
          onBuildingInteract={onBuildingInteract}
          initialPosition={{ x: centerX, z: centerZ }}
        />
      </>
    );
  }

  // Fly mode - separate camera and controls
  return (
    <>
      <FlyModeCamera
        centerX={centerX}
        centerZ={centerZ}
        cameraDistance={cameraDistance}
      />
      <OrbitControls
        target={[centerX, 0, centerZ]}
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={100}
        maxPolarAngle={Math.PI / 2.1}
        minPolarAngle={0.2}
        zoomSpeed={0.3}
      />
    </>
  );
}

// Fly mode camera - sets position imperatively to avoid prop-based resets
function FlyModeCamera({ centerX, centerZ, cameraDistance }: {
  centerX: number;
  centerZ: number;
  cameraDistance: number;
}) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);

  // Set camera position after mount
  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.position.set(
        centerX + cameraDistance,
        cameraDistance * 0.7,
        centerZ + cameraDistance
      );
      cameraRef.current.lookAt(centerX, 0, centerZ);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      fov={50}
      near={0.1}
      far={500}
    />
  );
}

// ============================================
// EMPTY STATE
// ============================================

function EmptyState() {
  return (
    <group>
      {/* Show a simple indicator that village is empty */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color="#475569"
          opacity={0.5}
          transparent
        />
      </mesh>
    </group>
  );
}

// ============================================
// LOADING STATE (3D)
// ============================================

function LoadingState() {
  return (
    <group>
      {/* Animated loading indicator */}
      <mesh position={[0, 1, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          color="#a78bfa"
          emissive="#a78bfa"
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}

// ============================================
// UPDATING INDICATOR (DOM OVERLAY)
// ============================================

function UpdatingIndicator() {
  return (
    <Html
      position={[0, 0, 0]}
      center
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        transform: 'none',
      }}
      calculatePosition={() => [window.innerWidth - 120, 16, 0]}
    >
      <div className="flex items-center gap-2 rounded-lg border border-violet-500/30 bg-background/90 px-3 py-1.5 backdrop-blur-sm">
        <div className="h-2 w-2 animate-pulse rounded-full bg-violet-500" />
        <span className="text-xs text-violet-400">Updating...</span>
      </div>
    </Html>
  );
}

// ============================================
// VILLAGE CONTENT
// ============================================

interface VillageContentProps {
  layout: VillageLayout;
  props: VillageProp[];
  villagers: VillageVillager[];
  selectedBuildingId: string | null;
  hoveredBuildingId: string | null;
  nearbyBuildingId: string | null;
  cameraMode: CameraMode;
  onBuildingClick: (building: VillageBuilding) => void;
  onBuildingHover: (building: VillageBuilding | null) => void;
  onBuildingProximity: (building: VillageBuilding | null) => void;
}

function VillageContent({
  layout,
  props,
  villagers,
  selectedBuildingId,
  hoveredBuildingId,
  nearbyBuildingId,
  cameraMode,
  onBuildingClick,
  onBuildingHover,
  onBuildingProximity,
}: VillageContentProps) {
  // Combine hover and proximity for highlighting
  const highlightedBuildingId = hoveredBuildingId || nearbyBuildingId;

  // Calculate bounds for atmospheric effects
  const effectBounds = useMemo(() => ({
    minX: layout.bounds.minX - 10,
    maxX: layout.bounds.maxX + 10,
    minZ: layout.bounds.minZ - 10,
    maxZ: layout.bounds.maxZ + 10,
  }), [layout.bounds]);

  return (
    <>
      <CameraRig
        bounds={layout.bounds}
        mode={cameraMode}
        buildings={layout.buildings}
        onBuildingProximity={onBuildingProximity}
        onBuildingInteract={onBuildingClick}
      />

      {/* Dream World Atmosphere */}
      <DreamAtmosphere fogNear={20} fogFar={90} />
      <DreamLighting enableAnimation />

      {/* District accent lights */}
      <DistrictLights districts={layout.districts} />

      {/* Ground mist - swirling fog layers (heavy for floating feel) */}
      <GroundMist
        size={Math.max(effectBounds.maxX - effectBounds.minX, effectBounds.maxZ - effectBounds.minZ) + 30}
        height={0.1}
        opacity={0.6}
        layers={3}
        color="#9333ea"
      />

      {/* Ethereal wisps - vertical mist columns */}
      <EtherealWisps count={10} bounds={effectBounds} color="#a855f7" />

      {/* Drifting mist puffs - large soft fog patches floating through */}
      <MistPuffs
        count={15}
        bounds={effectBounds}
        color="#c4b5fd"
        opacity={0.12}
        minSize={5}
        maxSize={12}
        minHeight={1}
        maxHeight={5}
      />

      {/* Aurora sky - purple/green, wraps horizon */}
      <AuroraSky
        intensity={0.6}
        color1="#a855f7"
        color2="#22c55e"
        color3="#7c3aed"
      />

      {/* Floating particles - small, sparse, drifting through village (tight bounds) */}
      <DreamParticles
        count={80}
        bounds={{
          minX: layout.bounds.minX,
          maxX: layout.bounds.maxX,
          minZ: layout.bounds.minZ,
          maxZ: layout.bounds.maxZ,
        }}
        color1="#c4b5fd"
        color2="#86efac"
        size={10}
      />

      {/* District hex tile ground */}
      <VillageGround layout={layout} />

      {/* Light beam roads (curved, animated, only show for selected building) */}
      <LightBeamsLayer
        roads={layout.roads}
        selectedBuildingId={selectedBuildingId}
      />

      {/* Props (barrels, trees, rocks - between roads and buildings) */}
      <PropsLayer props={props} />

      {/* Villagers (entities as characters) */}
      <VillagersLayer villagers={villagers} />

      {/* Buildings */}
      <BuildingsLayer
        buildings={layout.buildings}
        selectedBuildingId={selectedBuildingId}
        hoveredBuildingId={highlightedBuildingId}
        onBuildingClick={onBuildingClick}
        onBuildingHover={onBuildingHover}
      />

      {/* Post-processing removed - too GPU heavy */}
    </>
  );
}

// ============================================
// MAIN CANVAS COMPONENT
// ============================================

export interface VillageCanvasProps {
  /** Callback when a building is selected */
  onBuildingSelect?: (building: VillageBuilding | null) => void;
  /** Callback when a building is hovered */
  onBuildingHover?: (building: VillageBuilding | null) => void;
}

/**
 * Main village canvas content
 * Fetches graph data and renders the village layout
 */
export function VillageCanvas({ onBuildingSelect, onBuildingHover }: VillageCanvasProps) {
  // Fetch layout data
  const { layout, props, villagers, isLoading, isFetching, isError, isEmpty } = useVillageLayout({
    maxBuildings: 120,
    minSalience: 0,
  });

  // Track if we're updating (fetching but not initial load)
  const isUpdating = isFetching && !isLoading;

  // Camera mode from store
  const cameraMode = useCameraMode();

  // Selection state
  const {
    selection,
    selectBuilding,
    hoverBuilding,
  } = useVillageSelection();

  // Track nearby building for walk mode proximity
  const [nearbyBuildingId, setNearbyBuildingId] = useState<string | null>(null);

  // Handle building click
  const handleBuildingClick = useCallback((building: VillageBuilding) => {
    const isAlreadySelected = selection.buildingId === building.id;
    const newBuildingId = isAlreadySelected ? null : building.id;
    const newMemoryId = isAlreadySelected ? null : building.memoryId;
    const newBuilding = isAlreadySelected ? null : building;

    selectBuilding(newBuildingId, newMemoryId);
    onBuildingSelect?.(newBuilding);
  }, [selection.buildingId, selectBuilding, onBuildingSelect]);

  // Handle building hover (fly mode)
  const handleBuildingHover = useCallback((building: VillageBuilding | null) => {
    hoverBuilding(building?.id ?? null);
    onBuildingHover?.(building);
  }, [hoverBuilding, onBuildingHover]);

  // Handle building proximity (walk mode)
  const handleBuildingProximity = useCallback((building: VillageBuilding | null) => {
    setNearbyBuildingId(building?.id ?? null);
    // Also update hover state for tooltip display
    onBuildingHover?.(building);
  }, [onBuildingHover]);

  // Default camera for loading/empty states
  const defaultBounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

  // Loading state - always use fly mode
  if (isLoading) {
    return (
      <>
        <CameraRig bounds={defaultBounds} mode="fly" buildings={[]} />
        <DreamLighting enableAnimation={false} />
        <DreamAtmosphere />
        <SimpleGround />
        <LoadingState />
      </>
    );
  }

  // Error state - always use fly mode
  if (isError) {
    return (
      <>
        <CameraRig bounds={defaultBounds} mode="fly" buildings={[]} />
        <DreamLighting enableAnimation={false} />
        <DreamAtmosphere />
        <SimpleGround />
        <EmptyState />
      </>
    );
  }

  // Empty state - always use fly mode
  if (isEmpty) {
    return (
      <>
        <CameraRig bounds={defaultBounds} mode="fly" buildings={[]} />
        <DreamLighting enableAnimation={false} />
        <DreamAtmosphere />
        <SimpleGround />
        <EmptyState />
      </>
    );
  }

  // Main content
  return (
    <>
      <VillageContent
        layout={layout}
        props={props}
        villagers={villagers}
        selectedBuildingId={selection.buildingId}
        hoveredBuildingId={selection.hoveredBuildingId}
        nearbyBuildingId={nearbyBuildingId}
        cameraMode={cameraMode}
        onBuildingClick={handleBuildingClick}
        onBuildingHover={handleBuildingHover}
        onBuildingProximity={handleBuildingProximity}
      />
      {/* Subtle updating indicator during refetch */}
      {isUpdating && <UpdatingIndicator />}
    </>
  );
}

export default VillageCanvas;
