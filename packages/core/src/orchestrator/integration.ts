/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { ContextState } from '../subagents/subagent.js';
import {
  type SpecializedAgent,
  type WorkflowContext,
  type StageResult,
  WorkflowStage,
  getStageName,
  PlannerAgent,
  ArchitectAgent,
  DesignPatternAgent,
  CoderAgent,
  TesterAgent,
  DebuggerAgent,
  ReviewerAgent,
} from '../orchestrator/index.js';

/**
 * Stage to agent mapping
 */
const STAGE_AGENTS: Record<WorkflowStage, SpecializedAgent | null> = {
  [WorkflowStage.INTAKE]: null,
  [WorkflowStage.PLANNING]: PlannerAgent,
  [WorkflowStage.ARCHITECTURE]: ArchitectAgent,
  [WorkflowStage.DESIGN]: DesignPatternAgent,
  [WorkflowStage.CODING]: CoderAgent,
  [WorkflowStage.TESTING]: TesterAgent,
  [WorkflowStage.DEBUGGING]: DebuggerAgent,
  [WorkflowStage.REVIEW]: ReviewerAgent,
  [WorkflowStage.COMPLETED]: null,
};

/**
 * Integration layer for executing specialized agents through SubAgentScope.
 */
export class OrchestratorIntegration {
  constructor(private readonly config: Config) {}

  /**
   * Execute a specialized agent for a workflow stage
   */
  async executeAgent(
    agent: SpecializedAgent,
    context: WorkflowContext,
  ): Promise<StageResult> {
    const startTime = Date.now();

    try {
      // Build context with previous stage outputs
      const contextState = this.buildContextState(context);

      // TODO: Create SubAgentScope and run when subagent types are compatible
      // For now, return a placeholder result
      const output = `Agent ${agent.name} executed with context: ${contextState.get_keys().join(', ')}`;

      return {
        stage: context.currentStage,
        success: true,
        output,
        durationMs: Date.now() - startTime,
        artifacts: new Map([['agent_name', agent.name]]),
      };
    } catch (error: unknown) {
      return {
        stage: context.currentStage,
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Build context state from workflow context
   */
  private buildContextState(context: WorkflowContext): ContextState {
    const state = new ContextState();

    // Set user request
    state.set('user_request', context.request.message);
    state.set('request_type', context.request.type || 'unknown');
    state.set('complexity', context.request.complexity?.toString() || '5');

    // Set target files if specified
    if (context.request.targetFiles) {
      state.set('target_files', context.request.targetFiles.join(', '));
    }

    // Set previous stage outputs
    if (context.stageHistory.length > 0) {
      const previousOutputs: string[] = [];
      for (const result of context.stageHistory) {
        previousOutputs.push(
          `## ${getStageName(result.stage)}\n${result.output}`,
        );
      }
      state.set('previous_outputs', previousOutputs.join('\n\n'));
    }

    // Set artifacts
    for (const [key, value] of context.artifacts) {
      state.set(`artifact_${key}`, JSON.stringify(value));
    }

    return state;
  }

  /**
   * Get agent for a workflow stage
   */
  getAgentForStage(stage: WorkflowStage): SpecializedAgent | null {
    return STAGE_AGENTS[stage];
  }

  /**
   * Check if stage has an agent
   */
  hasAgent(stage: WorkflowStage): boolean {
    return STAGE_AGENTS[stage] !== null;
  }

  /**
   * Get runtime config
   */
  getConfig(): Config {
    return this.config;
  }
}

/**
 * Create orchestrator integration
 */
export function createOrchestratorIntegration(
  config: Config,
): OrchestratorIntegration {
  return new OrchestratorIntegration(config);
}
