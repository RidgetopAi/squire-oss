// ============================================
// SQUIRE WEB - COLOR UTILITIES
// ============================================
// Helpers for salience, emotion, and entity coloring

import type { EntityType } from '@/lib/types';

// Entity type icons
const entityIcons: Record<EntityType, string> = {
  person: '👤',
  organization: '🏢',
  location: '📍',
  project: '📁',
  concept: '💡',
  event: '📅',
};

export function getEntityIcon(type: EntityType): string {
  return entityIcons[type] || '📌';
}

export function getEntityTextClass(type: EntityType): string {
  const entityColorMap: Record<EntityType, string> = {
    person: 'entity-person',
    organization: 'entity-organization',
    location: 'entity-location',
    project: 'entity-project',
    concept: 'entity-concept',
    event: 'entity-event',
  };
  return `text-${entityColorMap[type] || 'entity-concept'}`;
}
