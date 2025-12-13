/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import {
  type WorkflowContext,
  type UserRequest,
  type StageResult,
  WorkflowStage,
  createWorkflowContext,
  isValidTransition,
  getStageName,
} from './workflow-context.js';
import {
  type SpecializedAgent,
  ALL_AGENTS,
  getAgent,
  PlannerAgent,
  ArchitectAgent,
  DesignPatternAgent,
  CoderAgent,
  TesterAgent,
  DebuggerAgent,
  ReviewerAgent,
} from './agents/specialized-agents.js';

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Whether to run full workflow or simplified */
  fullWorkflow: boolean;
  /** Maximum total rounds across all stages */
  maxTotalRounds: number;
  /** Skip stages for simple tasks */
  autoSkipStages: boolean;
  /** Debug mode */
  debug: boolean;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  fullWorkflow: true,
  maxTotalRounds: 50,
  autoSkipStages: true,
  debug: false,
};

/**
 * Stage to agent mapping
 */
const STAGE_AGENTS: Record<WorkflowStage, SpecializedAgent | null> = {
  [WorkflowStage.INTAKE]: null, // Orchestrator handles
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
 * Main Coding Orchestrator
 *
 * Coordinates specialized agents through a development workflow.
 */
export class CodingOrchestrator {
  private config: OrchestratorConfig;
  private activeWorkflows: Map<string, WorkflowContext> = new Map();
  private runtimeConfig: Config;

  constructor(runtimeConfig: Config, config?: Partial<OrchestratorConfig>) {
    this.runtimeConfig = runtimeConfig;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start a new workflow from user request
   */
  async startWorkflow(request: UserRequest): Promise<WorkflowContext> {
    const context = createWorkflowContext(request);
    this.activeWorkflows.set(context.id, context);

    // Analyze request to determine complexity and type
    const analysis = await this.analyzeRequest(request);
    context.request.type = analysis.type;
    context.request.complexity = analysis.complexity;

    // Store analysis in artifacts
    context.artifacts.set('request_analysis', analysis);

    this.log(`Started workflow ${context.id}`, context);
    return context;
  }

  /**
   * Execute the complete workflow
   */
  async executeWorkflow(context: WorkflowContext): Promise<WorkflowContext> {
    try {
      // Determine workflow path based on complexity
      const stages = this.determineWorkflowPath(context);

      for (const stage of stages) {
        if (context.paused || context.error) break;

        const result = await this.executeStage(context, stage);
        context.stageHistory.push(result);
        context.updatedAt = Date.now();

        if (!result.success) {
          context.error = result.error;
          break;
        }

        // Move to next stage
        if (result.nextStage) {
          context.currentStage = result.nextStage;
        }
      }

      context.currentStage = WorkflowStage.COMPLETED;
      return context;
    } catch (error) {
      context.error = error instanceof Error ? error.message : String(error);
      return context;
    }
  }

  /**
   * Execute a single stage
   */
  async executeStage(
    context: WorkflowContext,
    stage: WorkflowStage,
  ): Promise<StageResult> {
    const startTime = Date.now();
    context.currentStage = stage;

    this.log(`Executing stage: ${getStageName(stage)}`, context);

    try {
      const agent = STAGE_AGENTS[stage];

      if (!agent) {
        // No agent for this stage (intake/completed)
        return {
          stage,
          success: true,
          output: `Stage ${stage} completed (no agent required)`,
          durationMs: Date.now() - startTime,
          nextStage: this.getNextStage(stage, context),
        };
      }

      // Execute agent
      const result = await this.executeAgent(agent, context);

      return {
        stage,
        success: true,
        output: result.output,
        artifacts: result.artifacts,
        durationMs: Date.now() - startTime,
        nextStage: this.getNextStage(stage, context),
      };
    } catch (error) {
      return {
        stage,
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a specialized agent
   */
  private async executeAgent(
    agent: SpecializedAgent,
    context: WorkflowContext,
  ): Promise<{ output: string; artifacts?: Map<string, unknown> }> {
    this.log(`Running agent: ${agent.displayName}`, context);

    // Build context message for agent
    const contextMessage = this.buildAgentContext(agent, context);

    // TODO: Integrate with actual subagent execution
    // For now, return placeholder
    return {
      output: `Agent ${agent.name} executed successfully`,
      artifacts: new Map(),
    };
  }

  /**
   * Build context message for agent
   */
  private buildAgentContext(
    agent: SpecializedAgent,
    context: WorkflowContext,
  ): string {
    const parts: string[] = [];

    // Original request
    parts.push(`## User Request\n${context.request.message}`);

    // Previous stage outputs
    if (context.stageHistory.length > 0) {
      parts.push('\n## Previous Stage Outputs');
      for (const result of context.stageHistory) {
        parts.push(`\n### ${getStageName(result.stage)}\n${result.output}`);
      }
    }

    // Relevant artifacts
    if (context.artifacts.size > 0) {
      parts.push('\n## Artifacts');
      for (const [key, value] of context.artifacts) {
        parts.push(`\n### ${key}\n${JSON.stringify(value, null, 2)}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Analyze request to determine type and complexity
   */
  private async analyzeRequest(request: UserRequest): Promise<{
    type: UserRequest['type'];
    complexity: number;
    suggestedStages: WorkflowStage[];
  }> {
    const message = request.message.toLowerCase();

    // Simple heuristics for now
    // TODO: Use LLM for more accurate analysis
    let type: UserRequest['type'] = 'unknown';
    let complexity = 5;

    if (
      message.includes('bug') ||
      message.includes('fix') ||
      message.includes('error')
    ) {
      type = 'bugfix';
      complexity = 4;
    } else if (message.includes('test') || message.includes('spec')) {
      type = 'test';
      complexity = 3;
    } else if (message.includes('refactor') || message.includes('cleanup')) {
      type = 'refactor';
      complexity = 4;
    } else if (message.includes('doc') || message.includes('readme')) {
      type = 'docs';
      complexity = 2;
    } else if (
      message.includes('add') ||
      message.includes('implement') ||
      message.includes('create')
    ) {
      type = 'feature';
      complexity = 7;
    }

    // Adjust complexity based on length and keywords
    if (message.length > 500) complexity += 2;
    if (message.includes('complex') || message.includes('large'))
      complexity += 2;
    if (message.includes('simple') || message.includes('small'))
      complexity -= 2;

    complexity = Math.max(1, Math.min(10, complexity));

    return {
      type,
      complexity,
      suggestedStages: this.getSuggestedStages(type, complexity),
    };
  }

  /**
   * Get suggested stages based on task type
   */
  private getSuggestedStages(
    type: UserRequest['type'],
    complexity: number,
  ): WorkflowStage[] {
    // Simple tasks skip some stages
    if (complexity <= 3) {
      if (type === 'bugfix') {
        return [
          WorkflowStage.INTAKE,
          WorkflowStage.DEBUGGING,
          WorkflowStage.CODING,
          WorkflowStage.TESTING,
          WorkflowStage.COMPLETED,
        ];
      }
      if (type === 'test') {
        return [
          WorkflowStage.INTAKE,
          WorkflowStage.TESTING,
          WorkflowStage.COMPLETED,
        ];
      }
      if (type === 'docs') {
        return [
          WorkflowStage.INTAKE,
          WorkflowStage.CODING,
          WorkflowStage.COMPLETED,
        ];
      }
    }

    // Complex tasks use full workflow
    if (complexity >= 7) {
      return [
        WorkflowStage.INTAKE,
        WorkflowStage.PLANNING,
        WorkflowStage.ARCHITECTURE,
        WorkflowStage.DESIGN,
        WorkflowStage.CODING,
        WorkflowStage.TESTING,
        WorkflowStage.REVIEW,
        WorkflowStage.COMPLETED,
      ];
    }

    // Medium complexity - planning + coding + testing
    return [
      WorkflowStage.INTAKE,
      WorkflowStage.PLANNING,
      WorkflowStage.CODING,
      WorkflowStage.TESTING,
      WorkflowStage.COMPLETED,
    ];
  }

  /**
   * Determine workflow path based on context
   */
  private determineWorkflowPath(context: WorkflowContext): WorkflowStage[] {
    const analysis = context.artifacts.get('request_analysis') as {
      suggestedStages: WorkflowStage[];
    };

    if (analysis?.suggestedStages) {
      return analysis.suggestedStages;
    }

    // Default full workflow
    return [
      WorkflowStage.INTAKE,
      WorkflowStage.PLANNING,
      WorkflowStage.ARCHITECTURE,
      WorkflowStage.DESIGN,
      WorkflowStage.CODING,
      WorkflowStage.TESTING,
      WorkflowStage.REVIEW,
      WorkflowStage.COMPLETED,
    ];
  }

  /**
   * Get next stage after current
   */
  private getNextStage(
    current: WorkflowStage,
    context: WorkflowContext,
  ): WorkflowStage | undefined {
    const path = this.determineWorkflowPath(context);
    const currentIndex = path.indexOf(current);

    if (currentIndex >= 0 && currentIndex < path.length - 1) {
      return path[currentIndex + 1];
    }
    return undefined;
  }

  /**
   * Transition to a specific stage
   */
  async transitionTo(
    context: WorkflowContext,
    stage: WorkflowStage,
  ): Promise<boolean> {
    if (!isValidTransition(context.currentStage, stage)) {
      this.log(
        `Invalid transition: ${context.currentStage} -> ${stage}`,
        context,
      );
      return false;
    }

    context.currentStage = stage;
    context.updatedAt = Date.now();
    return true;
  }

  /**
   * Pause workflow
   */
  pause(context: WorkflowContext): void {
    context.paused = true;
    context.updatedAt = Date.now();
  }

  /**
   * Resume workflow
   */
  resume(context: WorkflowContext): void {
    context.paused = false;
    context.updatedAt = Date.now();
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(id: string): WorkflowContext | undefined {
    return this.activeWorkflows.get(id);
  }

  /**
   * Get all active workflows
   */
  getActiveWorkflows(): WorkflowContext[] {
    return Array.from(this.activeWorkflows.values());
  }

  /**
   * Get available agents
   */
  getAvailableAgents(): SpecializedAgent[] {
    return ALL_AGENTS;
  }

  /**
   * Get agent for a stage
   */
  getAgentForStage(stage: WorkflowStage): SpecializedAgent | null {
    return STAGE_AGENTS[stage];
  }

  /**
   * Log message if debug mode
   */
  private log(message: string, context?: WorkflowContext): void {
    if (this.config.debug) {
      const prefix = context ? `[${context.id}]` : '[Orchestrator]';
      console.error(`${prefix} ${message}`);
    }
  }
}

/**
 * Global orchestrator instance
 */
let globalOrchestrator: CodingOrchestrator | null = null;

export function getGlobalOrchestrator(
  runtimeConfig: Config,
  config?: Partial<OrchestratorConfig>,
): CodingOrchestrator {
  if (!globalOrchestrator) {
    globalOrchestrator = new CodingOrchestrator(runtimeConfig, config);
  }
  return globalOrchestrator;
}

export function resetGlobalOrchestrator(): void {
  globalOrchestrator = null;
}
