'use client';

// ============================================
// SQUIRE WEB - GROUND MIST
// ============================================
// Swirling fog effect at ground level for
// dreamy memory village atmosphere

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ============================================
// MIST SHADERS
// ============================================

const mistVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const mistFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec3 uCameraPosition;

  varying vec2 vUv;
  varying vec3 vWorldPosition;

  // Simplex noise functions
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // Fractal Brownian Motion (reduced octaves for performance)
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < 2; i++) {
      value += amplitude * snoise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }

    return value;
  }

  void main() {
    // Animated noise coordinates
    vec3 noiseCoord = vec3(
      vWorldPosition.x * 0.05 + uTime * 0.02,
      vWorldPosition.z * 0.05 + uTime * 0.015,
      uTime * 0.03
    );

    // Layered noise for swirling effect
    float noise1 = fbm(noiseCoord);
    float noise2 = fbm(noiseCoord * 2.0 + vec3(100.0, 0.0, 50.0));

    // Combine for swirl pattern
    float mist = (noise1 + noise2 * 0.5) * 0.5 + 0.5;
    mist = smoothstep(0.2, 0.8, mist);

    // Distance fade from camera (closer = more visible, but not too close)
    float dist = length(vWorldPosition.xz - uCameraPosition.xz);
    float distFade = smoothstep(5.0, 15.0, dist) * smoothstep(80.0, 40.0, dist);

    // Edge fade (fade out at edges of plane)
    float edgeFade = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
    edgeFade *= smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);

    // Final alpha
    float alpha = mist * uOpacity * distFade * edgeFade;

    // Slight color variation
    vec3 finalColor = uColor * (0.9 + noise1 * 0.2);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// ============================================
// GROUND MIST COMPONENT
// ============================================

interface GroundMistProps {
  size?: number;
  height?: number;
  color?: string;
  opacity?: number;
  layers?: number;
}

export function GroundMist({
  size = 100,
  height = 0.5,
  color = '#8b7ec8',
  opacity = 0.4,
  layers = 3,
}: GroundMistProps) {
  const materialRefs = useRef<THREE.ShaderMaterial[]>([]);

  // Create stable uniforms for each layer - NO spreading on every render
  const layerUniforms = useMemo(() => {
    const uniformsArray = [];
    for (let i = 0; i < layers; i++) {
      uniformsArray.push({
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity * (1 - i * 0.2) },
        uCameraPosition: { value: new THREE.Vector3() },
      });
    }
    return uniformsArray;
  }, [color, opacity, layers]);

  // Animation - update uniforms directly via refs
  useFrame(({ clock, camera }) => {
    const time = clock.getElapsedTime();
    materialRefs.current.forEach((mat) => {
      if (mat) {
        mat.uniforms.uTime.value = time;
        mat.uniforms.uCameraPosition.value.copy(camera.position);
      }
    });
  });

  // Create multiple layers at different heights
  const layerHeights = useMemo(() => {
    const heights: number[] = [];
    for (let i = 0; i < layers; i++) {
      heights.push(height + i * 0.8);
    }
    return heights;
  }, [layers, height]);

  return (
    <group>
      {layerHeights.map((y, index) => (
        <mesh
          key={index}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, y, 0]}
        >
          <planeGeometry args={[size, size, 1, 1]} />
          <shaderMaterial
            ref={(el) => {
              if (el) materialRefs.current[index] = el;
            }}
            vertexShader={mistVertexShader}
            fragmentShader={mistFragmentShader}
            uniforms={layerUniforms[index]}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.NormalBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

// ============================================
// ETHEREAL WISPS (VERTICAL MIST COLUMNS)
// ============================================

const wispVertexShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vHeight;

  void main() {
    vUv = uv;
    vHeight = position.y;

    vec3 pos = position;

    // Gentle sway
    float sway = sin(uTime * 0.5 + position.y * 0.5) * 0.3;
    pos.x += sway;
    pos.z += cos(uTime * 0.3 + position.y * 0.3) * 0.2;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const wispFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;

  varying vec2 vUv;
  varying float vHeight;

  void main() {
    // Fade at top and bottom
    float heightFade = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);

    // Horizontal fade (center brighter)
    float horizFade = 1.0 - abs(vUv.x - 0.5) * 2.0;
    horizFade = pow(horizFade, 2.0);

    // Animated shimmer
    float shimmer = 0.8 + 0.2 * sin(uTime * 2.0 + vHeight * 3.0);

    float alpha = heightFade * horizFade * uOpacity * shimmer;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

interface EtherealWispsProps {
  count?: number;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  color?: string;
}

export function EtherealWisps({
  count = 15,
  bounds = { minX: -25, maxX: 25, minZ: -25, maxZ: 25 },
  color = '#a78bfa',
}: EtherealWispsProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialsRef = useRef<THREE.ShaderMaterial[]>([]);

  // Generate wisp data (positions, dimensions) - memoized to prevent recalc
  const wispData = useMemo(() => {
    const data: Array<{
      pos: [number, number, number];
      height: number;
      width: number;
    }> = [];
    for (let i = 0; i < count; i++) {
      data.push({
        pos: [
          bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
          0,
          bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ),
        ],
        height: 4 + Math.random() * 4,
        width: 0.8 + Math.random() * 0.6,
      });
    }
    return data;
  }, [count, bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ]);

  // Create stable uniforms for each wisp - NO spreading
  const wispUniforms = useMemo(() => {
    return wispData.map(() => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0.15 },
    }));
  }, [wispData, color]);

  // Animation
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    materialsRef.current.forEach((mat) => {
      if (mat) {
        mat.uniforms.uTime.value = time;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {wispData.map((wisp, index) => (
        <mesh key={index} position={wisp.pos}>
          <planeGeometry args={[wisp.width, wisp.height]} />
          <shaderMaterial
            ref={(el) => {
              if (el) materialsRef.current[index] = el;
            }}
            vertexShader={wispVertexShader}
            fragmentShader={wispFragmentShader}
            uniforms={wispUniforms[index]}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

export default GroundMist;
