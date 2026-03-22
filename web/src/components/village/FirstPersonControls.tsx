'use client';

// ============================================
// SQUIRE WEB - FIRST PERSON CONTROLS
// ============================================
// Walking camera experience for Memory Village
// WASD movement, mouse look, pointer lock, E key interaction

import { useRef, useEffect, useCallback, type ElementRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { Vector3 } from 'three';
import { useSetPointerLocked } from '@/lib/stores';
import type { VillageBuilding, VillageLayout } from '@/lib/types/village';

// ============================================
// CONSTANTS
// ============================================

const EYE_HEIGHT = 2.0; // Camera height above ground
const WALK_SPEED = 5; // Units per second
const SPRINT_SPEED = 10; // Sprint speed
const INTERACTION_DISTANCE = 4; // Distance to highlight buildings

// Module-level: persists across component remounts (mode switches)
let lastWalkPosition: { x: number; z: number } | null = null;

// ============================================
// KEYBOARD STATE
// ============================================

interface KeyboardState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  interact: boolean;
}

function useKeyboardState(): KeyboardState {
  const state = useRef<KeyboardState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    interact: false,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          state.current.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          state.current.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          state.current.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          state.current.right = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          state.current.sprint = true;
          break;
        case 'KeyE':
          state.current.interact = true;
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          state.current.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          state.current.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          state.current.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          state.current.right = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          state.current.sprint = false;
          break;
        case 'KeyE':
          state.current.interact = false;
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return state.current;
}

// ============================================
// MOVEMENT CONTROLLER
// ============================================

interface MovementControllerProps {
  keyboard: KeyboardState;
  bounds: VillageLayout['bounds'];
}

function MovementController({ keyboard, bounds }: MovementControllerProps) {
  const { camera } = useThree();
  const direction = useRef(new Vector3());
  const velocity = useRef(new Vector3());

  useFrame((_, delta) => {
    // Reset direction
    direction.current.set(0, 0, 0);

    // Calculate movement direction based on camera orientation
    if (keyboard.forward) direction.current.z -= 1;
    if (keyboard.backward) direction.current.z += 1;
    if (keyboard.left) direction.current.x -= 1;
    if (keyboard.right) direction.current.x += 1;

    // Normalize if moving diagonally
    if (direction.current.length() > 0) {
      direction.current.normalize();
    }

    // Apply speed
    const speed = keyboard.sprint ? SPRINT_SPEED : WALK_SPEED;
    velocity.current.copy(direction.current).multiplyScalar(speed * delta);

    // Transform direction to world space (based on camera yaw only)
    const yaw = Math.atan2(
      camera.matrix.elements[8],
      camera.matrix.elements[10]
    );
    const cos = Math.cos(-yaw);
    const sin = Math.sin(-yaw);
    const newX = velocity.current.x * cos - velocity.current.z * sin;
    const newZ = velocity.current.x * sin + velocity.current.z * cos;

    // Apply movement
    camera.position.x += newX;
    camera.position.z += newZ;

    // Lock Y to eye height (ground constraint)
    camera.position.y = EYE_HEIGHT;

    // Clamp to bounds with padding
    const padding = 5;
    camera.position.x = Math.max(bounds.minX - padding, Math.min(bounds.maxX + padding, camera.position.x));
    camera.position.z = Math.max(bounds.minZ - padding, Math.min(bounds.maxZ + padding, camera.position.z));
  });

  return null;
}

// ============================================
// BUILDING PROXIMITY DETECTOR
// ============================================

interface ProximityDetectorProps {
  buildings: VillageBuilding[];
  keyboard: KeyboardState;
  onProximityChange: (building: VillageBuilding | null) => void;
  onInteract: (building: VillageBuilding) => void;
}

function ProximityDetector({
  buildings,
  keyboard,
  onProximityChange,
  onInteract,
}: ProximityDetectorProps) {
  const { camera } = useThree();
  const lastNearbyRef = useRef<VillageBuilding | null>(null);
  const interactedRef = useRef(false);

  useFrame(() => {
    // Find closest building within interaction distance
    let closest: VillageBuilding | null = null;
    let closestDist = INTERACTION_DISTANCE;

    for (const building of buildings) {
      const dx = camera.position.x - building.position.x;
      const dz = camera.position.z - building.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < closestDist) {
        closest = building;
        closestDist = dist;
      }
    }

    // Notify if proximity changed
    if (closest !== lastNearbyRef.current) {
      lastNearbyRef.current = closest;
      onProximityChange(closest);
    }

    // Handle E key interaction
    if (keyboard.interact && closest && !interactedRef.current) {
      interactedRef.current = true;
      onInteract(closest);
    }
    if (!keyboard.interact) {
      interactedRef.current = false;
    }
  });

  return null;
}

// ============================================
// FIRST PERSON CONTROLS COMPONENT
// ============================================

export interface FirstPersonControlsProps {
  bounds: VillageLayout['bounds'];
  buildings: VillageBuilding[];
  onBuildingProximity?: (building: VillageBuilding | null) => void;
  onBuildingInteract?: (building: VillageBuilding) => void;
  initialPosition?: { x: number; z: number };
}

export function FirstPersonControls({
  bounds,
  buildings,
  onBuildingProximity,
  onBuildingInteract,
  initialPosition,
}: FirstPersonControlsProps) {
  const controlsRef = useRef<ElementRef<typeof PointerLockControls>>(null);
  const { camera } = useThree();
  const setPointerLocked = useSetPointerLocked();
  const keyboard = useKeyboardState();

  // Set initial camera position (only once on mount)
  useEffect(() => {
    const centerX = initialPosition?.x ?? (bounds.minX + bounds.maxX) / 2;
    const centerZ = initialPosition?.z ?? (bounds.minZ + bounds.maxZ) / 2;

    if (lastWalkPosition) {
      // Returning from fly mode - restore saved walk position
      camera.position.set(lastWalkPosition.x, EYE_HEIGHT, lastWalkPosition.z);
    } else {
      // First load - start at center
      camera.position.set(centerX, EYE_HEIGHT, centerZ);
      camera.lookAt(centerX, EYE_HEIGHT, centerZ - 10);
    }

    // Save position on unmount (for when returning from fly mode)
    return () => {
      lastWalkPosition = { x: camera.position.x, z: camera.position.z };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once per mount

  // Handle pointer lock events
  const handleLock = useCallback(() => {
    setPointerLocked(true);
  }, [setPointerLocked]);

  const handleUnlock = useCallback(() => {
    setPointerLocked(false);
  }, [setPointerLocked]);

  // Handle proximity changes
  const handleProximityChange = useCallback((building: VillageBuilding | null) => {
    onBuildingProximity?.(building);
  }, [onBuildingProximity]);

  // Handle building interaction
  const handleInteract = useCallback((building: VillageBuilding) => {
    onBuildingInteract?.(building);
  }, [onBuildingInteract]);

  return (
    <>
      <PointerLockControls
        ref={controlsRef}
        onLock={handleLock}
        onUnlock={handleUnlock}
      />
      <MovementController keyboard={keyboard} bounds={bounds} />
      <ProximityDetector
        buildings={buildings}
        keyboard={keyboard}
        onProximityChange={handleProximityChange}
        onInteract={handleInteract}
      />
    </>
  );
}

export default FirstPersonControls;
