'use client';

import { motion } from 'framer-motion';
import { useTopEntities } from '@/lib/hooks/useEntities';
import type { Entity, EntityType } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/formatting';

// Entity type metadata for display
const typeMeta: Record<EntityType, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  person: {
    label: 'Person',
    icon: '👤',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
  },
  organization: {
    label: 'Organization',
    icon: '🏢',
    color: 'text-info',
    bgColor: 'bg-info/10',
    borderColor: 'border-info/30',
  },
  location: {
    label: 'Location',
    icon: '📍',
    color: 'text-success',
    bgColor: 'bg-success/10',
    borderColor: 'border-success/30',
  },
  project: {
    label: 'Project',
    icon: '📁',
    color: 'text-accent-gold',
    bgColor: 'bg-accent-gold/10',
    borderColor: 'border-accent-gold/30',
  },
  concept: {
    label: 'Concept',
    icon: '💡',
    color: 'text-accent-purple',
    bgColor: 'bg-accent-purple/10',
    borderColor: 'border-accent-purple/30',
  },
  event: {
    label: 'Event',
    icon: '📅',
    color: 'text-emotion-joy',
    bgColor: 'bg-emotion-joy/10',
    borderColor: 'border-emotion-joy/30',
  },
};

interface EntitiesPanelProps {
  onEntityClick?: (entity: Entity) => void;
  limit?: number;
}

export function EntitiesPanel({ onEntityClick, limit = 15 }: EntitiesPanelProps) {
  const { data, isLoading, error } = useTopEntities(limit);

  if (isLoading) {
    return <EntitiesLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-error text-sm">
        Failed to load entities
      </div>
    );
  }

  if (!data?.entities || data.entities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-8">
        <div className="w-12 h-12 rounded-full bg-success/10 border border-success/30 flex items-center justify-center mb-3">
          <span className="text-xl">👥</span>
        </div>
        <p className="text-foreground-muted text-sm">
          No entities tracked yet. People, places, and projects will appear as you chat.
        </p>
      </div>
    );
  }

  // Group entities by type for the summary
  const typeOrder: EntityType[] = ['person', 'project', 'organization', 'location', 'concept', 'event'];

  return (
    <div className="space-y-4">
      {/* Type Summary Row */}
      <div className="flex flex-wrap gap-2">
        {typeOrder.map((type) => {
          const count = data.counts[type] || 0;
          if (count === 0) return null;
          const meta = typeMeta[type];
          return (
            <div
              key={type}
              className={`
                inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs
                ${meta.bgColor} ${meta.borderColor} border
              `}
            >
              <span>{meta.icon}</span>
              <span className={meta.color}>{count} {meta.label}{count !== 1 ? 's' : ''}</span>
            </div>
          );
        })}
      </div>

      {/* Entities Grid */}
      <div className="flex flex-wrap gap-2">
        {data.entities.map((entity, index) => (
          <EntityChip
            key={entity.id}
            entity={entity}
            index={index}
            onClick={() => onEntityClick?.(entity)}
          />
        ))}
      </div>
    </div>
  );
}

interface EntityChipProps {
  entity: Entity;
  index: number;
  onClick?: () => void;
}

function EntityChip({ entity, index, onClick }: EntityChipProps) {
  const meta = typeMeta[entity.type] || typeMeta.concept;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      onClick={onClick}
      className={`
        inline-flex items-center gap-2 px-3 py-2 rounded-lg
        bg-background-tertiary/50 border border-glass-border
        hover:bg-background-tertiary hover:${meta.borderColor}
        transition-all duration-200
        group
      `}
    >
      {/* Type Icon */}
      <span className={`
        w-6 h-6 rounded flex-shrink-0 flex items-center justify-center text-sm
        ${meta.bgColor}
      `}>
        {meta.icon}
      </span>

      {/* Name */}
      <span className="text-sm text-foreground font-medium truncate max-w-[120px]">
        {entity.name}
      </span>

      {/* Mention Count Badge */}
      <span className={`
        text-xs px-1.5 py-0.5 rounded-full
        ${meta.bgColor} ${meta.color}
      `}>
        {entity.mention_count}
      </span>
    </motion.button>
  );
}

function EntitiesLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Type summary skeleton */}
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-6 w-20 rounded-full bg-background-tertiary animate-pulse"
          />
        ))}
      </div>

      {/* Entities grid skeleton */}
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="h-10 w-32 rounded-lg bg-background-tertiary/50 border border-glass-border animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

export default EntitiesPanel;
