'use client';

// ============================================
// GRAPH INTERACTIONS HOOK
// ============================================
// Provides enhanced interaction handlers for force-graph

import { useState, useCallback, useRef, useMemo } from 'react';
import type { ForceGraphNode, ForceGraphLink } from '@/lib/api/graph';

// ============================================
// TYPES
// ============================================

export interface GraphInteractionState {
  /** Currently hovered node */
  hoveredNode: ForceGraphNode | null;
  /** Currently selected node */
  selectedNode: ForceGraphNode | null;
  /** Nodes connected to hovered node (for highlighting) */
  highlightedNodes: Set<string>;
  /** Links connected to hovered node (for highlighting) */
  highlightedLinks: Set<string>;
  /** Whether context menu is open */
  contextMenuOpen: boolean;
  /** Context menu position */
  contextMenuPosition: { x: number; y: number } | null;
  /** Node for context menu */
  contextMenuNode: ForceGraphNode | null;
}

export interface GraphInteractionHandlers {
  /** Handle node click */
  handleNodeClick: (node: ForceGraphNode, event: MouseEvent) => void;
  /** Handle node double click */
  handleNodeDoubleClick: (node: ForceGraphNode) => void;
  /** Handle node right click */
  handleNodeRightClick: (node: ForceGraphNode, event: MouseEvent) => void;
  /** Handle node hover */
  handleNodeHover: (node: ForceGraphNode | null) => void;
  /** Handle background click (deselect) */
  handleBackgroundClick: () => void;
  /** Close context menu */
  closeContextMenu: () => void;
  /** Clear selection */
  clearSelection: () => void;
}

export interface UseGraphInteractionsOptions {
  /** Graph data for computing connected nodes */
  graphData: { nodes: ForceGraphNode[]; links: ForceGraphLink[] } | null;
  /** Callback when node is selected */
  onNodeSelect?: (node: ForceGraphNode | null) => void;
  /** Callback when entity is clicked */
  onEntityClick?: (entityId: string) => void;
  /** Callback when memory is clicked */
  onMemoryClick?: (memoryId: string) => void;
  /** Callback to zoom to node */
  onZoomToNode?: (node: ForceGraphNode) => void;
}

export interface UseGraphInteractionsResult {
  state: GraphInteractionState;
  handlers: GraphInteractionHandlers;
  /** Check if a node should be highlighted */
  isNodeHighlighted: (nodeId: string) => boolean;
  /** Check if a link should be highlighted */
  isLinkHighlighted: (link: ForceGraphLink) => boolean;
  /** Get node opacity based on highlight state */
  getNodeOpacity: (nodeId: string) => number;
  /** Get link opacity based on highlight state */
  getLinkOpacity: (link: ForceGraphLink) => number;
}

// ============================================
// HOOK
// ============================================

export function useGraphInteractions(
  options: UseGraphInteractionsOptions
): UseGraphInteractionsResult {
  const { graphData, onNodeSelect, onEntityClick, onMemoryClick, onZoomToNode } = options;

  // State
  const [hoveredNode, setHoveredNode] = useState<ForceGraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<ForceGraphNode | null>(null);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const [contextMenuNode, setContextMenuNode] = useState<ForceGraphNode | null>(null);

  // Track last click time for double-click detection
  const lastClickRef = useRef<{ nodeId: string; time: number } | null>(null);

  // Build adjacency map for highlighting connected nodes
  const adjacencyMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!graphData) return map;

    graphData.links.forEach((link) => {
      const source = typeof link.source === 'string' ? link.source : (link.source as { id: string }).id;
      const target = typeof link.target === 'string' ? link.target : (link.target as { id: string }).id;

      if (!map.has(source)) map.set(source, new Set());
      if (!map.has(target)) map.set(target, new Set());

      map.get(source)!.add(target);
      map.get(target)!.add(source);
    });

    return map;
  }, [graphData]);

  // Compute highlighted nodes and links based on hovered node
  const { highlightedNodes, highlightedLinks } = useMemo(() => {
    const nodes = new Set<string>();
    const links = new Set<string>();

    if (hoveredNode) {
      // Add hovered node
      nodes.add(hoveredNode.id);

      // Add connected nodes
      const connected = adjacencyMap.get(hoveredNode.id);
      if (connected) {
        connected.forEach((id) => nodes.add(id));
      }

      // Add connected links
      if (graphData) {
        graphData.links.forEach((link) => {
          const source =
            typeof link.source === 'string' ? link.source : (link.source as { id: string }).id;
          const target =
            typeof link.target === 'string' ? link.target : (link.target as { id: string }).id;

          if (source === hoveredNode.id || target === hoveredNode.id) {
            links.add(`${source}-${target}`);
          }
        });
      }
    }

    return { highlightedNodes: nodes, highlightedLinks: links };
  }, [hoveredNode, adjacencyMap, graphData]);

  // Handlers
  const handleNodeClick = useCallback(
    (node: ForceGraphNode, event: MouseEvent) => {
      const now = Date.now();
      const last = lastClickRef.current;

      // Check for double click (within 300ms on same node)
      if (last && last.nodeId === node.id && now - last.time < 300) {
        // Double click - zoom to node
        onZoomToNode?.(node);
        lastClickRef.current = null;
        return;
      }

      // Single click - select node
      lastClickRef.current = { nodeId: node.id, time: now };
      setSelectedNode(node);
      onNodeSelect?.(node);

      // Type-specific callbacks
      if (node.type === 'entity') {
        onEntityClick?.(node.id);
      } else if (node.type === 'memory') {
        onMemoryClick?.(node.id);
      }
    },
    [onNodeSelect, onEntityClick, onMemoryClick, onZoomToNode]
  );

  const handleNodeDoubleClick = useCallback(
    (node: ForceGraphNode) => {
      onZoomToNode?.(node);
    },
    [onZoomToNode]
  );

  const handleNodeRightClick = useCallback((node: ForceGraphNode, event: MouseEvent) => {
    event.preventDefault();
    setContextMenuOpen(true);
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
    setContextMenuNode(node);
  }, []);

  const handleNodeHover = useCallback((node: ForceGraphNode | null) => {
    setHoveredNode(node);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
    setContextMenuOpen(false);
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  const closeContextMenu = useCallback(() => {
    setContextMenuOpen(false);
    setContextMenuPosition(null);
    setContextMenuNode(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedNode(null);
    setHoveredNode(null);
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  // Highlight helpers
  const isNodeHighlighted = useCallback(
    (nodeId: string) => {
      if (!hoveredNode) return true; // All nodes visible when nothing hovered
      return highlightedNodes.has(nodeId);
    },
    [hoveredNode, highlightedNodes]
  );

  const isLinkHighlighted = useCallback(
    (link: ForceGraphLink) => {
      if (!hoveredNode) return true;
      const source =
        typeof link.source === 'string' ? link.source : (link.source as { id: string }).id;
      const target =
        typeof link.target === 'string' ? link.target : (link.target as { id: string }).id;
      return highlightedLinks.has(`${source}-${target}`);
    },
    [hoveredNode, highlightedLinks]
  );

  const getNodeOpacity = useCallback(
    (nodeId: string) => {
      if (!hoveredNode) return 1;
      return highlightedNodes.has(nodeId) ? 1 : 0.15;
    },
    [hoveredNode, highlightedNodes]
  );

  const getLinkOpacity = useCallback(
    (link: ForceGraphLink) => {
      if (!hoveredNode) return 0.6;
      const source =
        typeof link.source === 'string' ? link.source : (link.source as { id: string }).id;
      const target =
        typeof link.target === 'string' ? link.target : (link.target as { id: string }).id;
      return highlightedLinks.has(`${source}-${target}`) ? 1 : 0.1;
    },
    [hoveredNode, highlightedLinks]
  );

  return {
    state: {
      hoveredNode,
      selectedNode,
      highlightedNodes,
      highlightedLinks,
      contextMenuOpen,
      contextMenuPosition,
      contextMenuNode,
    },
    handlers: {
      handleNodeClick,
      handleNodeDoubleClick,
      handleNodeRightClick,
      handleNodeHover,
      handleBackgroundClick,
      closeContextMenu,
      clearSelection,
    },
    isNodeHighlighted,
    isLinkHighlighted,
    getNodeOpacity,
    getLinkOpacity,
  };
}
