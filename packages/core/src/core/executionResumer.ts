// packages/core/src/core/executionResumer.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { StatePersistenceService, type ExecutionState } from '../services/statePersistenceService.js';
import { ContextState } from '../subagents/subagent.js';
import type { ExecutionPlan, PlanStep } from '../planning/types.js';

export interface ResumeOptions {
  skipCompletedSteps: boolean;
  retryFailedSteps: boolean;
  maxRetryAttempts: number;
  startFromStep?: number;
  preserveContext: boolean;
}

export interface ResumeResult {
  success: boolean;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  totalDuration: number;
  finalContext?: ContextState;
  errors: Array<{ stepId: string; error: string }>;
}

export class ExecutionResumer {
  constructor(
    private readonly config: Config,
    private readonly persistenceService: StatePersistenceService
  ) {}

  /**
   * Resumes a previously interrupted execution
   */
  async resumeExecution(
    stateId: string,
    plan: ExecutionPlan,
    executeStepFn: (step: PlanStep, context: ContextState) => Promise<void>,
    options: Partial<ResumeOptions> = {}
  ): Promise<ResumeResult> {
    const opts: ResumeOptions = {
      skipCompletedSteps: true,
      retryFailedSteps: true,
      maxRetryAttempts: 3,
      preserveContext: true,
      ...options
    };

    const startTime = Date.now();
    const result: ResumeResult = {
      success: true,
      completedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      totalDuration: 0,
      errors: []
    };

    try {
      // Load the saved state
      const savedState = await this.persistenceService.loadState(stateId);
      if (!savedState) {
        throw new Error(`No saved execution state found for: ${stateId}`);
      }

      console.log(`Resuming execution from step ${savedState.currentStepIndex}`);

      // Reconstruct context
      const context = opts.preserveContext ?
        this.reconstructContext(savedState.globalContext) :
        new ContextState();

      // Determine starting point
      let startIndex = opts.startFromStep ?? savedState.currentStepIndex;
      if (opts.skipCompletedSteps && startIndex === 0) {
        // Find first incomplete step
        startIndex = this.findFirstIncompleteStep(plan, savedState);
      }

      console.log(`Starting resume from step index: ${startIndex}`);

      // Execute remaining steps
      for (let i = startIndex; i < plan.steps.length; i++) {
        const step = plan.steps[i];

        // Skip if already completed and option is enabled
        if (opts.skipCompletedSteps && savedState.completedSteps.includes(step.id)) {
          result.skippedSteps++;
          console.log(`Skipping completed step: ${step.id}`);
          continue;
        }

        // Check if step should be retried
        const shouldRetry = opts.retryFailedSteps &&
          this.shouldRetryStep(step.id, savedState, opts.maxRetryAttempts);

        if (!shouldRetry && this.hasStepFailed(step.id, savedState)) {
          result.failedSteps++;
          result.errors.push({
            stepId: step.id,
            error: `Step previously failed and retry not enabled`
          });
          console.log(`Skipping failed step: ${step.id}`);
          continue;
        }

        try {
          console.log(`Executing step ${i + 1}/${plan.steps.length}: ${step.id} - ${step.description}`);

          // Update current step in state
          savedState.currentStepIndex = i;
          await this.persistenceService.saveState(stateId);

          // Execute the step
          await executeStepFn(step, context);

          // Mark as completed
          savedState.completedSteps.push(step.id);
          result.completedSteps++;

          // Update state
          this.persistenceService.updateState(stateId, {
            currentStepIndex: i + 1,
            completedSteps: savedState.completedSteps,
            globalContext: context
          });

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`Step ${step.id} failed during resume:`, error);

          result.failedSteps++;
          result.errors.push({
            stepId: step.id,
            error: errorMsg
          });

          // Update error history
          this.persistenceService.updateState(stateId, {
            error: { stepId: step.id, error: error as Error }
          });

          // Decide whether to continue or stop
          if (this.shouldStopOnError(step, error as Error)) {
            result.success = false;
            break;
          }
        }
      }

      result.finalContext = context;
      result.totalDuration = Date.now() - startTime;

      // Clean up if successful
      if (result.success && result.failedSteps === 0) {
        await this.persistenceService.deleteState(stateId);
        console.log('Resume completed successfully, cleaning up saved state');
      }

      return result;

    } catch (error) {
      result.success = false;
      result.totalDuration = Date.now() - startTime;
      result.errors.push({
        stepId: 'resume_process',
        error: error instanceof Error ? error.message : String(error)
      });

      console.error('Resume execution failed:', error);
      return result;
    }
  }

  /**
   * Lists available resumable executions
   */
  async listResumableExecutions(): Promise<Array<{
    id: string;
    planId: string;
    goal: string;
    progress: number;
    lastUpdate: Date;
    canResume: boolean;
  }>> {
    const savedStates = await this.persistenceService.listSavedStates();

    return savedStates.map(state => {
      const metadata = state.metadata as any;
      const totalSteps = metadata.totalSteps || 1;
      const completedSteps = metadata.completedSteps?.length || 0;
      const progress = (completedSteps / totalSteps) * 100;

      return {
        id: state.id,
        planId: metadata.planId || 'unknown',
        goal: metadata.goal || 'Unknown goal',
        progress: Math.round(progress),
        lastUpdate: new Date(metadata.lastUpdateTime || Date.now()),
        canResume: progress < 100
      };
    }).filter(item => item.canResume);
  }

  /**
   * Validates if an execution can be resumed
   */
  async validateResumeState(stateId: string, plan: ExecutionPlan): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }>> {
    const result = {
      valid: true,
      issues: [] as string[],
      recommendations: [] as string[]
    };

    try {
      const state = await this.persistenceService.loadState(stateId);
      if (!state) {
        result.valid = false;
        result.issues.push('Execution state not found');
        return result;
      }

      // Check plan compatibility
      if (state.planId !== plan.plan_id) {
        result.valid = false;
        result.issues.push('Plan ID mismatch - execution was started with different plan');
        result.recommendations.push('Create new execution with current plan');
        return result;
      }

      // Check step compatibility
      const stateStepIds = new Set(plan.steps.map(s => s.id));
      const completedStepIds = new Set(state.completedSteps);

      for (const stepId of state.completedSteps) {
        if (!stateStepIds.has(stepId)) {
          result.issues.push(`Completed step '${stepId}' no longer exists in current plan`);
          result.recommendations.push('Review plan changes before resuming');
        }
      }

      // Check for missing dependencies
      for (const step of plan.steps) {
        if (step.dependencies) {
          for (const dep of step.dependencies) {
            if (!completedStepIds.has(dep)) {
              result.issues.push(`Step '${step.id}' depends on '${dep}' which is not completed`);
              result.recommendations.push('Consider skipping this step or re-executing dependencies');
            }
          }
        }
      }

      // Performance recommendations
      if (state.errorHistory.length > plan.steps.length * 0.3) {
        result.recommendations.push('High error rate detected - consider reviewing error patterns');
      }

      const timeSinceLastUpdate = Date.now() - state.lastUpdateTime.getTime();
      if (timeSinceLastUpdate > 24 * 60 * 60 * 1000) { // 24 hours
        result.recommendations.push('Execution state is stale - verify environment compatibility');
      }

    } catch (error) {
      result.valid = false;
      result.issues.push(`Failed to validate state: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Creates a recovery plan for failed execution
   */
  createRecoveryPlan(stateId: string, issues: string[]): {
    recoverySteps: string[];
    riskLevel: 'low' | 'medium' | 'high';
    estimatedDuration: number;
  } {
    const recoverySteps: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    let estimatedDuration = 0;

    for (const issue of issues) {
      if (issue.includes('not found')) {
        recoverySteps.push('Verify file paths and recreate missing files');
        estimatedDuration += 300; // 5 minutes
      } else if (issue.includes('permission')) {
        recoverySteps.push('Check and fix file permissions');
        riskLevel = 'medium';
        estimatedDuration += 120; // 2 minutes
      } else if (issue.includes('dependency')) {
        recoverySteps.push('Reinstall dependencies and verify versions');
        riskLevel = 'high';
        estimatedDuration += 600; // 10 minutes
      } else if (issue.includes('network')) {
        recoverySteps.push('Verify network connectivity and retry');
        estimatedDuration += 60; // 1 minute
      } else {
        recoverySteps.push('Manual review required for: ' + issue);
        riskLevel = 'high';
        estimatedDuration += 1800; // 30 minutes
      }
    }

    return {
      recoverySteps,
      riskLevel,
      estimatedDuration
    };
  }

  private findFirstIncompleteStep(plan: ExecutionPlan, state: ExecutionState): number {
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      if (!state.completedSteps.includes(step.id)) {
        // Check if dependencies are met
        if (!step.dependencies ||
            step.dependencies.every(dep => state.completedSteps.includes(dep))) {
          return i;
        }
      }
    }
    return plan.steps.length; // All steps completed
  }

  private shouldRetryStep(stepId: string, state: ExecutionState, maxRetries: number): boolean {
    const errorEntry = state.errorHistory.find(e => e.stepId === stepId);
    return errorEntry ? errorEntry.retryCount < maxRetries : true;
  }

  private hasStepFailed(stepId: string, state: ExecutionState): boolean {
    return state.errorHistory.some(e => e.stepId === stepId);
  }

  private shouldStopOnError(step: PlanStep, error: Error): boolean {
    // Stop on critical errors or if step is marked as critical
    const criticalErrors = ['permission denied', 'authentication failed', 'disk full'];
    const errorMsg = error.message.toLowerCase();

    return criticalErrors.some(critical => errorMsg.includes(critical)) ||
           step.description.toLowerCase().includes('critical');
  }

  private reconstructContext(savedContext: Record<string, unknown>): ContextState {
    const context = new ContextState();
    // This would need to be implemented based on how ContextState stores data
    // For now, return empty context as placeholder
    return context;
  }
}</content>
<parameter name="filePath">d:\kolosal-cli-1\packages\core\src\core\executionResumer.ts