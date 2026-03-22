'use client';

// ============================================
// GRAPH CONTROLS PANEL
// ============================================
// Provides filtering and display options for graph visualization

import { useState, useCallback } from 'react';

// ============================================
// TYPES
// ============================================

export interface GraphFilters {
  /** Entity types to show */
  entityTypes: string[];
  /** Minimum salience threshold (0-1) */
  minSalience: number;
  /** Maximum number of entities */
  entityLimit: number;
  /** Maximum number of memories */
  memoryLimit: number;
}

export interface GraphDisplayOptions {
  /** Show animated particles on edges */
  showParticles: boolean;
  /** Show node labels */
  showLabels: boolean;
  /** Show edge labels */
  showEdgeLabels: boolean;
  /** Edge type visibility */
  visibleEdgeTypes: string[];
}

export interface GraphControlsProps {
  /** Current filter values */
  filters: GraphFilters;
  /** Current display options */
  displayOptions: GraphDisplayOptions;
  /** Called when filters change */
  onFiltersChange: (filters: GraphFilters) => void;
  /** Called when display options change */
  onDisplayOptionsChange: (options: GraphDisplayOptions) => void;
  /** Whether controls are collapsed */
  collapsed?: boolean;
  /** Toggle collapsed state */
  onToggleCollapsed?: () => void;
  /** Additional className */
  className?: string;
}

// ============================================
// CONSTANTS
// ============================================

const ENTITY_TYPES = [
  { value: 'person', label: 'People', color: '#a78bfa' },
  { value: 'organization', label: 'Organizations', color: '#60a5fa' },
  { value: 'location', label: 'Locations', color: '#34d399' },
  { value: 'project', label: 'Projects', color: '#f472b6' },
  { value: 'concept', label: 'Concepts', color: '#facc15' },
  { value: 'event', label: 'Events', color: '#fb923c' },
];

const EDGE_TYPES = [
  { value: 'SIMILAR', label: 'Similar', color: '#3b82f6' },
  { value: 'MENTIONS', label: 'Mentions', color: '#8b5cf6' },
  { value: 'CO_OCCURS', label: 'Co-occurs', color: '#f59e0b' },
  { value: 'TEMPORAL', label: 'Temporal', color: '#22c55e' },
];

// Icons
const icons = {
  filter: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  ),
  display: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  chevronDown: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  chevronUp: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
    </svg>
  ),
};

// ============================================
// COMPONENT
// ============================================

export function GraphControls({
  filters,
  displayOptions,
  onFiltersChange,
  onDisplayOptionsChange,
  collapsed = false,
  onToggleCollapsed,
  className = '',
}: GraphControlsProps) {
  const [expandedSection, setExpandedSection] = useState<'filters' | 'display' | null>('filters');

  // Toggle entity type
  const toggleEntityType = useCallback(
    (type: string) => {
      const newTypes = filters.entityTypes.includes(type)
        ? filters.entityTypes.filter((t) => t !== type)
        : [...filters.entityTypes, type];
      onFiltersChange({ ...filters, entityTypes: newTypes });
    },
    [filters, onFiltersChange]
  );

  // Toggle edge type
  const toggleEdgeType = useCallback(
    (type: string) => {
      const newTypes = displayOptions.visibleEdgeTypes.includes(type)
        ? displayOptions.visibleEdgeTypes.filter((t) => t !== type)
        : [...displayOptions.visibleEdgeTypes, type];
      onDisplayOptionsChange({ ...displayOptions, visibleEdgeTypes: newTypes });
    },
    [displayOptions, onDisplayOptionsChange]
  );

  // Toggle all entity types
  const toggleAllEntityTypes = useCallback(() => {
    const allSelected = filters.entityTypes.length === ENTITY_TYPES.length;
    onFiltersChange({
      ...filters,
      entityTypes: allSelected ? [] : ENTITY_TYPES.map((t) => t.value),
    });
  }, [filters, onFiltersChange]);

  // Toggle all edge types
  const toggleAllEdgeTypes = useCallback(() => {
    const allSelected = displayOptions.visibleEdgeTypes.length === EDGE_TYPES.length;
    onDisplayOptionsChange({
      ...displayOptions,
      visibleEdgeTypes: allSelected ? [] : EDGE_TYPES.map((t) => t.value),
    });
  }, [displayOptions, onDisplayOptionsChange]);

  if (collapsed) {
    return (
      <div className={`p-2 ${className}`}>
        <button
          onClick={onToggleCollapsed}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-raised border border-border hover:bg-surface-sunken transition-colors w-full"
        >
          {icons.filter}
          <span className="text-sm text-foreground">Controls</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Graph Controls</h3>
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            className="p-1 rounded hover:bg-surface-sunken transition-colors"
          >
            {icons.chevronUp}
          </button>
        )}
      </div>

      {/* Filters Section */}
      <div className="space-y-3">
        <button
          onClick={() => setExpandedSection(expandedSection === 'filters' ? null : 'filters')}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground-muted">
            {icons.filter}
            <span>Filters</span>
          </div>
          {expandedSection === 'filters' ? icons.chevronUp : icons.chevronDown}
        </button>

        {expandedSection === 'filters' && (
          <div className="space-y-4 pl-6">
            {/* Entity Types */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground-muted">Entity Types</span>
                <button
                  onClick={toggleAllEntityTypes}
                  className="text-xs text-primary hover:text-primary-hover transition-colors"
                >
                  {filters.entityTypes.length === ENTITY_TYPES.length ? 'None' : 'All'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {ENTITY_TYPES.map((type) => (
                  <label
                    key={type.value}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={filters.entityTypes.includes(type.value)}
                      onChange={() => toggleEntityType(type.value)}
                      className="w-3.5 h-3.5 rounded border-border bg-surface-sunken text-primary focus:ring-1 focus:ring-primary"
                    />
                    <span
                      className="w-2 h-2 rounded-full flex-none"
                      style={{ backgroundColor: type.color }}
                    />
                    <span className="text-xs text-foreground-muted group-hover:text-foreground transition-colors">
                      {type.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Salience Threshold */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground-muted">Min Salience</span>
                <span className="text-xs text-foreground tabular-nums">
                  {(filters.minSalience * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={filters.minSalience * 100}
                onChange={(e) =>
                  onFiltersChange({ ...filters, minSalience: parseInt(e.target.value) / 100 })
                }
                className="w-full h-1.5 rounded-lg appearance-none bg-surface-sunken accent-primary cursor-pointer"
              />
            </div>

            {/* Entity Limit */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground-muted">Entity Limit</span>
                <span className="text-xs text-foreground tabular-nums">{filters.entityLimit}</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={filters.entityLimit}
                onChange={(e) =>
                  onFiltersChange({ ...filters, entityLimit: parseInt(e.target.value) })
                }
                className="w-full h-1.5 rounded-lg appearance-none bg-surface-sunken accent-primary cursor-pointer"
              />
            </div>

            {/* Memory Limit */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground-muted">Memory Limit</span>
                <span className="text-xs text-foreground tabular-nums">{filters.memoryLimit}</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="10"
                value={filters.memoryLimit}
                onChange={(e) =>
                  onFiltersChange({ ...filters, memoryLimit: parseInt(e.target.value) })
                }
                className="w-full h-1.5 rounded-lg appearance-none bg-surface-sunken accent-primary cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* Display Options Section */}
      <div className="space-y-3">
        <button
          onClick={() => setExpandedSection(expandedSection === 'display' ? null : 'display')}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground-muted">
            {icons.display}
            <span>Display</span>
          </div>
          {expandedSection === 'display' ? icons.chevronUp : icons.chevronDown}
        </button>

        {expandedSection === 'display' && (
          <div className="space-y-4 pl-6">
            {/* Toggle Options */}
            <div className="space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-foreground-muted">Show Particles</span>
                <input
                  type="checkbox"
                  checked={displayOptions.showParticles}
                  onChange={(e) =>
                    onDisplayOptionsChange({ ...displayOptions, showParticles: e.target.checked })
                  }
                  className="w-3.5 h-3.5 rounded border-border bg-surface-sunken text-primary focus:ring-1 focus:ring-primary"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-foreground-muted">Show Labels</span>
                <input
                  type="checkbox"
                  checked={displayOptions.showLabels}
                  onChange={(e) =>
                    onDisplayOptionsChange({ ...displayOptions, showLabels: e.target.checked })
                  }
                  className="w-3.5 h-3.5 rounded border-border bg-surface-sunken text-primary focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>

            {/* Edge Types */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground-muted">Edge Types</span>
                <button
                  onClick={toggleAllEdgeTypes}
                  className="text-xs text-primary hover:text-primary-hover transition-colors"
                >
                  {displayOptions.visibleEdgeTypes.length === EDGE_TYPES.length ? 'None' : 'All'}
                </button>
              </div>
              <div className="space-y-1.5">
                {EDGE_TYPES.map((type) => (
                  <label
                    key={type.value}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={displayOptions.visibleEdgeTypes.includes(type.value)}
                      onChange={() => toggleEdgeType(type.value)}
                      className="w-3.5 h-3.5 rounded border-border bg-surface-sunken text-primary focus:ring-1 focus:ring-primary"
                    />
                    <span
                      className="w-4 h-0.5 flex-none rounded"
                      style={{ backgroundColor: type.color }}
                    />
                    <span className="text-xs text-foreground-muted group-hover:text-foreground transition-colors">
                      {type.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// DEFAULT VALUES HELPER
// ============================================

export const DEFAULT_GRAPH_FILTERS: GraphFilters = {
  entityTypes: ENTITY_TYPES.map((t) => t.value),
  minSalience: 0,
  entityLimit: 30,
  memoryLimit: 70,
};

export const DEFAULT_DISPLAY_OPTIONS: GraphDisplayOptions = {
  showParticles: true,
  showLabels: true,
  showEdgeLabels: false,
  visibleEdgeTypes: EDGE_TYPES.map((t) => t.value),
};

export default GraphControls;
