'use client';

// ============================================
// SELECTION DETAILS PANEL
// ============================================
// Shows details about the selected node in the graph

import { useMemo } from 'react';
import type { ForceGraphNode, ForceGraphLink } from '@/lib/api/graph';
import { useEntity, useMemory, useEntityNeighbors } from '@/lib/hooks';

// ============================================
// TYPES
// ============================================

export interface SelectionDetailsPanelProps {
  /** The selected node */
  selectedNode: ForceGraphNode | null;
  /** Graph data for computing connections */
  graphData: { nodes: ForceGraphNode[]; links: ForceGraphLink[] } | null;
  /** Navigate to entity */
  onEntityClick?: (entityId: string) => void;
  /** Navigate to memory */
  onMemoryClick?: (memoryId: string) => void;
  /** Clear selection */
  onClearSelection?: () => void;
  /** Additional className */
  className?: string;
}

// ============================================
// ICONS
// ============================================

const icons = {
  entity: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  memory: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  link: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  close: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  chevronRight: (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
};

// Entity type colors
const ENTITY_TYPE_COLORS: Record<string, string> = {
  person: '#a78bfa',
  organization: '#60a5fa',
  location: '#34d399',
  project: '#f472b6',
  concept: '#facc15',
  event: '#fb923c',
};

// ============================================
// ENTITY DETAILS
// ============================================

function EntityDetails({
  entityId,
  graphData,
  onEntityClick,
  onMemoryClick,
}: {
  entityId: string;
  graphData: { nodes: ForceGraphNode[]; links: ForceGraphLink[] } | null;
  onEntityClick?: (id: string) => void;
  onMemoryClick?: (id: string) => void;
}) {
  const { data: entity, isLoading } = useEntity(entityId);
  const { data: neighbors } = useEntityNeighbors(entityId, { limit: 5 });

  // Find connected memories from graph
  const connectedMemories = useMemo(() => {
    if (!graphData) return [];
    const memoryIds = new Set<string>();

    graphData.links.forEach((link) => {
      const source = typeof link.source === 'string' ? link.source : (link.source as { id: string }).id;
      const target = typeof link.target === 'string' ? link.target : (link.target as { id: string }).id;

      if (source === entityId) {
        const targetNode = graphData.nodes.find((n) => n.id === target);
        if (targetNode?.type === 'memory') memoryIds.add(target);
      }
      if (target === entityId) {
        const sourceNode = graphData.nodes.find((n) => n.id === source);
        if (sourceNode?.type === 'memory') memoryIds.add(source);
      }
    });

    return graphData.nodes.filter((n) => memoryIds.has(n.id));
  }, [graphData, entityId]);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-4 w-3/4 bg-surface-sunken rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-surface-sunken rounded animate-pulse" />
        <div className="h-20 bg-surface-sunken rounded animate-pulse" />
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="p-4 text-sm text-foreground-muted">
        Entity not found
      </div>
    );
  }

  const entityType = entity.type || 'unknown';
  const typeColor = ENTITY_TYPE_COLORS[entityType] || '#64748b';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-none"
          style={{ backgroundColor: `${typeColor}20`, borderColor: `${typeColor}40`, borderWidth: 1 }}
        >
          <span style={{ color: typeColor }}>{icons.entity}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-foreground truncate">{entity.name}</h3>
          <p className="text-xs text-foreground-muted capitalize">{entityType}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="px-2 py-1.5 rounded bg-surface-sunken">
          <span className="text-foreground-muted">Mentions</span>
          <span className="float-right text-foreground font-medium">{entity.mention_count || 0}</span>
        </div>
        <div className="px-2 py-1.5 rounded bg-surface-sunken">
          <span className="text-foreground-muted">Related</span>
          <span className="float-right text-foreground font-medium">{neighbors?.neighborCount || 0}</span>
        </div>
      </div>

      {/* Connected Memories */}
      {connectedMemories.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
            Connected Memories ({connectedMemories.length})
          </h4>
          <div className="space-y-1">
            {connectedMemories.slice(0, 5).map((memory) => (
              <button
                key={memory.id}
                onClick={() => onMemoryClick?.(memory.id)}
                className="w-full text-left px-2 py-1.5 rounded text-xs bg-surface-sunken hover:bg-border transition-colors flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-none" />
                <span className="truncate flex-1 text-foreground-muted group-hover:text-foreground">
                  {memory.label}
                </span>
                <span className="text-foreground-muted opacity-0 group-hover:opacity-100 transition-opacity">
                  {icons.chevronRight}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Related Entities */}
      {neighbors && neighbors.neighbors.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
            Related Entities ({neighbors.neighborCount})
          </h4>
          <div className="space-y-1">
            {neighbors.neighbors.slice(0, 5).map((neighbor) => (
              <button
                key={neighbor.id}
                onClick={() => onEntityClick?.(neighbor.id)}
                className="w-full text-left px-2 py-1.5 rounded text-xs bg-surface-sunken hover:bg-border transition-colors flex items-center gap-2 group"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-none"
                  style={{ backgroundColor: ENTITY_TYPE_COLORS[neighbor.type] || '#64748b' }}
                />
                <span className="truncate flex-1 text-foreground-muted group-hover:text-foreground">
                  {neighbor.name}
                </span>
                <span className="text-[10px] text-foreground-muted">
                  {neighbor.sharedMemoryCount} shared
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// MEMORY DETAILS
// ============================================

function MemoryDetails({
  memoryId,
  graphData,
  onEntityClick,
  onMemoryClick,
}: {
  memoryId: string;
  graphData: { nodes: ForceGraphNode[]; links: ForceGraphLink[] } | null;
  onEntityClick?: (id: string) => void;
  onMemoryClick?: (id: string) => void;
}) {
  const { data: memory, isLoading } = useMemory(memoryId);

  // Find connected entities and similar memories from graph
  const { connectedEntities, similarMemories } = useMemo(() => {
    if (!graphData) return { connectedEntities: [], similarMemories: [] };

    // Use Maps to dedupe by id (same node can be connected via multiple links)
    const entitiesMap = new Map<string, ForceGraphNode>();
    const memoriesMap = new Map<string, ForceGraphNode>();

    graphData.links.forEach((link) => {
      const source = typeof link.source === 'string' ? link.source : (link.source as { id: string }).id;
      const target = typeof link.target === 'string' ? link.target : (link.target as { id: string }).id;

      if (source === memoryId || target === memoryId) {
        const otherId = source === memoryId ? target : source;
        const otherNode = graphData.nodes.find((n) => n.id === otherId);

        if (otherNode?.type === 'entity' && !entitiesMap.has(otherNode.id)) {
          entitiesMap.set(otherNode.id, otherNode);
        } else if (otherNode?.type === 'memory' && link.type === 'SIMILAR' && !memoriesMap.has(otherNode.id)) {
          memoriesMap.set(otherNode.id, otherNode);
        }
      }
    });

    return {
      connectedEntities: Array.from(entitiesMap.values()),
      similarMemories: Array.from(memoriesMap.values())
    };
  }, [graphData, memoryId]);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-4 w-3/4 bg-surface-sunken rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-surface-sunken rounded animate-pulse" />
        <div className="h-32 bg-surface-sunken rounded animate-pulse" />
      </div>
    );
  }

  if (!memory) {
    return (
      <div className="p-4 text-sm text-foreground-muted">
        Memory not found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-none bg-blue-500/10 border border-blue-500/30">
          <span className="text-blue-400">{icons.memory}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-foreground line-clamp-2">
            {memory.content?.slice(0, 100)}...
          </h3>
          <p className="text-xs text-foreground-muted mt-0.5">
            {new Date(memory.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Salience */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-muted">Salience</span>
          <span className="text-foreground font-medium">
            {Math.round((memory.salience || 0) * 100)}%
          </span>
        </div>
        <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
            style={{ width: `${(memory.salience || 0) * 100}%` }}
          />
        </div>
      </div>

      {/* Content Preview */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
          Content
        </h4>
        <div className="text-xs text-foreground-muted bg-surface-sunken rounded p-2 max-h-24 overflow-y-auto">
          {memory.content}
        </div>
      </div>

      {/* Connected Entities */}
      {connectedEntities.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
            Entities ({connectedEntities.length})
          </h4>
          <div className="flex flex-wrap gap-1">
            {connectedEntities.slice(0, 8).map((entity) => {
              const entityType = (entity.attributes?.type as string) || 'unknown';
              const color = ENTITY_TYPE_COLORS[entityType] || '#64748b';
              return (
                <button
                  key={entity.id}
                  onClick={() => onEntityClick?.(entity.id)}
                  className="px-2 py-1 rounded text-xs hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {entity.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Similar Memories */}
      {similarMemories.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
            Similar Memories ({similarMemories.length})
          </h4>
          <div className="space-y-1">
            {similarMemories.slice(0, 3).map((mem) => (
              <button
                key={mem.id}
                onClick={() => onMemoryClick?.(mem.id)}
                className="w-full text-left px-2 py-1.5 rounded text-xs bg-surface-sunken hover:bg-border transition-colors flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-none" />
                <span className="truncate flex-1 text-foreground-muted group-hover:text-foreground">
                  {mem.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function SelectionDetailsPanel({
  selectedNode,
  graphData,
  onEntityClick,
  onMemoryClick,
  onClearSelection,
  className = '',
}: SelectionDetailsPanelProps) {
  if (!selectedNode) {
    return (
      <div className={`flex flex-col items-center justify-center text-center p-6 ${className}`}>
        <div className="w-12 h-12 rounded-full bg-surface-sunken flex items-center justify-center mb-3">
          <span className="text-foreground-muted">{icons.link}</span>
        </div>
        <p className="text-sm text-foreground-muted">
          Click a node to view details
        </p>
        <p className="text-xs text-foreground-muted mt-1">
          Double-click to zoom in
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">
          {selectedNode.type === 'entity' ? 'Entity' : 'Memory'} Details
        </h3>
        {onClearSelection && (
          <button
            onClick={onClearSelection}
            className="p-1 rounded hover:bg-surface-sunken transition-colors text-foreground-muted hover:text-foreground"
            title="Close"
          >
            {icons.close}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedNode.type === 'entity' ? (
          <EntityDetails
            entityId={selectedNode.id}
            graphData={graphData}
            onEntityClick={onEntityClick}
            onMemoryClick={onMemoryClick}
          />
        ) : (
          <MemoryDetails
            memoryId={selectedNode.id}
            graphData={graphData}
            onEntityClick={onEntityClick}
            onMemoryClick={onMemoryClick}
          />
        )}
      </div>
    </div>
  );
}

export default SelectionDetailsPanel;
