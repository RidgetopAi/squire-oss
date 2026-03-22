'use client';

// ============================================
// SQUIRE WEB - INSTANCED PROPS COMPONENT
// ============================================
// Efficient rendering of repeated props using R3F instancing
// Phase 5: Props, Villagers & Performance

import React, { memo, useMemo, useRef, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { PropType } from '@/lib/village/models';
import { getPropConfig, getPropPath } from '@/lib/village/models';
import type { VillageProp } from '@/lib/types/village';

// ============================================
// TYPES
// ============================================

export interface PropPlacement {
  id: string;
  propType: PropType;
  position: { x: number; z: number };
  rotation?: number;
  scale?: number;
}

type PropData = PropPlacement | VillageProp;

interface PropModelProps {
  propType: PropType;
  position: [number, number, number];
  rotation: number;
  scale: number;
}

// ============================================
// SINGLE PROP MODEL
// ============================================

const PropModel = memo(function PropModel({
  propType,
  position,
  rotation,
  scale,
}: PropModelProps) {
  const config = getPropConfig(propType);
  const { scene } = useGLTF(config.path);
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  
  const finalScale = scale * config.scale;
  const finalRotation = rotation + config.rotationY;

  return (
    <primitive
      object={clonedScene}
      position={position}
      rotation={[0, finalRotation, 0]}
      scale={[finalScale, finalScale, finalScale]}
    />
  );
});

// ============================================
// PROPS LAYER - Groups props by type for batching
// ============================================

interface PropsLayerProps {
  props: PropData[];
}

export const PropsLayer = memo(function PropsLayer({ props }: PropsLayerProps) {
  if (props.length === 0) return null;

  return (
    <group name="props-layer">
      {props.map((prop) => (
        <PropModel
          key={prop.id}
          propType={prop.propType}
          position={[prop.position.x, 0, prop.position.z]}
          rotation={prop.rotation ?? 0}
          scale={prop.scale ?? 1}
        />
      ))}
    </group>
  );
});

// ============================================
// INSTANCED MESH VERSION (for 100+ identical props)
// ============================================

interface InstancedPropGroupProps {
  propType: PropType;
  placements: PropPlacement[];
}

const InstancedPropGroup = memo(function InstancedPropGroup({
  propType,
  placements,
}: InstancedPropGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const config = getPropConfig(propType);
  const { scene } = useGLTF(config.path);

  const geometry = useMemo(() => {
    let geo: THREE.BufferGeometry | null = null;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && !geo) {
        geo = ((child as THREE.Mesh).geometry as THREE.BufferGeometry).clone();
      }
    });
    return geo ?? new THREE.BoxGeometry(0.5, 0.5, 0.5);
  }, [scene]);

  const material = useMemo(() => {
    let mat: THREE.Material | null = null;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && !mat) {
        mat = (child as THREE.Mesh).material as THREE.Material;
      }
    });
    return mat ?? new THREE.MeshStandardMaterial({ color: '#8B4513' });
  }, [scene]);

  // Cleanup: dispose cloned geometry on unmount
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  useMemo(() => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    placements.forEach((placement, i) => {
      position.set(placement.position.x, config.yOffset, placement.position.z);
      quaternion.setFromEuler(
        new THREE.Euler(0, (placement.rotation ?? 0) + config.rotationY, 0)
      );
      const s = (placement.scale ?? 1) * config.scale;
      scale.set(s, s, s);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [placements, config]);

  if (placements.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, placements.length]}
      castShadow
      receiveShadow
    />
  );
});

// ============================================
// OPTIMIZED PROPS LAYER - Uses instancing for large groups
// ============================================

interface OptimizedPropsLayerProps {
  props: PropPlacement[];
  instanceThreshold?: number;
}

const OptimizedPropsLayer = memo(function OptimizedPropsLayer({
  props,
  instanceThreshold = 10,
}: OptimizedPropsLayerProps) {
  const { grouped, instanced } = useMemo(() => {
    const byType = new Map<PropType, PropPlacement[]>();
    
    props.forEach((prop) => {
      const list = byType.get(prop.propType) ?? [];
      list.push(prop);
      byType.set(prop.propType, list);
    });

    const grouped: PropPlacement[] = [];
    const instanced: [PropType, PropPlacement[]][] = [];

    byType.forEach((list, type) => {
      if (list.length >= instanceThreshold) {
        instanced.push([type, list]);
      } else {
        grouped.push(...list);
      }
    });

    return { grouped, instanced };
  }, [props, instanceThreshold]);

  return (
    <group name="optimized-props-layer">
      {grouped.map((prop) => (
        <PropModel
          key={prop.id}
          propType={prop.propType}
          position={[prop.position.x, 0, prop.position.z]}
          rotation={prop.rotation ?? 0}
          scale={prop.scale ?? 1}
        />
      ))}
      {instanced.map(([type, placements]) => (
        <InstancedPropGroup
          key={`instanced-${type}`}
          propType={type}
          placements={placements}
        />
      ))}
    </group>
  );
});

export default PropsLayer;
