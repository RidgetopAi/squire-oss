// ============================================
// SQUIRE WEB - SHARED TYPES
// ============================================
// Synced with backend API types

// Memory Types
export interface Memory {
  id: string;
  content: string;
  source: MemorySource;
  salience: number;
  created_at: string;
  updated_at: string;
  embedding?: number[];
  emotions?: EmotionScores;
  entities?: Entity[];
}

export type MemorySource =
  | 'chat'
  | 'conversation'
  | 'observation'
  | 'document'
  | 'import'
  | 'system';

export interface EmotionScores {
  joy?: number;
  sadness?: number;
  anger?: number;
  fear?: number;
  surprise?: number;
  disgust?: number;
}

// Entity Types
export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  aliases?: string[];
  mention_count: number;
  first_seen: string;
  last_seen: string;
  metadata?: Record<string, unknown>;
}

export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'project'
  | 'concept'
  | 'event';

// Enriched entity types for detail view
export interface EntityMemoryMention {
  id: string;
  content: string;
  created_at: string;
  salience_score: number;
  mention_text: string;
  relationship_type: string | null;
}

export interface ConnectedEntity {
  id: string;
  name: string;
  entity_type: EntityType;
  mention_count: number;
  shared_memory_count: number;
}

export interface EntityDetail extends Entity {
  memories: EntityMemoryMention[];
  connected_entities: ConnectedEntity[];
  primary_relationship: string | null;
}

// Belief Types
export interface Belief {
  id: string;
  statement: string;
  category: BeliefCategory;
  confidence: number;
  evidence_count: number;
  first_observed: string;
  last_reinforced: string;
  status: 'active' | 'deprecated' | 'conflicted';
}

export type BeliefCategory =
  | 'value'
  | 'preference'
  | 'habit'
  | 'opinion'
  | 'fact'
  | 'goal'
  | 'identity';

// Pattern Types
export interface Pattern {
  id: string;
  description: string;
  type: PatternType;
  frequency: number;
  confidence: number;
  first_detected: string;
  last_detected: string;
  examples?: string[];
}

export type PatternType =
  | 'behavioral'
  | 'temporal'
  | 'emotional'
  | 'social'
  | 'cognitive';

// Insight Types
export interface Insight {
  id: string;
  content: string;
  type: InsightType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'new' | 'reviewed' | 'actioned' | 'dismissed';
  source_memories: string[];
  created_at: string;
}

export type InsightType =
  | 'connection'
  | 'contradiction'
  | 'opportunity'
  | 'warning'
  | 'realization';

// Summary Types
export interface LivingSummary {
  id: string;
  category: SummaryCategory;
  content: string;
  version: number;
  memory_count: number;
  last_updated: string;
}

export type SummaryCategory =
  | 'personality'
  | 'goals'
  | 'relationships'
  | 'projects'
  | 'interests'
  | 'wellbeing'
  | 'commitments';

// Scored Memory (from context service)
export interface ScoredMemory {
  id: string;
  content: string;
  created_at: string;
  salience_score: number;
  current_strength: number;
  similarity?: number;
  recency_score: number;
  final_score: number;
  token_estimate: number;
  category: 'high_salience' | 'relevant' | 'recent';
}

// Entity Summary (from context service)
export interface EntitySummary {
  id: string;
  name: string;
  type: EntityType;
  mention_count: number;
}

// Summary Snapshot (from context service)
export interface SummarySnapshot {
  category: string;
  content: string;
  version: number;
  memory_count: number;
}

// Context Package (returned by /api/context)
export interface ContextPackage {
  generated_at: string;
  profile: string;
  query?: string;
  memories: ScoredMemory[];
  entities: EntitySummary[];
  summaries: SummarySnapshot[];
  token_count: number;
  disclosure_id: string;
  markdown: string;
  json: object;
}

// Chat Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  context?: ContextPackage;
  memoryIds?: string[];
  reportData?: ReportData;
  images?: { preview: string; name: string }[];
}

// Report Data (from present_report tool)
export interface ReportData {
  title: string;
  summary: string;
  content: string; // markdown
  generatedAt: string;
}

// Conversation pair (user message + assistant response)
export interface ConversationPair {
  id: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage | null;
  isStreaming: boolean;
}

export interface Conversation {
  id: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

// Graph Types (for visualization)
export interface GraphNode {
  id: string;
  type: 'memory' | 'entity';
  label: string;
  data: Memory | Entity;
  salience?: number;
  color?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
}

export type EdgeType =
  | 'mentions'
  | 'similar'
  | 'temporal'
  | 'causal';

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Commitment Types
export interface Commitment {
  id: string;
  title: string;
  description: string | null;
  memory_id: string | null;
  source_type: 'chat' | 'manual' | 'google_sync';
  due_at: string | null;
  timezone: string;
  all_day: boolean;
  duration_minutes: number | null;
  rrule: string | null;
  status: CommitmentStatus;
  resolved_at: string | null;
  resolution_type: ResolutionType | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type CommitmentStatus = 'open' | 'in_progress' | 'completed' | 'canceled' | 'snoozed';
export type ResolutionType = 'completed' | 'canceled' | 'no_longer_relevant' | 'superseded';

// Resolution Detection Types
export interface ResolutionDetection {
  is_resolution: boolean;
  resolution_type: ResolutionType | null;
  subject_hint: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface CommitmentMatch {
  commitment: Commitment;
  similarity: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface ResolutionCandidate {
  message_content: string;
  detection: ResolutionDetection;
  matches: CommitmentMatch[];
  best_match: CommitmentMatch | null;
  requires_confirmation: boolean;
}

// Profile Types
export interface ContextProfile {
  id: string;
  name: string;
  description: string;
  token_budget: number;
  weights: {
    recency: number;
    salience: number;
    relevance: number;
  };
}

// Google Integration Types
export interface GoogleAccount {
  id: string;
  email: string;
  display_name: string | null;
  sync_enabled: boolean;
  last_full_sync_at: string | null;
  created_at: string;
}

export interface GoogleCalendar {
  id: string;
  google_account_id: string;
  calendar_id: string;
  name: string;
  description: string | null;
  background_color: string | null;
  foreground_color: string | null;
  is_primary: boolean;
  access_role: string;
  sync_enabled: boolean;
  sync_direction: 'pull_only' | 'push_only' | 'bidirectional';
  is_default_for_push: boolean;
  last_sync_at: string | null;
  created_at: string;
}

export interface GoogleConnectionStatus {
  configured: boolean;
  accounts: GoogleAccount[];
  error?: string;
}

// Calendar Event Types (for merged view)
export interface CalendarEvent {
  id: string;
  source: 'squire' | 'google';
  title: string;
  description: string | null;
  start: string;
  end: string | null;
  allDay: boolean;
  timezone: string | null;
  status: string;
  color: string | null;
  commitmentId?: string;
  googleEventId?: string;
  googleCalendarName?: string;
  location?: string | null;
  htmlLink?: string | null;
  // Recurrence data
  isRecurring?: boolean;
  isOccurrence?: boolean;
  occurrenceIndex?: number;
  rrule?: string | null;
}

// ============================================
// Recurrence Types (RRULE)
// ============================================

/**
 * Common recurrence frequency options for UI
 */
export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

/**
 * Day of week codes (RFC 5545 format)
 */
export type DayOfWeek = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

/**
 * Parsed recurrence rule for display and editing
 */
export interface ParsedRecurrence {
  frequency: RecurrenceFrequency | 'custom';
  interval: number;
  daysOfWeek?: DayOfWeek[];
  dayOfMonth?: number;
  monthOfYear?: number;
  until?: string; // ISO date string
  count?: number;
  isValid: boolean;
  rawRule: string;
}

/**
 * Recurrence builder input for creating new rules
 */
export interface RecurrenceInput {
  frequency: RecurrenceFrequency;
  interval?: number;
  daysOfWeek?: DayOfWeek[];
  endType: 'never' | 'until' | 'count';
  until?: string; // ISO date string
  count?: number;
}

/**
 * A single occurrence of a recurring commitment
 */
export interface RecurrenceOccurrence {
  /** ISO date string of this occurrence */
  date: string;
  /** Index in the recurrence sequence (0-based) */
  index: number;
  /** Whether this is an exception (modified from the rule) */
  isException?: boolean;
  /** Whether this occurrence has been resolved/completed */
  isResolved?: boolean;
  /** Original commitment ID this occurrence belongs to */
  commitmentId: string;
}

/**
 * Result of expanding a recurrence rule (from API)
 */
export interface RecurrenceExpansion {
  rrule: string;
  dtstart: string;
  until?: string;
  count?: number;
  occurrences: string[]; // ISO date strings
  totalCount: number | null;
  isInfinite: boolean;
}

/**
 * Preset recurrence options for quick selection
 */
export const RecurrencePresets = {
  DAILY: 'RRULE:FREQ=DAILY',
  WEEKLY: 'RRULE:FREQ=WEEKLY',
  BIWEEKLY: 'RRULE:FREQ=WEEKLY;INTERVAL=2',
  MONTHLY: 'RRULE:FREQ=MONTHLY',
  YEARLY: 'RRULE:FREQ=YEARLY',
  WEEKDAYS: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  WEEKENDS: 'RRULE:FREQ=WEEKLY;BYDAY=SA,SU',
} as const;

export type RecurrencePreset = keyof typeof RecurrencePresets;

/**
 * Human-readable labels for recurrence frequencies
 */
export const RecurrenceFrequencyLabels: Record<RecurrenceFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

/**
 * Day of week labels
 */
export const DayOfWeekLabels: Record<DayOfWeek, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

export const DayOfWeekShortLabels: Record<DayOfWeek, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

// ============================================
// Notes Types
// ============================================

export type NoteSourceType = 'manual' | 'voice' | 'chat' | 'calendar_event';
export type NoteCategory = 'work' | 'personal' | 'health' | 'project' | string;

export interface Note {
  id: string;
  title: string | null;
  content: string;
  memory_id: string | null;
  source_type: NoteSourceType;
  source_context: Record<string, unknown>;
  primary_entity_id: string | null;
  entity_ids: string[];
  category: NoteCategory | null;
  tags: string[];
  is_pinned: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  // Joined entity data (optional)
  primary_entity?: Entity;
}

export interface CreateNoteInput {
  title?: string;
  content: string;
  source_type?: NoteSourceType;
  source_context?: Record<string, unknown>;
  primary_entity_id?: string;
  category?: NoteCategory;
  tags?: string[];
  is_pinned?: boolean;
  color?: string;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  category?: NoteCategory;
  tags?: string[];
  is_pinned?: boolean;
  color?: string;
}

export interface ListNotesOptions {
  category?: NoteCategory;
  entity_id?: string;
  is_pinned?: boolean;
  tags?: string[];
  limit?: number;
  offset?: number;
}

// ============================================
// Lists Types
// ============================================

export type ListType = 'checklist' | 'simple' | 'ranked';
export type ListSortOrder = 'manual' | 'created' | 'priority' | 'due_date';

export interface List {
  id: string;
  name: string;
  description: string | null;
  list_type: ListType;
  primary_entity_id: string | null;
  category: string | null;
  tags: string[];
  is_pinned: boolean;
  color: string | null;
  default_sort: ListSortOrder;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  // Joined data
  primary_entity?: Entity;
  item_count?: number;
  completed_count?: number;
}

export interface ListItem {
  id: string;
  list_id: string;
  content: string;
  notes: string | null;
  is_completed: boolean;
  completed_at: string | null;
  priority: number;
  due_at: string | null;
  entity_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  // Joined
  entity?: Entity;
}

export interface ListWithItems extends List {
  items: ListItem[];
}

export interface CreateListInput {
  name: string;
  description?: string;
  list_type?: ListType;
  primary_entity_id?: string;
  category?: string;
  tags?: string[];
  is_pinned?: boolean;
  color?: string;
}

export interface CreateListItemInput {
  content: string;
  notes?: string;
  priority?: number;
  due_at?: string;
  entity_id?: string;
}

export interface ListCompletionStats {
  total: number;
  completed: number;
  percentage: number;
}

// ============================================
// Document Intelligence Types (Phase 5-6)
// ============================================

export type DocumentMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/msword'
  | 'text/plain'
  | 'text/markdown'
  | 'text/x-markdown'
  | 'image/png'
  | 'image/jpeg'
  | 'image/jpg'
  | 'image/webp'
  | 'image/tiff'
  | 'image/bmp'
  | 'image/gif';

export type DocumentProcessingStatus =
  | 'pending'
  | 'extracting'
  | 'chunking'
  | 'embedding'
  | 'completed'
  | 'failed';

export interface DocumentMetadata {
  title?: string;
  author?: string;
  pageCount?: number;
  wordCount: number;
  createdAt?: string;
}

export interface ExtractedDocument {
  text: string;
  metadata: DocumentMetadata;
  pages?: string[];
}

export interface DocumentChunk {
  id: string;
  objectId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  pageNumber?: number;
  sectionTitle?: string;
  embedding?: number[];
  createdAt: string;
}

export interface DocumentUploadResult {
  objectId: string;
  filename: string;
  mimeType: DocumentMimeType;
  size: number;
  extraction: ExtractedDocument;
  status: DocumentProcessingStatus;
}

export interface DocumentSearchResult {
  chunkId: string;
  objectId: string;
  content: string;
  similarity: number;
  pageNumber?: number;
  sectionTitle?: string;
  metadata?: Record<string, unknown>;
}

export interface ChunkingOptions {
  strategy: 'semantic' | 'fixed' | 'hybrid';
  maxTokens?: number;
  overlapTokens?: number;
  preserveParagraphs?: boolean;
}

export interface DocumentSummaryResult {
  summary: string;
  keyPoints: string[];
  wordCount: number;
  processingTime: number;
}

export interface DocumentAskResult {
  answer: string;
  confidence: number;
  sources: Array<{
    pageNumber?: number;
    excerpt: string;
  }>;
}

// ============================================
// Fact Extraction Types (Phase 6)
// ============================================

export type FactStatus = 'pending' | 'approved' | 'rejected' | 'merged' | 'auto_approved';

export type FactType =
  | 'biographical'
  | 'event'
  | 'relationship'
  | 'preference'
  | 'statement'
  | 'date'
  | 'location'
  | 'organization';

export type FactEntityType = 'person' | 'project' | 'concept' | 'place' | 'organization';

export type FactDateType =
  | 'event_date'
  | 'deadline'
  | 'anniversary'
  | 'birth_date'
  | 'death_date'
  | 'start_date'
  | 'end_date'
  | 'reference';

export interface ExtractedFactEntity {
  name: string;
  type: FactEntityType;
  role?: string;
  confidence: number;
  mentionText?: string;
}

export interface ExtractedFactDate {
  date: string; // YYYY-MM-DD
  type: FactDateType;
  confidence: number;
  rawText: string;
  isRecurring?: boolean;
}

export interface ExtractedRelationship {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  description?: string;
}

export interface ExtractedFact {
  id: string;
  chunkId: string;
  objectId: string;
  factType: FactType;
  content: string;
  rawText: string;
  confidence: number;
  status: FactStatus;
  reviewedAt?: string;
  reviewerNotes?: string;
  entities: ExtractedFactEntity[];
  dates: ExtractedFactDate[];
  relationships: ExtractedRelationship[];
  sourcePage?: number;
  sourceSection?: string;
  memoryId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FactExtractionStats {
  total: number;
  byStatus: Record<FactStatus, number>;
  byType: Record<FactType, number>;
  avgConfidence: number;
  totalEntities: number;
  totalDates: number;
  totalRelationships: number;
}

export interface FactExtractionBatch {
  id: string;
  objectId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalChunks: number;
  processedChunks: number;
  factsExtracted: number;
  factsAutoApproved: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface FactExtractionOptions {
  minConfidence?: number;
  autoApproveThreshold?: number;
  extractEntities?: boolean;
  extractDates?: boolean;
  extractRelationships?: boolean;
  maxFactsPerChunk?: number;
  factTypes?: FactType[];
}

// Labels for display
export const FactTypeLabels: Record<FactType, string> = {
  biographical: 'Biographical',
  event: 'Event',
  relationship: 'Relationship',
  preference: 'Preference',
  statement: 'Statement',
  date: 'Date',
  location: 'Location',
  organization: 'Organization',
};

export const FactStatusLabels: Record<FactStatus, string> = {
  pending: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  merged: 'Merged',
  auto_approved: 'Auto-Approved',
};

export const FactStatusColors: Record<FactStatus, string> = {
  pending: 'text-yellow-400',
  approved: 'text-green-400',
  rejected: 'text-red-400',
  merged: 'text-purple-400',
  auto_approved: 'text-blue-400',
};
