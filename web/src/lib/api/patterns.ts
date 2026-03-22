// ============================================
// SQUIRE WEB - PATTERNS API
// ============================================

import { apiGet } from './client';
import type { Pattern, PatternType } from '@/lib/types';

// ============================================
// DATA TYPE MAPPING
// ============================================
// Backend → Frontend field mapping:
// - content → description
// - pattern_type → type
// - first_detected_at → first_detected
// - last_observed_at → last_detected

interface BackendPattern {
  id: string;
  content: string;
  pattern_type: PatternType;
  frequency: number;
  confidence: number;
  first_detected_at: string;
  last_observed_at: string | null;
}

/**
 * Transform backend pattern to frontend Pattern type
 */
function transformPattern(backend: BackendPattern): Pattern {
  return {
    id: backend.id,
    description: backend.content,
    type: backend.pattern_type,
    frequency: backend.frequency,
    confidence: backend.confidence,
    first_detected: backend.first_detected_at,
    last_detected: backend.last_observed_at || backend.first_detected_at,
  };
}

// API Response types (using backend types)
interface PatternsListResponse {
  patterns: BackendPattern[];
  count: number;
}

interface PatternResponse {
  pattern: BackendPattern;
}

interface PatternStatsResponse {
  stats: {
    total: number;
    byType: Record<PatternType, number>;
    avgConfidence: number;
    avgFrequency: number;
  };
  types: PatternType[];
  timeValues: string[];
  dayValues: string[];
}

export interface FetchPatternsOptions {
  type?: PatternType;
  status?: string;
  minConfidence?: number;
  timeOfDay?: string;
  dayOfWeek?: string;
  limit?: number;
}

/**
 * Fetch patterns with optional filters
 */
export async function fetchPatterns(options: FetchPatternsOptions = {}): Promise<Pattern[]> {
  const { type, status, minConfidence, timeOfDay, dayOfWeek, limit = 50 } = options;
  const response = await apiGet<PatternsListResponse>('/api/patterns', {
    params: {
      type,
      status,
      minConfidence,
      timeOfDay,
      dayOfWeek,
      limit,
    },
  });
  return response.patterns.map(transformPattern);
}

/**
 * Fetch a single pattern by ID
 */
export async function fetchPattern(id: string): Promise<Pattern> {
  const response = await apiGet<PatternResponse>(`/api/patterns/${id}`);
  return transformPattern(response.pattern);
}

/**
 * Fetch pattern statistics
 */
export async function fetchPatternStats(): Promise<PatternStatsResponse['stats']> {
  const response = await apiGet<PatternStatsResponse>('/api/patterns/stats');
  return response.stats;
}

