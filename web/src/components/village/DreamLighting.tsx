'use client';

// ============================================
// SQUIRE WEB - DREAM LIGHTING
// ============================================
// Enhanced atmospheric lighting with subtle
// color animation for dreamy memory village

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ============================================
// ANIMATED HEMISPHERE LIGHT
// ============================================

interface AnimatedHemisphereLightProps {
  skyColorA?: string;
  skyColorB?: string;
  groundColor?: string;
  intensity?: number;
}

/**
 * Hemisphere light with slowly shifting sky color
 * Creates subtle aurora-like ambient color changes
 */
function AnimatedHemisphereLight({
  skyColorA = '#8b5cf6', // Violet
  skyColorB = '#3b82f6', // Blue
  groundColor = '#2d1f47', // Dark purple
  intensity = 0.4,
}: AnimatedHemisphereLightProps) {
  const lightRef = useRef<THREE.HemisphereLight>(null);
  const colorA = new THREE.Color(skyColorA);
  const colorB = new THREE.Color(skyColorB);
  const targetColor = new THREE.Color();

  useFrame(({ clock }) => {
    if (lightRef.current) {
      // Very slow color shift (full cycle every ~30 seconds)
      const t = (Math.sin(clock.getElapsedTime() * 0.2) + 1) * 0.5;
      targetColor.lerpColors(colorA, colorB, t);
      lightRef.current.color.lerp(targetColor, 0.02);
    }
  });

  return (
    <hemisphereLight
      ref={lightRef}
      color={skyColorA}
      groundColor={groundColor}
      intensity={intensity}
    />
  );
}

// ============================================
// PULSING POINT LIGHT
// ============================================

interface PulsingPointLightProps {
  position: [number, number, number];
  color?: string;
  intensity?: number;
  distance?: number;
  pulseSpeed?: number;
  pulseAmount?: number;
}

/**
 * Point light with gentle pulsing intensity
 * Creates breathing, living light effect
 */
function PulsingPointLight({
  position,
  color = '#ffa500',
  intensity = 0.5,
  distance = 30,
  pulseSpeed = 0.5,
  pulseAmount = 0.3,
}: PulsingPointLightProps) {
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (lightRef.current) {
      const t = Math.sin(clock.getElapsedTime() * pulseSpeed);
      lightRef.current.intensity = intensity * (1 + t * pulseAmount);
    }
  });

  return (
    <pointLight
      ref={lightRef}
      position={position}
      color={color}
      intensity={intensity}
      distance={distance}
      decay={2}
    />
  );
}

// ============================================
// DREAM LIGHTING SETUP
// ============================================

interface DreamLightingProps {
  enableAnimation?: boolean;
}

/**
 * Complete dream world lighting setup
 * Replaces the standard Lighting component
 */
export function DreamLighting({ enableAnimation = true }: DreamLightingProps) {
  const directionalRef = useRef<THREE.DirectionalLight>(null);

  // Subtle directional light color shift
  useFrame(({ clock }) => {
    if (enableAnimation && directionalRef.current) {
      const t = (Math.sin(clock.getElapsedTime() * 0.1) + 1) * 0.5;
      // Shift between warm golden and soft peach
      const r = 1.0;
      const g = 0.9 + t * 0.05;
      const b = 0.85 + t * 0.1;
      directionalRef.current.color.setRGB(r, g, b);
    }
  });

  return (
    <>
      {/* Ambient base - warm and soft */}
      <ambientLight intensity={0.2} color="#ffe4c4" />

      {/* Animated hemisphere - aurora-like color shifts */}
      {enableAnimation ? (
        <AnimatedHemisphereLight
          skyColorA="#8b5cf6"
          skyColorB="#6366f1"
          groundColor="#1a1525"
          intensity={0.4}
        />
      ) : (
        <hemisphereLight
          color="#8b5cf6"
          groundColor="#1a1525"
          intensity={0.4}
        />
      )}

      {/* Main sun light - golden hour, soft shadows */}
      <directionalLight
        ref={directionalRef}
        position={[-20, 25, -15]}
        intensity={1.0} // Slightly reduced for dreamier feel
        color="#ffeedd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={100}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0001}
        shadow-radius={4} // Softer shadows
      />

      {/* Cool fill light - softer */}
      <directionalLight
        position={[15, 12, 20]}
        intensity={0.2}
        color="#b4d4ff"
      />

      {/* Rim light - ethereal backlight */}
      <directionalLight
        position={[0, 8, -25]}
        intensity={0.12}
        color="#e0b0ff"
      />

      {/* Center warmth - pulsing */}
      {enableAnimation ? (
        <PulsingPointLight
          position={[0, 6, 0]}
          color="#ffa500"
          intensity={0.35}
          distance={35}
          pulseSpeed={0.3}
          pulseAmount={0.25}
        />
      ) : (
        <pointLight
          position={[0, 6, 0]}
          intensity={0.35}
          color="#ffa500"
          distance={35}
          decay={2}
        />
      )}

      {/* Additional ethereal accent lights */}
      <pointLight
        position={[-15, 3, 10]}
        intensity={0.15}
        color="#a78bfa"
        distance={20}
        decay={2}
      />
      <pointLight
        position={[15, 3, -10]}
        intensity={0.15}
        color="#60a5fa"
        distance={20}
        decay={2}
      />
    </>
  );
}

// ============================================
// DREAM ATMOSPHERE (FOG + SKY)
// ============================================

interface DreamAtmosphereProps {
  fogColor?: string;
  fogNear?: number;
  fogFar?: number;
}

/**
 * Enhanced atmospheric fog for dream world
 * Slightly denser, more colorful
 */
export function DreamAtmosphere({
  fogColor = '#1a1525',
  fogNear = 25,
  fogFar = 100,
}: DreamAtmosphereProps) {
  return (
    <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
  );
}

export default DreamLighting;
