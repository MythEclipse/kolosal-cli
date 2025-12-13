/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Orchestrator module exports
 */

// Workflow context and types
export {
  WorkflowStage,
  type WorkflowContext,
  type UserRequest,
  type StageResult,
  createWorkflowContext,
  isValidTransition,
  getStageName,
  STAGE_TRANSITIONS,
} from './workflow-context.js';

// Specialized agents
export {
  type SpecializedAgent,
  ALL_AGENTS,
  getAgent,
  getAgentNames,
  toSubagentConfig,
  PlannerAgent,
  ArchitectAgent,
  DesignPatternAgent,
  CoderAgent,
  TesterAgent,
  DebuggerAgent,
  ReviewerAgent,
} from './agents/specialized-agents.js';

// Main orchestrator
export {
  CodingOrchestrator,
  type OrchestratorConfig,
  getGlobalOrchestrator,
  resetGlobalOrchestrator,
} from './orchestrator.js';

// Integration
export {
  OrchestratorIntegration,
  createOrchestratorIntegration,
} from './integration.js';
