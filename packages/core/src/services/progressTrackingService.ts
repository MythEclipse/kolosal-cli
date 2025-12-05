// packages/core/src/services/progressTrackingService.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExecutionPlan } from '../planning/types.js';

export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  RETRYING = 'retrying'
}

export enum ExecutionPhase {
  PLANNING = 'planning',
  EXECUTING = 'executing',
  VALIDATING = 'validating',
  COMPLETING = 'completing',
  FAILED = 'failed'
}

export interface StepProgress {
  stepId: string;
  status: StepStatus;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  attempts: number;
  maxAttempts: number;
  error?: string;
  output?: string;
  metadata: Record<string, unknown>;
}

export interface ExecutionProgress {
  executionId: string;
  planId: string;
  phase: ExecutionPhase;
  startTime: Date;
  lastUpdateTime: Date;
  estimatedTotalDuration?: number;
  estimatedTimeRemaining?: number;
  overallProgress: number; // 0-100
  stepsProgress: StepProgress[];
  currentStepId?: string;
  metadata: Record<string, unknown>;
}

export interface ProgressUpdate {
  executionId: string;
  stepId?: string;
  status?: StepStatus;
  phase?: ExecutionPhase;
  progress?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

export class ProgressTrackingService {
  private executions: Map<string, ExecutionProgress> = new Map();
  private callbacks: ProgressCallback[] = [];
  private readonly maxHistorySize = 100;

  constructor() {}

  /**
   * Starts tracking progress for a new execution
   */
  startExecution(plan: ExecutionPlan, executionId?: string): string {
    const id = executionId || `exec_${plan.plan_id}_${Date.now()}`;

    const progress: ExecutionProgress = {
      executionId: id,
      planId: plan.plan_id,
      phase: ExecutionPhase.PLANNING,
      startTime: new Date(),
      lastUpdateTime: new Date(),
      overallProgress: 0,
      stepsProgress: plan.steps.map(step => ({
        stepId: step.id,
        status: StepStatus.PENDING,
        attempts: 0,
        maxAttempts: 3, // Default, can be overridden
        metadata: {
          description: step.description,
          type: step.type,
          dependencies: step.dependencies || []
        }
      })),
      metadata: {
        totalSteps: plan.steps.length,
        goal: plan.goal
      }
    };

    this.executions.set(id, progress);

    // Notify callbacks
    this.notifyCallbacks({
      executionId: id,
      phase: ExecutionPhase.PLANNING,
      message: `Started execution: ${plan.goal}`
    });

    // Clean up old executions if needed
    this.cleanupOldExecutions();

    return id;
  }

  /**
   * Updates the progress of a specific step
   */
  updateStepProgress(
    executionId: string,
    stepId: string,
    updates: Partial<StepProgress>
  ): void {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    const stepProgress = execution.stepsProgress.find(s => s.stepId === stepId);
    if (!stepProgress) return;

    // Update step progress
    Object.assign(stepProgress, updates);
    execution.lastUpdateTime = new Date();

    // Update timestamps
    if (updates.status === StepStatus.RUNNING && !stepProgress.startTime) {
      stepProgress.startTime = new Date();
      execution.currentStepId = stepId;
    } else if (
      (updates.status === StepStatus.COMPLETED || updates.status === StepStatus.FAILED) &&
      !stepProgress.endTime
    ) {
      stepProgress.endTime = new Date();
      if (stepProgress.startTime) {
        stepProgress.duration = stepProgress.endTime.getTime() - stepProgress.startTime.getTime();
      }
      execution.currentStepId = undefined;
    }

    // Recalculate overall progress
    this.recalculateOverallProgress(execution);

    // Notify callbacks
    this.notifyCallbacks({
      executionId,
      stepId,
      status: updates.status,
      progress: execution.overallProgress,
      message: this.generateStepMessage(stepProgress),
      metadata: updates.metadata
    });
  }

  /**
   * Updates the execution phase
   */
  updateExecutionPhase(executionId: string, phase: ExecutionPhase, metadata?: Record<string, unknown>): void {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    execution.phase = phase;
    execution.lastUpdateTime = new Date();

    if (metadata) {
      Object.assign(execution.metadata, metadata);
    }

    // Notify callbacks
    this.notifyCallbacks({
      executionId,
      phase,
      progress: execution.overallProgress,
      message: `Phase changed to: ${phase}`,
      metadata
    });
  }

  /**
   * Gets the current progress of an execution
   */
  getExecutionProgress(executionId: string): ExecutionProgress | null {
    return this.executions.get(executionId) || null;
  }

  /**
   * Gets progress summary for all executions
   */
  getAllExecutionsSummary(): Array<{
    executionId: string;
    planId: string;
    phase: ExecutionPhase;
    progress: number;
    startTime: Date;
    estimatedTimeRemaining?: number;
    currentStep?: string;
  }> {
    return Array.from(this.executions.values()).map(exec => ({
      executionId: exec.executionId,
      planId: exec.planId,
      phase: exec.phase,
      progress: exec.overallProgress,
      startTime: exec.startTime,
      estimatedTimeRemaining: exec.estimatedTimeRemaining,
      currentStep: exec.currentStepId
    }));
  }

  /**
   * Registers a callback for progress updates
   */
  onProgressUpdate(callback: ProgressCallback): () => void {
    this.callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Completes an execution
   */
  completeExecution(executionId: string, success: boolean = true): void {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    execution.phase = success ? ExecutionPhase.COMPLETING : ExecutionPhase.FAILED;
    execution.overallProgress = success ? 100 : execution.overallProgress;
    execution.lastUpdateTime = new Date();

    // Notify callbacks
    this.notifyCallbacks({
      executionId,
      phase: execution.phase,
      progress: execution.overallProgress,
      message: success ? 'Execution completed successfully' : 'Execution failed'
    });
  }

  /**
   * Gets execution statistics
   */
  getExecutionStats(): {
    totalExecutions: number;
    activeExecutions: number;
    completedExecutions: number;
    failedExecutions: number;
    averageCompletionTime: number;
    averageProgress: number;
    commonFailurePoints: Record<string, number>;
  } {
    const executions = Array.from(this.executions.values());
    const total = executions.length;
    const active = executions.filter(e => e.phase === ExecutionPhase.EXECUTING).length;
    const completed = executions.filter(e => e.phase === ExecutionPhase.COMPLETING).length;
    const failed = executions.filter(e => e.phase === ExecutionPhase.FAILED).length;

    const completedExecutions = executions.filter(e =>
      e.phase === ExecutionPhase.COMPLETING && e.stepsProgress.length > 0
    );

    const averageCompletionTime = completedExecutions.length > 0
      ? completedExecutions.reduce((sum, e) => {
          const duration = e.lastUpdateTime.getTime() - e.startTime.getTime();
          return sum + duration;
        }, 0) / completedExecutions.length
      : 0;

    const averageProgress = executions.length > 0
      ? executions.reduce((sum, e) => sum + e.overallProgress, 0) / executions.length
      : 0;

    const failurePoints: Record<string, number> = {};
    executions.forEach(exec => {
      exec.stepsProgress.forEach(step => {
        if (step.status === StepStatus.FAILED) {
          failurePoints[step.stepId] = (failurePoints[step.stepId] || 0) + 1;
        }
      });
    });

    return {
      totalExecutions: total,
      activeExecutions: active,
      completedExecutions: completed,
      failedExecutions: failed,
      averageCompletionTime,
      averageProgress,
      commonFailurePoints: failurePoints
    };
  }

  /**
   * Estimates time remaining for an execution
   */
  estimateTimeRemaining(executionId: string): number | null {
    const execution = this.executions.get(executionId);
    if (!execution) return null;

    const completedSteps = execution.stepsProgress.filter(s => s.status === StepStatus.COMPLETED);
    if (completedSteps.length === 0) return null;

    const averageStepTime = completedSteps.reduce((sum, step) => {
      return sum + (step.duration || 0);
    }, 0) / completedSteps.length;

    const remainingSteps = execution.stepsProgress.filter(s =>
      s.status === StepStatus.PENDING || s.status === StepStatus.RUNNING
    ).length;

    return averageStepTime * remainingSteps;
  }

  private recalculateOverallProgress(execution: ExecutionProgress): void {
    const totalSteps = execution.stepsProgress.length;
    if (totalSteps === 0) {
      execution.overallProgress = 0;
      return;
    }

    const completedSteps = execution.stepsProgress.filter(s =>
      s.status === StepStatus.COMPLETED
    ).length;

    const runningSteps = execution.stepsProgress.filter(s =>
      s.status === StepStatus.RUNNING
    ).length;

    // Weight running steps as 50% complete
    const progress = ((completedSteps + runningSteps * 0.5) / totalSteps) * 100;
    execution.overallProgress = Math.min(100, Math.max(0, progress));

    // Update time estimates
    execution.estimatedTimeRemaining = this.estimateTimeRemaining(execution.executionId) || undefined;
  }

  private notifyCallbacks(update: ProgressUpdate): void {
    this.callbacks.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
        console.warn('Progress callback failed:', error);
      }
    });
  }

  private generateStepMessage(step: StepProgress): string {
    const baseMessage = `Step ${step.stepId}: ${step.status}`;

    switch (step.status) {
      case StepStatus.RUNNING:
        return `${baseMessage} (attempt ${step.attempts + 1}/${step.maxAttempts})`;
      case StepStatus.FAILED:
        return `${baseMessage} - ${step.error || 'Unknown error'}`;
      case StepStatus.RETRYING:
        return `${baseMessage} - Retrying...`;
      case StepStatus.COMPLETED:
        const duration = step.duration ? ` in ${Math.round(step.duration / 1000)}s` : '';
        return `${baseMessage}${duration}`;
      default:
        return baseMessage;
    }
  }

  private cleanupOldExecutions(): void {
    if (this.executions.size <= this.maxHistorySize) return;

    // Keep only the most recent executions
    const sorted = Array.from(this.executions.entries())
      .sort(([, a], [, b]) => b.startTime.getTime() - a.startTime.getTime());

    const toKeep = sorted.slice(0, this.maxHistorySize);
    this.executions.clear();

    toKeep.forEach(([id, progress]) => {
      this.executions.set(id, progress);
    });
  }
}
