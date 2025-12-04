// packages/core/src/planning/types.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

// Define the structure for a single step in the execution plan
export interface PlanStep {
  id: string; // Unique ID for this step
  type: 'run_tool' | 'run_subagent' | 'process_data' | 'user_interaction'; // Type of action
  name: string; // Name of the tool or subagent to run, or a description for process_data/user_interaction
  description: string; // A human-readable description of what this step does
  args?: Record<string, unknown>; // Arguments for the tool/subagent, can be templated
  dependencies?: string[]; // IDs of steps that must complete before this one starts
  produces?: Record<string, string>; // Maps output keys to ContextState variable names
}

// Define the structure for the entire execution plan
export interface ExecutionPlan {
  plan_id: string; // Unique ID for the plan
  goal: string; // The high-level goal the plan aims to achieve
  steps: PlanStep[]; // The sequence of steps
}
