'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useTopEntities } from '@/lib/hooks/useEntities';
import { useEntitySubgraph, useGraphStats, useGraphVisualization } from '@/lib/hooks/useGraphData';
import type { ForceGraphNode, ForceGraphLink } from '@/lib/api/graph';
import {
  GraphControls,
  GraphContextMenu,
  SelectionDetailsPanel,
  type GraphFilters,
  type GraphDisplayOptions,
  DEFAULT_GRAPH_FILTERS,
  DEFAULT_DISPLAY_OPTIONS,
} from '@/components/graph';
import { useGraphInteractions } from '@/lib/hooks';

// Graph node with position data (added by force simulation)
interface GraphNodeWithPosition extends ForceGraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ForceGraphMethods = any;

// Dynamically import ForceGraph2D to avoid SSR issues with canvas
// Using react-force-graph-2d (standalone) instead of react-force-graph (bundle)
// to avoid A-Frame dependency issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-foreground-muted">Loading graph...</div>
    </div>
  ),
});

// Icons
const icons = {
  graph: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  users: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  memory: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  zoom: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
    </svg>
  ),
  center: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  ),
};

// Entity type colors
const entityTypeColors: Record<string, string> = {
  person: '#a78bfa',      // violet-400
  organization: '#60a5fa', // blue-400
  location: '#34d399',     // emerald-400
  project: '#f472b6',      // pink-400
  concept: '#facc15',      // yellow-400
  event: '#fb923c',        // orange-400
};

export default function GraphPage() {
  const graphRef = useRef<ForceGraphMethods>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitialZoomRef = useRef(false);

  // State
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNodeWithPosition | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [showControls, setShowControls] = useState(false);
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_GRAPH_FILTERS);
  const [displayOptions, setDisplayOptions] = useState<GraphDisplayOptions>(DEFAULT_DISPLAY_OPTIONS);

  // Data fetching
  const { data: stats, isLoading: statsLoading } = useGraphStats();
  const { data: entities, isLoading: entitiesLoading } = useTopEntities(20);

  // Full visualization (when no entity selected)
  const { data: fullGraphData, isLoading: fullGraphLoading } = useGraphVisualization({
    nodeLimit: filters.entityLimit + filters.memoryLimit,
    entityLimit: filters.entityLimit,
    memoryLimit: filters.memoryLimit,
    minSalience: filters.minSalience,
    entityTypes: filters.entityTypes.length < 6 ? filters.entityTypes : undefined,
    enabled: !selectedEntityId, // Only fetch when no entity is selected
  });

  // Entity subgraph (when entity is selected)
  const { data: entityGraphData, isLoading: entityGraphLoading } = useEntitySubgraph(selectedEntityId, {
    memoryLimit: 30,
    entityLimit: 15,
  });

  // Choose which data to display
  const graphData = selectedEntityId ? entityGraphData : fullGraphData;
  const graphLoading = selectedEntityId ? entityGraphLoading : fullGraphLoading;

  // CRITICAL: Memoize the graphData passed to ForceGraph2D
  // Without this, every render creates new object references, causing ForceGraph to restart simulation
  const stableGraphData = useMemo(() => {
    if (!graphData) return null;
    return {
      nodes: graphData.nodes.map(n => ({ ...n })),
      links: graphData.links.map(l => ({ ...l })),
    };
  }, [graphData]);

  // Graph interactions
  const {
    state: interactionState,
    handlers: interactionHandlers,
    getNodeOpacity,
    getLinkOpacity,
  } = useGraphInteractions({
    graphData: graphData ?? null,
    onEntityClick: (entityId) => setSelectedEntityId(entityId),
    onZoomToNode: (node) => {
      if (graphRef.current && node) {
        // Zoom to and center on the node
        graphRef.current.centerAt(
          (node as GraphNodeWithPosition).x,
          (node as GraphNodeWithPosition).y,
          500
        );
        graphRef.current.zoom(2.5, 500);
      }
    },
  });

  // Reset zoom ref when graph data source changes (entity selected/deselected)
  useEffect(() => {
    hasInitialZoomRef.current = false;
  }, [selectedEntityId]);

  // Handle container resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width,
          height: rect.height,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Node click handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeClick = useCallback((node: any, event: MouseEvent) => {
    interactionHandlers.handleNodeClick(node as ForceGraphNode, event);
  }, [interactionHandlers]);

  // Node right-click handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeRightClick = useCallback((node: any, event: MouseEvent) => {
    interactionHandlers.handleNodeRightClick(node as ForceGraphNode, event);
  }, [interactionHandlers]);

  // Node hover handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node as GraphNodeWithPosition | null);
    interactionHandlers.handleNodeHover(node as ForceGraphNode | null);
  }, [interactionHandlers]);

  // Custom node rendering
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.label || '';
    const fontSize = 12 / globalScale;
    const nodeSize = (node.val || 4) / globalScale * 2;
    const opacity = getNodeOpacity(node.id);
    const isSelected = interactionState.selectedNode?.id === node.id;

    ctx.globalAlpha = opacity;

    // Draw node circle
    ctx.beginPath();
    ctx.arc(node.x || 0, node.y || 0, nodeSize, 0, 2 * Math.PI);
    ctx.fillStyle = node.color || '#64748b';
    ctx.fill();

    // Draw border if hovered or selected
    if (hoveredNode?.id === node.id || isSelected) {
      ctx.strokeStyle = isSelected ? '#22d3ee' : '#fff';
      ctx.lineWidth = (isSelected ? 3 : 2) / globalScale;
      ctx.stroke();
    }

    // Draw label (when labels are enabled or zoom is sufficient)
    if (displayOptions.showLabels && globalScale > 0.5) {
      ctx.font = `${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(label.slice(0, 20), node.x || 0, (node.y || 0) + nodeSize + fontSize);
    }

    ctx.globalAlpha = 1;
  }, [hoveredNode, getNodeOpacity, interactionState.selectedNode, displayOptions.showLabels]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    graphRef.current?.zoom(1.5, 400);
  }, []);

  const handleZoomOut = useCallback(() => {
    graphRef.current?.zoom(0.67, 400);
  }, []);

  const handleCenter = useCallback(() => {
    graphRef.current?.centerAt(0, 0, 400);
    graphRef.current?.zoom(1, 400);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-none px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <span className="text-accent-magenta">{icons.graph}</span>
              Memory Graph
            </h1>
            <p className="text-sm text-foreground-muted mt-1">
              {selectedEntityId
                ? 'Viewing connections for selected entity'
                : 'Showing top entities and their memory connections'}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Stats */}
            {stats && !statsLoading && (
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-foreground-muted">
                  <span className="text-blue-400">{icons.memory}</span>
                  <span>{stats.memoryCount} memories</span>
                </div>
                <div className="flex items-center gap-1.5 text-foreground-muted">
                  <span className="text-violet-400">{icons.users}</span>
                  <span>{stats.entityCount} entities</span>
                </div>
              </div>
            )}

            {/* Controls Toggle */}
            <button
              onClick={() => setShowControls(!showControls)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                showControls
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-surface-raised border border-border hover:bg-surface-sunken text-foreground-muted'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Controls
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Entity Sidebar */}
        <div className="w-64 flex-none border-r border-border overflow-auto bg-surface-raised/50">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-foreground">
                {selectedEntityId ? 'Entity Focus' : 'Full Graph'}
              </h2>
              {selectedEntityId && (
                <button
                  onClick={() => setSelectedEntityId(null)}
                  className="text-xs text-foreground-muted hover:text-foreground transition-colors"
                >
                  Show All
                </button>
              )}
            </div>

            {entitiesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-10 rounded bg-surface-sunken animate-pulse" />
                ))}
              </div>
            ) : entities?.entities && entities.entities.length > 0 ? (
              <div className="space-y-1">
                {entities.entities.map((entity) => (
                  <button
                    key={entity.id}
                    onClick={() => setSelectedEntityId(entity.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm ${
                      selectedEntityId === entity.id
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'hover:bg-surface-sunken text-foreground-muted hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-none"
                        style={{ backgroundColor: entityTypeColors[entity.type] || '#64748b' }}
                      />
                      <span className="truncate">{entity.name}</span>
                    </div>
                    <div className="text-xs text-foreground-muted mt-0.5 pl-4">
                      {entity.mention_count} mentions
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">No entities found</p>
            )}
          </div>
        </div>

        {/* Graph Container */}
        <div ref={containerRef} className="flex-1 relative bg-surface-sunken">
          {/* Zoom Controls */}
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-1">
            <button
              onClick={handleZoomIn}
              className="p-2 rounded-lg bg-surface-raised border border-border hover:bg-surface-sunken transition-colors"
              title="Zoom in"
            >
              {icons.zoom}
            </button>
            <button
              onClick={handleZoomOut}
              className="p-2 rounded-lg bg-surface-raised border border-border hover:bg-surface-sunken transition-colors"
              title="Zoom out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
              </svg>
            </button>
            <button
              onClick={handleCenter}
              className="p-2 rounded-lg bg-surface-raised border border-border hover:bg-surface-sunken transition-colors"
              title="Center view"
            >
              {icons.center}
            </button>
          </div>

          {/* Hovered Node Info */}
          {hoveredNode && (
            <div className="absolute bottom-4 left-4 z-10 p-3 rounded-lg bg-surface-raised border border-border shadow-lg max-w-xs">
              <div className="text-sm font-medium text-foreground">{hoveredNode.label}</div>
              <div className="text-xs text-foreground-muted mt-1">
                Type: {hoveredNode.type}
              </div>
            </div>
          )}

          {/* Graph or Empty State */}
          {graphLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-foreground-muted">Loading graph...</p>
              </div>
            </div>
          ) : stableGraphData && stableGraphData.nodes.length > 0 ? (
            <ForceGraph2D
              key={selectedEntityId || 'full-graph'}
              ref={graphRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={stableGraphData}
              nodeId="id"
              nodeLabel="label"
              nodeVal="val"
              nodeColor="color"
              linkSource="source"
              linkTarget="target"
              linkColor="color"
              linkWidth={(link: unknown) => Math.max(1, ((link as { weight?: number }).weight || 0.5) * 3)}
              linkLineDash={(link: unknown) => {
                const opacity = getLinkOpacity(link as ForceGraphLink);
                return opacity < 0.5 ? [2, 2] : [];
              }}
              linkDirectionalParticles={displayOptions.showParticles ? 2 : 0}
              linkDirectionalParticleWidth={2}
              onNodeClick={handleNodeClick}
              onNodeRightClick={handleNodeRightClick}
              onNodeHover={handleNodeHover}
              onBackgroundClick={interactionHandlers.handleBackgroundClick}
              nodeCanvasObject={nodeCanvasObject}
              backgroundColor="transparent"
              cooldownTicks={100}
              autoPauseRedraw={false}
              enableNodeDrag={false}
              onEngineStop={() => {
                if (!hasInitialZoomRef.current) {
                  hasInitialZoomRef.current = true;
                  graphRef.current?.zoomToFit(400, 50);
                }
              }}
            />
          ) : null}

          {/* Context Menu */}
          {interactionState.contextMenuOpen && interactionState.contextMenuNode && interactionState.contextMenuPosition && (
            <GraphContextMenu
              node={interactionState.contextMenuNode}
              position={interactionState.contextMenuPosition}
              onClose={interactionHandlers.closeContextMenu}
              onFocus={(node) => {
                if (graphRef.current) {
                  graphRef.current.centerAt(
                    (node as GraphNodeWithPosition).x,
                    (node as GraphNodeWithPosition).y,
                    500
                  );
                  graphRef.current.zoom(2.5, 500);
                }
              }}
              onViewDetails={(node) => {
                if (node.type === 'entity') {
                  setSelectedEntityId(node.id);
                }
              }}
              onFindRelated={(node) => {
                if (node.type === 'entity') {
                  setSelectedEntityId(node.id);
                }
              }}
            />
          )}

          {/* Empty State */}
          {!graphLoading && (!graphData || graphData.nodes.length === 0) && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 mx-auto rounded-full bg-accent-magenta/10 border border-accent-magenta/30 flex items-center justify-center mb-4">
                <span className="text-accent-magenta">{icons.graph}</span>
              </div>
              <h2 className="text-lg font-medium text-foreground mb-2">
                No Graph Data
              </h2>
              <p className="text-sm text-foreground-muted max-w-sm">
                {selectedEntityId
                  ? 'No connections found for this entity. Try selecting a different entity.'
                  : 'No memories or entities found. Add some memories to see the graph visualization.'}
              </p>
            </div>
          )}
        </div>

        {/* Right Panel: Controls or Selection Details */}
        {(showControls || interactionState.selectedNode) && (
          <div className="w-72 flex-none border-l border-border overflow-hidden bg-surface-raised/50 flex flex-col">
            {/* Panel Tabs */}
            {showControls && interactionState.selectedNode && (
              <div className="flex border-b border-border">
                <button
                  onClick={() => setShowControls(true)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    showControls && !interactionState.selectedNode
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-foreground-muted hover:text-foreground'
                  }`}
                >
                  Controls
                </button>
                <button
                  onClick={() => setShowControls(false)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    !showControls || interactionState.selectedNode
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-foreground-muted hover:text-foreground'
                  }`}
                >
                  Details
                </button>
              </div>
            )}

            {/* Panel Content */}
            <div className="flex-1 overflow-auto">
              {showControls && !interactionState.selectedNode ? (
                <GraphControls
                  filters={filters}
                  displayOptions={displayOptions}
                  onFiltersChange={setFilters}
                  onDisplayOptionsChange={setDisplayOptions}
                />
              ) : interactionState.selectedNode ? (
                <SelectionDetailsPanel
                  selectedNode={interactionState.selectedNode}
                  graphData={graphData ?? null}
                  onEntityClick={(entityId) => setSelectedEntityId(entityId)}
                  onMemoryClick={() => {/* Could navigate to timeline */}}
                  onClearSelection={interactionHandlers.clearSelection}
                />
              ) : (
                <GraphControls
                  filters={filters}
                  displayOptions={displayOptions}
                  onFiltersChange={setFilters}
                  onDisplayOptionsChange={setDisplayOptions}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex-none px-6 py-3 border-t border-border bg-surface-raised/50">
        <div className="flex items-center justify-center gap-6 text-xs text-foreground-muted">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-violet-400" />
            <span>Entity</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-400" />
            <span>Memory</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-0.5 bg-blue-500" />
            <span>Similar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-0.5 bg-violet-500" />
            <span>Mentions</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-0.5 bg-amber-500" />
            <span>Co-occurs</span>
          </div>
        </div>
      </div>
    </div>
  );
}
