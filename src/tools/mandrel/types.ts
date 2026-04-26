// src/tools/mandrel/types.ts

/**
 * Type definitions for Mandrel MCP tool parameters
 */

// === Context Types ===

export type ContextType =
  | 'code'
  | 'decision'
  | 'error'
  | 'discussion'
  | 'planning'
  | 'completion'
  | 'milestone'
  | 'reflections'
  | 'handoff';

export interface ContextStoreArgs {
  content: string;
  type: ContextType;
  tags?: string[];
}

export interface ContextSearchArgs {
  query: string;
  limit?: number;
  type?: ContextType;
}

export interface ContextRecentArgs {
  limit?: number;
}

// === Project Types ===

export interface ProjectSwitchArgs {
  project: string;  // name or ID
}

// No args needed for project_current and project_list

// === Task Types ===

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TaskCreateArgs {
  title: string;
  description?: string;
  priority?: TaskPriority;
}

export interface TaskListArgs {
  status?: TaskStatus;
  limit?: number;
}

export interface TaskUpdateArgs {
  taskId: string;
  status: TaskStatus;
}

// === Decision Types ===

export type DecisionType =
  | 'architecture'
  | 'library'
  | 'framework'
  | 'pattern'
  | 'api_design'
  | 'database'
  | 'deployment'
  | 'security'
  | 'performance'
  | 'ui_ux'
  | 'testing'
  | 'tooling'
  | 'process'
  | 'naming_convention'
  | 'code_style';

export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';

export interface DecisionRecordArgs {
  decisionType: DecisionType;
  title: string;
  description: string;
  rationale: string;
  impactLevel: ImpactLevel;
}

export interface DecisionSearchArgs {
  query?: string;
  decisionType?: DecisionType;
  impactLevel?: ImpactLevel;
}

// === Search Types ===

export interface SmartSearchArgs {
  query: string;
}
