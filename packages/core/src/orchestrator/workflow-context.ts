/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Workflow stages for the coding orchestrator.
 * Each stage represents a phase in the development lifecycle.
 */
export enum WorkflowStage {
  /** Initial request analysis and routing */
  INTAKE = 'intake',
  /** Task breakdown and planning */
  PLANNING = 'planning',
  /** System architecture design */
  ARCHITECTURE = 'architecture',
  /** Design pattern selection */
  DESIGN = 'design',
  /** Code implementation */
  CODING = 'coding',
  /** Test creation and execution */
  TESTING = 'testing',
  /** Bug identification and fixing */
  DEBUGGING = 'debugging',
  /** Code quality review */
  REVIEW = 'review',
  /** Workflow completed */
  COMPLETED = 'completed',
}

/**
 * Result from a workflow stage execution
 */
export interface StageResult {
  stage: WorkflowStage;
  success: boolean;
  output: string;
  artifacts?: Map<string, unknown>;
  nextStage?: WorkflowStage;
  error?: string;
  durationMs: number;
}

/**
 * User request structure
 */
export interface UserRequest {
  /** Original user message */
  message: string;
  /** Request type hint */
  type?: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test' | 'unknown';
  /** Complexity estimate (1-10) */
  complexity?: number;
  /** Files to focus on */
  targetFiles?: string[];
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Shared context across workflow stages
 */
export interface WorkflowContext {
  /** Unique workflow ID */
  id: string;
  /** Original user request */
  request: UserRequest;
  /** Current workflow stage */
  currentStage: WorkflowStage;
  /** History of completed stages */
  stageHistory: StageResult[];
  /** Shared artifacts between stages */
  artifacts: Map<string, unknown>;
  /** Workflow start time */
  startedAt: number;
  /** Last update time */
  updatedAt: number;
  /** Whether workflow is paused */
  paused: boolean;
  /** Error if workflow failed */
  error?: string;
}

/**
 * Create a new workflow context
 */
export function createWorkflowContext(request: UserRequest): WorkflowContext {
  return {
    id: generateWorkflowId(),
    request,
    currentStage: WorkflowStage.INTAKE,
    stageHistory: [],
    artifacts: new Map(),
    startedAt: Date.now(),
    updatedAt: Date.now(),
    paused: false,
  };
}

/**
 * Generate a unique workflow ID
 */
function generateWorkflowId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Stage transition rules
 */
export const STAGE_TRANSITIONS: Record<WorkflowStage, WorkflowStage[]> = {
  [WorkflowStage.INTAKE]: [WorkflowStage.PLANNING],
  [WorkflowStage.PLANNING]: [WorkflowStage.ARCHITECTURE, WorkflowStage.CODING],
  [WorkflowStage.ARCHITECTURE]: [WorkflowStage.DESIGN],
  [WorkflowStage.DESIGN]: [WorkflowStage.CODING],
  [WorkflowStage.CODING]: [WorkflowStage.TESTING, WorkflowStage.REVIEW],
  [WorkflowStage.TESTING]: [WorkflowStage.DEBUGGING, WorkflowStage.REVIEW],
  [WorkflowStage.DEBUGGING]: [WorkflowStage.CODING, WorkflowStage.TESTING],
  [WorkflowStage.REVIEW]: [WorkflowStage.COMPLETED, WorkflowStage.CODING],
  [WorkflowStage.COMPLETED]: [],
};

/**
 * Check if a stage transition is valid
 */
export function isValidTransition(
  from: WorkflowStage,
  to: WorkflowStage,
): boolean {
  return STAGE_TRANSITIONS[from].includes(to);
}

/**
 * Get human-readable stage name
 */
export function getStageName(stage: WorkflowStage): string {
  const names: Record<WorkflowStage, string> = {
    [WorkflowStage.INTAKE]: '📥 Intake',
    [WorkflowStage.PLANNING]: '📋 Planning',
    [WorkflowStage.ARCHITECTURE]: '🏗️ Architecture',
    [WorkflowStage.DESIGN]: '🎨 Design',
    [WorkflowStage.CODING]: '💻 Coding',
    [WorkflowStage.TESTING]: '🧪 Testing',
    [WorkflowStage.DEBUGGING]: '🐛 Debugging',
    [WorkflowStage.REVIEW]: '📝 Review',
    [WorkflowStage.COMPLETED]: '✅ Completed',
  };
  return names[stage];
}
