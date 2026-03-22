'use client';

// ============================================
// SQUIRE WEB - AURORA SKY
// ============================================
// Animated aurora borealis effect on sky dome
// Performance-friendly dreamy atmosphere

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ============================================
// AURORA SHADERS
// ============================================

const auroraVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const auroraFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uIntensity;

  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    // Normalize to get sphere position
    vec3 dir = normalize(vWorldPosition);
    float height = dir.y;

    // Show aurora from below horizon to top
    if (height < -0.2) discard;

    // Horizontal position - use cos/sin separately to avoid seam
    // This creates smooth wrapping without the atan discontinuity
    float cx = dir.x;
    float cz = dir.z;

    // Animated waves using cos/sin of position (no seam!)
    float wave1 = sin(cx * 3.0 + cz * 2.0 + uTime * 0.15) * 0.5 + 0.5;
    float wave2 = sin(cx * 2.0 - cz * 3.0 - uTime * 0.12 + 1.5) * 0.5 + 0.5;
    float wave3 = cos(cx * 4.0 + cz * 1.5 + uTime * 0.1 + 3.0) * 0.5 + 0.5;

    // Combine waves for organic pattern
    float pattern = wave1 * 0.4 + wave2 * 0.35 + wave3 * 0.25;

    // Curtain effect - visible from horizon up
    float curtain = smoothstep(-0.15, 0.1, height) * smoothstep(0.95, 0.3, height);

    // Strong band at horizon for that enveloping feel
    float horizonBand = smoothstep(-0.15, 0.0, height) * smoothstep(0.25, 0.05, height);
    curtain = max(curtain * pattern, horizonBand * 0.8);

    // Gentle shimmer
    float shimmer = 0.9 + 0.1 * sin(uTime * 1.2 + cx * 5.0 + cz * 5.0);

    // Color blend - purple to green aurora
    vec3 color = mix(uColor1, uColor2, wave1);
    color = mix(color, uColor3, wave2 * 0.6);

    // Extra purple near horizon
    color = mix(color, uColor1, horizonBand * 0.4);

    // Final alpha
    float alpha = curtain * uIntensity * shimmer;

    // Smooth fade at bottom
    alpha *= smoothstep(-0.2, -0.05, height);

    gl_FragColor = vec4(color, alpha);
  }
`;

// ============================================
// AURORA SKY COMPONENT
// ============================================

interface AuroraSkyProps {
  radius?: number;
  color1?: string;
  color2?: string;
  color3?: string;
  intensity?: number;
}

export function AuroraSky({
  radius = 80,
  color1 = '#8b5cf6', // Violet
  color2 = '#3b82f6', // Blue
  color3 = '#10b981', // Emerald
  intensity = 0.4,
}: AuroraSkyProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color(color1) },
      uColor2: { value: new THREE.Color(color2) },
      uColor3: { value: new THREE.Color(color3) },
      uIntensity: { value: intensity },
    }),
    [color1, color2, color3, intensity]
  );

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  return (
    <mesh>
      <sphereGeometry args={[radius, 32, 16]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={auroraVertexShader}
        fragmentShader={auroraFragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export default AuroraSky;
