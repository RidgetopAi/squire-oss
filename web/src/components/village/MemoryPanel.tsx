'use client';

// ============================================
// SQUIRE WEB - MEMORY PANEL OVERLAY
// ============================================
// Shows memory details when a building is selected

import { useMemory } from '@/lib/hooks';
import type { VillageBuilding, MemoryCategory } from '@/lib/types/village';
import { BUILDING_COLORS } from '@/lib/types/village';

// ============================================
// TYPES
// ============================================

export interface MemoryPanelProps {
  /** Selected memory ID */
  memoryId: string | null;
  /** Selected building data */
  building: VillageBuilding | null;
  /** Close handler */
  onClose: () => void;
}

// ============================================
// ICONS
// ============================================

const icons = {
  close: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  memory: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  calendar: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  sparkle: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
};

// ============================================
// CATEGORY DISPLAY CONFIG
// ============================================

const CATEGORY_CONFIG: Record<MemoryCategory, { label: string; emoji: string }> = {
  social: { label: 'Social', emoji: '👥' },
  learning: { label: 'Learning', emoji: '📚' },
  work: { label: 'Work', emoji: '💼' },
  reflection: { label: 'Reflection', emoji: '🪞' },
  travel: { label: 'Travel', emoji: '✈️' },
  health: { label: 'Health', emoji: '💪' },
  misc: { label: 'General', emoji: '📝' },
};

// ============================================
// LOADING SKELETON
// ============================================

function PanelSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-3/4 bg-surface-sunken rounded" />
      <div className="h-4 w-1/2 bg-surface-sunken rounded" />
      <div className="space-y-2">
        <div className="h-3 w-full bg-surface-sunken rounded" />
        <div className="h-3 w-full bg-surface-sunken rounded" />
        <div className="h-3 w-2/3 bg-surface-sunken rounded" />
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function MemoryPanel({ memoryId, building, onClose }: MemoryPanelProps) {
  const { data: memory, isLoading, isError } = useMemory(memoryId ?? undefined);

  // Don't render if no selection
  if (!memoryId || !building) {
    return null;
  }

  const categoryConfig = CATEGORY_CONFIG[building.category] || CATEGORY_CONFIG.misc;
  const buildingColor = BUILDING_COLORS[building.buildingType] || BUILDING_COLORS.house;

  return (
    <div className="pointer-events-auto absolute right-4 top-4 bottom-4 w-80 flex flex-col rounded-xl border border-border bg-background/95 shadow-2xl backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border"
        style={{ backgroundColor: `${buildingColor}15` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: `${buildingColor}25`,
              borderColor: `${buildingColor}50`,
              borderWidth: 1,
            }}
          >
            <span style={{ color: buildingColor }}>{icons.memory}</span>
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground capitalize">
              {building.buildingType}
            </h3>
            <p className="text-xs text-foreground-muted">
              {categoryConfig.emoji} {categoryConfig.label}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-surface-sunken transition-colors text-foreground-muted hover:text-foreground"
          title="Close"
        >
          {icons.close}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <PanelSkeleton />
        ) : isError || !memory ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm text-foreground-muted">
              Unable to load memory details
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Memory Label */}
            <div>
              <h2 className="text-base font-semibold text-foreground leading-tight">
                {building.label}
              </h2>
            </div>

            {/* Stats Row */}
            <div className="flex gap-3">
              {/* Salience */}
              <div className="flex-1 px-3 py-2 rounded-lg bg-surface-sunken">
                <div className="flex items-center gap-1.5 text-xs text-foreground-muted mb-1">
                  {icons.sparkle}
                  <span>Salience</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(memory.salience || 0) * 100}%`,
                        backgroundColor: buildingColor,
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground">
                    {Math.round((memory.salience || 0) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Date */}
            <div className="flex items-center gap-2 text-xs text-foreground-muted">
              {icons.calendar}
              <span>
                {new Date(memory.created_at).toLocaleDateString(undefined, {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>

            {/* Memory Content */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
                Memory Content
              </h4>
              <div className="text-sm text-foreground leading-relaxed bg-surface-sunken rounded-lg p-3 max-h-48 overflow-y-auto">
                {memory.content}
              </div>
            </div>

            {/* Source Badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground-muted">Source:</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-sunken text-foreground-muted capitalize">
                {memory.source}
              </span>
            </div>

            {/* Emotional Valence (if available) */}
            {building.emotionalValence !== undefined && building.emotionalValence !== 0 && (
              <div className="px-3 py-2 rounded-lg bg-surface-sunken">
                <div className="text-xs text-foreground-muted mb-1">Emotional Tone</div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {building.emotionalValence > 0.3 ? '😊' :
                     building.emotionalValence < -0.3 ? '😔' : '😐'}
                  </span>
                  <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-0.5 h-full bg-foreground-muted opacity-30" />
                    </div>
                    <div
                      className="absolute top-0 h-full rounded-full transition-all"
                      style={{
                        width: `${Math.abs(building.emotionalValence) * 50}%`,
                        left: building.emotionalValence >= 0 ? '50%' : undefined,
                        right: building.emotionalValence < 0 ? '50%' : undefined,
                        backgroundColor: building.emotionalValence >= 0 ? '#34d399' : '#f472b6',
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground min-w-[3rem] text-right">
                    {building.emotionalValence > 0 ? '+' : ''}{(building.emotionalValence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            )}

            {/* Connected Entities (if available) */}
            {memory.entities && memory.entities.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
                  Mentioned Entities
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {memory.entities.slice(0, 6).map((entity) => (
                    <span
                      key={entity.id}
                      className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-surface-sunken text-foreground hover:bg-border transition-colors cursor-default"
                    >
                      {entity.name}
                    </span>
                  ))}
                  {memory.entities.length > 6 && (
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-surface-sunken text-foreground-muted">
                      +{memory.entities.length - 6} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MemoryPanel;
