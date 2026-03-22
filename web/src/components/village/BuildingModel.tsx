'use client';

// ============================================
// SQUIRE WEB - BUILDING MODEL COMPONENT
// ============================================
// Loads and renders GLTF models for buildings
// Uses KayKit Medieval Hexagon Pack models

import { useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { BuildingType } from '@/lib/types/village';
import { getModelConfig } from '@/lib/village/models';

// ============================================
// TYPES
// ============================================

interface BuildingModelProps {
  /** Building type determines which model to load */
  buildingType: BuildingType;
  /** Scale multiplier (based on salience) */
  scale?: number;
  /** Emissive intensity for hover/select glow */
  emissiveIntensity?: number;
  /** Emissive color for glow */
  emissiveColor?: string;
  /** Whether to cast shadows */
  castShadow?: boolean;
  /** Whether to receive shadows */
  receiveShadow?: boolean;
}

// ============================================
// GLTF MODEL COMPONENT
// ============================================

/**
 * Internal component that actually loads and renders the GLTF
 * Wrapped in Suspense by BuildingModel
 */
function GLTFModel({
  buildingType,
  scale = 1,
  emissiveIntensity = 0,
  emissiveColor = '#ffffff',
  castShadow = true,
  receiveShadow = true,
}: BuildingModelProps) {
  const config = getModelConfig(buildingType);
  const { scene } = useGLTF(config.path);
  const clonedSceneRef = useRef<THREE.Object3D | null>(null);
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  // Clone scene once and keep stable reference
  if (!clonedSceneRef.current) {
    const clone = scene.clone(true);
    const materials: THREE.MeshStandardMaterial[] = [];

    clone.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const material = child.material.clone();
        if (material instanceof THREE.MeshStandardMaterial) {
          materials.push(material);
        }
        child.material = material;
        child.castShadow = castShadow;
        child.receiveShadow = receiveShadow;
      }
    });

    materialsRef.current = materials;
    clonedSceneRef.current = clone;
  }

  // Update emissive properties imperatively each render
  const color = new THREE.Color(emissiveColor);
  materialsRef.current.forEach((material) => {
    material.emissive = color;
    material.emissiveIntensity = emissiveIntensity;
  });

  // Apply config transforms
  const finalScale = scale * config.scale;

  return (
    <primitive
      object={clonedSceneRef.current}
      scale={[finalScale, finalScale, finalScale]}
      rotation={[0, config.rotationY, 0]}
      position={[0, config.yOffset, 0]}
    />
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * BuildingModel - Renders a GLTF model for a building type
 *
 * NOTE: Does NOT include Suspense - caller must wrap in Suspense if needed.
 * This is important for LOD (Detailed) compatibility where Suspense inside
 * children breaks the distance-based visibility logic.
 *
 * @example
 * <BuildingModel
 *   buildingType="tavern"
 *   scale={1.2}
 *   emissiveIntensity={0.3}
 *   emissiveColor="#f472b6"
 * />
 */
export function BuildingModel(props: BuildingModelProps) {
  return <GLTFModel {...props} />;
}

export default BuildingModel;
