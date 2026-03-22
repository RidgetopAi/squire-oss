'use client';

// ============================================
// SQUIRE WEB - MIST PUFFS
// ============================================
// Large, soft, slowly drifting fog patches
// Lightweight alternative to post-processing bloom

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ============================================
// MIST PUFF SHADER
// ============================================

const puffVertexShader = /* glsl */ `
  uniform float uTime;

  attribute float aPhase;
  attribute float aSpeed;
  attribute float aSize;
  attribute vec3 aOffset;

  varying float vAlpha;
  varying vec2 vUv;

  void main() {
    vUv = uv;

    // Billboard - always face camera
    vec3 cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 cameraUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

    // Animated position - slow drift
    float phase = aPhase * 6.28;
    vec3 animatedPos = aOffset;
    animatedPos.x += sin(uTime * aSpeed * 0.1 + phase) * 3.0;
    animatedPos.y += sin(uTime * aSpeed * 0.05 + phase * 2.0) * 0.5;
    animatedPos.z += cos(uTime * aSpeed * 0.08 + phase) * 3.0;

    // Billboard positioning
    vec3 vertexPosition = animatedPos
      + cameraRight * position.x * aSize
      + cameraUp * position.y * aSize;

    vec4 mvPosition = modelViewMatrix * vec4(vertexPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Distance fade
    float dist = length(mvPosition.xyz);
    float distFade = smoothstep(50.0, 15.0, dist) * smoothstep(3.0, 8.0, dist);

    // Pulsing alpha
    float pulse = 0.7 + 0.3 * sin(uTime * 0.5 + phase);
    vAlpha = distFade * pulse;
  }
`;

const puffFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;

  varying float vAlpha;
  varying vec2 vUv;

  void main() {
    // Soft radial gradient
    vec2 center = vUv - 0.5;
    float dist = length(center) * 2.0;

    // Very soft falloff
    float alpha = 1.0 - smoothstep(0.0, 1.0, dist);
    alpha = pow(alpha, 1.5); // Softer edges
    alpha *= vAlpha * uOpacity;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

// ============================================
// MIST PUFFS COMPONENT
// ============================================

interface MistPuffsProps {
  count?: number;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  color?: string;
  opacity?: number;
  minSize?: number;
  maxSize?: number;
  minHeight?: number;
  maxHeight?: number;
}

export function MistPuffs({
  count = 20,
  bounds = { minX: -25, maxX: 25, minZ: -25, maxZ: 25 },
  color = '#a78bfa',
  opacity = 0.15,
  minSize = 4,
  maxSize = 10,
  minHeight = 0.5,
  maxHeight = 4,
}: MistPuffsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Generate puff attributes
  const { offsets, phases, speeds, sizes } = useMemo(() => {
    const offsets = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const sizes = new Float32Array(count);

    const rangeX = bounds.maxX - bounds.minX;
    const rangeZ = bounds.maxZ - bounds.minZ;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Random position within bounds
      offsets[i3] = bounds.minX + Math.random() * rangeX;
      offsets[i3 + 1] = minHeight + Math.random() * (maxHeight - minHeight);
      offsets[i3 + 2] = bounds.minZ + Math.random() * rangeZ;

      phases[i] = Math.random();
      speeds[i] = 0.5 + Math.random() * 1.0;
      sizes[i] = minSize + Math.random() * (maxSize - minSize);
    }

    return { offsets, phases, speeds, sizes };
  }, [count, bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, minHeight, maxHeight, minSize, maxSize]);

  // Create geometry with attributes
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);

    // Add instanced attributes
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 1));

    return geo;
  }, [offsets, phases, speeds, sizes]);

  // Uniforms
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
  }), [color, opacity]);

  // Animation
  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  // Cleanup
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, count]}
      frustumCulled={false}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={puffVertexShader}
        fragmentShader={puffFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.NormalBlending}
      />
    </instancedMesh>
  );
}

export default MistPuffs;
