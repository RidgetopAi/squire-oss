// ============================================
// SQUIRE WEB - ENTITIES API
// ============================================

import { apiGet } from './client';
import type { Entity, EntityType, EntityDetail, EntityMemoryMention, ConnectedEntity } from '@/lib/types';

// ============================================
// DATA TYPE MAPPING
// ============================================
// Backend → Frontend field mapping:
// - entity_type → type
// - first_seen_at → first_seen
// - last_seen_at → last_seen
// - attributes → metadata

interface BackendEntity {
  id: string;
  name: string;
  entity_type: EntityType;
  aliases?: string[];
  mention_count: number;
  first_seen_at: string;
  last_seen_at: string;
  attributes?: Record<string, unknown>;
}

interface BackendEntityDetail extends BackendEntity {
  memories: EntityMemoryMention[];
  connected_entities: ConnectedEntity[];
  primary_relationship: string | null;
}

/**
 * Transform backend entity to frontend Entity type
 */
function transformEntity(backend: BackendEntity): Entity {
  return {
    id: backend.id,
    name: backend.name,
    type: backend.entity_type,
    aliases: backend.aliases,
    mention_count: backend.mention_count,
    first_seen: backend.first_seen_at,
    last_seen: backend.last_seen_at,
    metadata: backend.attributes,
  };
}

/**
 * Transform backend enriched entity to frontend EntityDetail type
 */
function transformEntityDetail(backend: BackendEntityDetail): EntityDetail {
  return {
    ...transformEntity(backend),
    memories: backend.memories,
    connected_entities: backend.connected_entities,
    primary_relationship: backend.primary_relationship,
  };
}

// API Response types (using backend types)
interface EntitiesListResponse {
  entities: BackendEntity[];
  counts: Record<EntityType, number>;
  total: number;
  limit: number;
  offset: number;
}

interface EntitySearchResponse {
  query: string;
  entities: BackendEntity[];
  count: number;
}

export interface FetchEntitiesOptions {
  type?: EntityType;
  limit?: number;
  offset?: number;
  search?: string;
}

/**
 * Fetch entities with optional filters
 */
export async function fetchEntities(options: FetchEntitiesOptions = {}): Promise<{
  entities: Entity[];
  counts: Record<EntityType, number>;
  total: number;
}> {
  const { type, limit = 50, offset = 0, search } = options;
  const response = await apiGet<EntitiesListResponse>('/api/entities', {
    params: { type, limit, offset, search },
  });
  return {
    entities: response.entities.map(transformEntity),
    counts: response.counts,
    total: response.total,
  };
}

/**
 * Fetch a single entity by ID
 */
export async function fetchEntity(id: string): Promise<Entity> {
  const response = await apiGet<BackendEntity>(`/api/entities/${id}`);
  return transformEntity(response);
}

/**
 * Search entities by name
 */
export async function searchEntities(
  query: string,
  type?: EntityType
): Promise<Entity[]> {
  const response = await apiGet<EntitySearchResponse>('/api/entities/search', {
    params: { query, type },
  });
  return response.entities.map(transformEntity);
}

/**
 * Fetch top entities by mention count for dashboard display
 */
export async function fetchTopEntities(limit = 12): Promise<{
  entities: Entity[];
  counts: Record<EntityType, number>;
}> {
  const response = await apiGet<EntitiesListResponse>('/api/entities', {
    params: { limit },
  });

  // Transform and sort by mention count descending
  const transformed = response.entities.map(transformEntity);
  const sorted = transformed.sort((a, b) => b.mention_count - a.mention_count);

  return {
    entities: sorted,
    counts: response.counts,
  };
}

/**
 * Fetch enriched entity details including memories, connected entities, and relationships
 */
export async function fetchEntityDetails(id: string): Promise<EntityDetail> {
  const response = await apiGet<BackendEntityDetail>(`/api/entities/${id}`, {
    params: { include: 'full' },
  });
  return transformEntityDetail(response);
}
