'use client';

// ============================================
// GRAPH CONTEXT MENU
// ============================================
// Right-click context menu for graph nodes

import { useEffect, useRef } from 'react';
import type { ForceGraphNode } from '@/lib/api/graph';

// ============================================
// TYPES
// ============================================

export interface GraphContextMenuProps {
  /** The node that was right-clicked */
  node: ForceGraphNode;
  /** Menu position */
  position: { x: number; y: number };
  /** Close the menu */
  onClose: () => void;
  /** Focus on this node (zoom in) */
  onFocus?: (node: ForceGraphNode) => void;
  /** View details for this node */
  onViewDetails?: (node: ForceGraphNode) => void;
  /** Find related nodes */
  onFindRelated?: (node: ForceGraphNode) => void;
  /** Copy node info to clipboard */
  onCopy?: (node: ForceGraphNode) => void;
}

// ============================================
// ICONS
// ============================================

const icons = {
  focus: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
    </svg>
  ),
  details: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  related: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  copy: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>
  ),
};

// ============================================
// COMPONENT
// ============================================

export function GraphContextMenu({
  node,
  position,
  onClose,
  onFocus,
  onViewDetails,
  onFindRelated,
  onCopy,
}: GraphContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 200),
    y: Math.min(position.y, window.innerHeight - 200),
  };

  const handleFocus = () => {
    onFocus?.(node);
    onClose();
  };

  const handleViewDetails = () => {
    onViewDetails?.(node);
    onClose();
  };

  const handleFindRelated = () => {
    onFindRelated?.(node);
    onClose();
  };

  const handleCopy = async () => {
    const info = `${node.type}: ${node.label}`;
    try {
      await navigator.clipboard.writeText(info);
      onCopy?.(node);
    } catch {
      // Fallback for older browsers
      console.warn('Failed to copy to clipboard');
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-surface-raised border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border">
        <div className="text-sm font-medium text-foreground truncate">{node.label}</div>
        <div className="text-xs text-foreground-muted capitalize">{node.type}</div>
      </div>

      {/* Actions */}
      <div className="py-1">
        {onFocus && (
          <button
            onClick={handleFocus}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-muted hover:text-foreground hover:bg-surface-sunken transition-colors"
          >
            {icons.focus}
            <span>Focus on node</span>
          </button>
        )}

        {onViewDetails && (
          <button
            onClick={handleViewDetails}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-muted hover:text-foreground hover:bg-surface-sunken transition-colors"
          >
            {icons.details}
            <span>View details</span>
          </button>
        )}

        {onFindRelated && (
          <button
            onClick={handleFindRelated}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-muted hover:text-foreground hover:bg-surface-sunken transition-colors"
          >
            {icons.related}
            <span>Find related</span>
          </button>
        )}

        <button
          onClick={handleCopy}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-muted hover:text-foreground hover:bg-surface-sunken transition-colors"
        >
          {icons.copy}
          <span>Copy info</span>
        </button>
      </div>
    </div>
  );
}

export default GraphContextMenu;
