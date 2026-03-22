/**
 * Memory tool types
 */

export interface LessonStoreArgs {
  content: string;
  trigger?: string;
  category?: string;
  importance?: number;
}

export interface LessonSearchArgs {
  query: string;
  limit?: number;
}

export interface PreferenceUpdateArgs {
  key: string;
  value: string;
  reasoning?: string;
}

export interface PreferenceGetArgs {
  key?: string;
}
