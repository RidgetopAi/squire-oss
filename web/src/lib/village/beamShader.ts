'use strict';

// ============================================
// SQUIRE WEB - LIGHT BEAM SHADER
// ============================================
// Custom shader for animated undulating light beams
// connecting village buildings

import * as THREE from 'three';

// ============================================
// SHADER CODE
// ============================================

/**
 * Vertex shader with sine wave displacement
 * Creates organic undulating movement along the beam
 */
const beamVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uFrequency;
  uniform float uAmplitude;
  uniform float uPhase;

  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    vec3 pos = position;

    // Wave along the tube length (uv.x goes 0->1 along tube)
    // Multiple wave components for more organic feel
    float wave1 = sin(uv.x * 6.28318 * 2.0 + uTime * uFrequency + uPhase) * uAmplitude;
    float wave2 = sin(uv.x * 6.28318 * 3.0 + uTime * uFrequency * 0.7 + uPhase * 1.3) * uAmplitude * 0.5;

    // Combine waves and displace perpendicular to tube surface
    float totalWave = wave1 + wave2;
    pos += normal * totalWave;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

/**
 * Fragment shader with animated glow
 * Creates ethereal light beam appearance
 */
const beamFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPhase;

  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    // Glow intensity varies along beam and over time
    float timePulse = 0.7 + sin(uTime * 0.5 + uPhase) * 0.2;

    // Fresnel-like edge glow for ethereal effect
    float edgeFactor = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
    float glow = timePulse + edgeFactor * 0.3;

    // Slight variation along beam length
    float lengthVar = 0.9 + sin(vUv.x * 12.566 + uTime * 0.3) * 0.1;

    vec3 finalColor = uColor * glow * lengthVar;

    gl_FragColor = vec4(finalColor, uOpacity);
  }
`;

// ============================================
// MATERIAL FACTORY
// ============================================

export interface BeamMaterialOptions {
  color?: THREE.Color | string;
  opacity?: number;
  frequency?: number;
  amplitude?: number;
  phase?: number;
}

const DEFAULT_OPTIONS: Required<BeamMaterialOptions> = {
  color: new THREE.Color('#3b82f6'), // blue-500
  opacity: 0.85,
  frequency: 0.4, // Slow, organic
  amplitude: 0.15, // Subtle but visible
  phase: 0,
};

/**
 * Create a ShaderMaterial for the light beam
 */
export function createBeamMaterial(options: BeamMaterialOptions = {}): THREE.ShaderMaterial {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const color = opts.color instanceof THREE.Color
    ? opts.color
    : new THREE.Color(opts.color);

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: color },
      uOpacity: { value: opts.opacity },
      uFrequency: { value: opts.frequency },
      uAmplitude: { value: opts.amplitude },
      uPhase: { value: opts.phase },
    },
    vertexShader: beamVertexShader,
    fragmentShader: beamFragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false, // Better blending for transparent beams
    blending: THREE.NormalBlending,
  });
}

/**
 * Update time uniform on the beam material
 * Call this in useFrame
 */
export function updateBeamTime(material: THREE.ShaderMaterial, time: number): void {
  if (material.uniforms.uTime) {
    material.uniforms.uTime.value = time;
  }
}

// ============================================
// OUTER GLOW MATERIAL (OPTIONAL ENHANCEMENT)
// ============================================

/**
 * Create an outer glow material for enhanced beam effect
 * Use with a slightly larger tube geometry
 */
export function createOuterGlowMaterial(color: THREE.Color | string): THREE.MeshBasicMaterial {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);

  return new THREE.MeshBasicMaterial({
    color: c,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
