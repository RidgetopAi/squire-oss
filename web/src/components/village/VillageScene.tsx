'use client';

import { Suspense, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { VillageCanvas } from './VillageCanvas';
import { MemoryPanel } from './MemoryPanel';
import { useCameraMode, useToggleCameraMode, useIsPointerLocked } from '@/lib/stores';
import type { VillageBuilding } from '@/lib/types/village';

export default function VillageScene() {
  // Selection state
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<VillageBuilding | null>(null);

  // Hover state for tooltip
  const [hoveredBuilding, setHoveredBuilding] = useState<VillageBuilding | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Camera mode
  const cameraMode = useCameraMode();
  const toggleCameraMode = useToggleCameraMode();
  const isPointerLocked = useIsPointerLocked();
  const isWalkMode = cameraMode === 'walk';

  const handleBuildingSelect = useCallback((building: VillageBuilding | null) => {
    setSelectedBuilding(building);
    setSelectedMemoryId(building?.memoryId ?? null);
  }, []);

  const handleBuildingHover = useCallback((building: VillageBuilding | null) => {
    setHoveredBuilding(building);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedMemoryId(null);
    setSelectedBuilding(null);
  }, []);

  return (
    <div className="relative h-full w-full bg-background" onMouseMove={handleMouseMove}>
      <Canvas
        shadows
        frameloop="always"
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#0a0a0f');
        }}
      >
        <Suspense fallback={null}>
          <VillageCanvas
            onBuildingSelect={handleBuildingSelect}
            onBuildingHover={handleBuildingHover}
          />
        </Suspense>
      </Canvas>

      {/* Overlay UI */}
      <div className="pointer-events-none absolute inset-0">
        {/* Top left - Title */}
        <div className="absolute left-4 top-4">
          <h1 className="text-lg font-semibold text-foreground">Memory Village</h1>
          <p className="text-sm text-foreground-muted">
            {isWalkMode ? 'Walk through your memories' : 'Click a building to view memory'}
          </p>
        </div>

        {/* Top right - Camera mode toggle */}
        <div className="absolute right-4 top-4 pointer-events-auto">
          <button
            onClick={toggleCameraMode}
            className="flex items-center gap-2 rounded-lg border border-border bg-background/90 px-3 py-2 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {isWalkMode ? (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Switch to Fly
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Switch to Walk
              </>
            )}
          </button>
        </div>

        {/* Bottom left - Controls hint */}
        <div className="absolute bottom-4 left-4 rounded-lg border border-border bg-background/80 px-3 py-2 backdrop-blur-sm">
          {isWalkMode ? (
            <>
              <p className="text-xs text-foreground-muted">
                <span className="font-medium text-foreground">Move:</span> WASD or Arrow keys
              </p>
              <p className="text-xs text-foreground-muted">
                <span className="font-medium text-foreground">Look:</span> Click to lock mouse, move to look
              </p>
              <p className="text-xs text-foreground-muted">
                <span className="font-medium text-foreground">Sprint:</span> Hold Shift
              </p>
              <p className="text-xs text-foreground-muted">
                <span className="font-medium text-foreground">Interact:</span> E key near a building
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-foreground-muted">
                <span className="font-medium text-foreground">Mouse:</span> Drag to rotate, Scroll to zoom
              </p>
              <p className="text-xs text-foreground-muted">
                <span className="font-medium text-foreground">Touch:</span> Drag to rotate, Pinch to zoom
              </p>
            </>
          )}
        </div>

        {/* Center - Click to enter walk mode prompt */}
        {isWalkMode && !isPointerLocked && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-lg border border-violet-500/50 bg-background/90 px-6 py-4 backdrop-blur-sm">
              <p className="text-center text-sm font-medium text-foreground">
                Click anywhere to start walking
              </p>
              <p className="text-center text-xs text-foreground-muted mt-1">
                Press Escape to exit walk mode
              </p>
            </div>
          </div>
        )}

        {/* Walk mode - nearby building interaction hint */}
        {isWalkMode && isPointerLocked && hoveredBuilding && !selectedBuilding && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
            <div className="rounded-lg border border-violet-500/50 bg-background/90 px-4 py-2 backdrop-blur-sm">
              <p className="text-center text-sm font-medium text-foreground">
                Press <span className="text-violet-400">E</span> to view: {hoveredBuilding.label}
              </p>
            </div>
          </div>
        )}

        {/* Hover Tooltip (fly mode only) */}
        {!isWalkMode && hoveredBuilding && !selectedBuilding && (
          <div
            className="pointer-events-none fixed z-50 rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm"
            style={{
              left: mousePosition.x + 16,
              top: mousePosition.y + 16,
              maxWidth: 280,
            }}
          >
            <p className="text-sm font-medium text-foreground truncate">
              {hoveredBuilding.label}
            </p>
            <p className="text-xs text-foreground-muted capitalize">
              {hoveredBuilding.category} • {hoveredBuilding.buildingType}
            </p>
          </div>
        )}
      </div>

      {/* Memory Panel Overlay */}
      <MemoryPanel
        memoryId={selectedMemoryId}
        building={selectedBuilding}
        onClose={handleClosePanel}
      />
    </div>
  );
}
