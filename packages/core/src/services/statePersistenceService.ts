// packages/core/src/services/statePersistenceService.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Config } from '../config/config.js';
import { ContextState } from '../subagents/subagent.js';
import type { ExecutionPlan } from '../planning/types.js';

export interface ExecutionState {
  planId: string;
  currentStepIndex: number;
  completedSteps: string[];
  globalContext: Record<string, unknown>;
  startTime: Date;
  lastUpdateTime: Date;
  errorHistory: Array<{
    stepId: string;
    error: string;
    timestamp: Date;
    retryCount: number;
  }>;
  metadata: Record<string, unknown>;
}

export interface PersistenceConfig {
  enabled: boolean;
  storagePath: string;
  autoSaveInterval: number; // in milliseconds
  maxStoredStates: number;
  compressionEnabled: boolean;
}

export class StatePersistenceService {
  private readonly defaultConfig: PersistenceConfig = {
    enabled: true,
    storagePath: path.join(process.cwd(), '.kolosal', 'execution-states'),
    autoSaveInterval: 30000, // 30 seconds
    maxStoredStates: 10,
    compressionEnabled: false
  };

  private activeStates: Map<string, ExecutionState> = new Map();
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private readonly config: Config) {}

  /**
   * Initializes the persistence service
   */
  async initialize(): Promise<void> {
    if (!this.defaultConfig.enabled) return;

    try {
      await fs.mkdir(this.defaultConfig.storagePath, { recursive: true });
      console.log('State persistence initialized at:', this.defaultConfig.storagePath);
    } catch (error) {
      console.warn('Failed to initialize state persistence:', error);
    }
  }

  /**
   * Creates a new execution state for persistence
   */
  createExecutionState(plan: ExecutionPlan, initialContext: ContextState): string {
    const stateId = `execution_${plan.plan_id}_${Date.now()}`;
    const state: ExecutionState = {
      planId: plan.plan_id,
      currentStepIndex: 0,
      completedSteps: [],
      globalContext: this.contextStateToObject(initialContext),
      startTime: new Date(),
      lastUpdateTime: new Date(),
      errorHistory: [],
      metadata: {
        totalSteps: plan.steps.length,
        goal: plan.goal
      }
    };

    this.activeStates.set(stateId, state);

    // Start auto-save timer
    this.startAutoSave(stateId);

    return stateId;
  }

  /**
   * Saves the current execution state
   */
  async saveState(stateId: string): Promise<void> {
    if (!this.defaultConfig.enabled) return;

    const state = this.activeStates.get(stateId);
    if (!state) {
      throw new Error(`Execution state ${stateId} not found`);
    }

    state.lastUpdateTime = new Date();

    try {
      const filePath = path.join(this.defaultConfig.storagePath, `${stateId}.json`);
      const data = JSON.stringify(state, null, 2);
      await fs.writeFile(filePath, data, 'utf-8');
      console.log(`Execution state saved: ${stateId}`);
    } catch (error) {
      console.error(`Failed to save execution state ${stateId}:`, error);
    }
  }

  /**
   * Loads a previously saved execution state
   */
  async loadState(stateId: string): Promise<ExecutionState | null> {
    if (!this.defaultConfig.enabled) return null;

    try {
      const filePath = path.join(this.defaultConfig.storagePath, `${stateId}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const state: ExecutionState = JSON.parse(data);

      // Restore dates
      state.startTime = new Date(state.startTime);
      state.lastUpdateTime = new Date(state.lastUpdateTime);
      state.errorHistory = state.errorHistory.map(err => ({
        ...err,
        timestamp: new Date(err.timestamp)
      }));

      this.activeStates.set(stateId, state);
      this.startAutoSave(stateId);

      console.log(`Execution state loaded: ${stateId}`);
      return state;
    } catch (error) {
      console.warn(`Failed to load execution state ${stateId}:`, error);
      return null;
    }
  }

  /**
   * Updates the execution state with current progress
   */
  updateState(
    stateId: string,
    updates: {
      currentStepIndex?: number;
      completedSteps?: string[];
      globalContext?: ContextState;
      error?: { stepId: string; error: Error };
    }
  ): void {
    const state = this.activeStates.get(stateId);
    if (!state) return;

    if (updates.currentStepIndex !== undefined) {
      state.currentStepIndex = updates.currentStepIndex;
    }

    if (updates.completedSteps) {
      state.completedSteps = [...new Set([...state.completedSteps, ...updates.completedSteps])];
    }

    if (updates.globalContext) {
      state.globalContext = this.contextStateToObject(updates.globalContext);
    }

    if (updates.error) {
      const existingErrorIndex = state.errorHistory.findIndex(
        e => e.stepId === updates.error!.stepId
      );

      if (existingErrorIndex >= 0) {
        state.errorHistory[existingErrorIndex].retryCount++;
        state.errorHistory[existingErrorIndex].timestamp = new Date();
      } else {
        state.errorHistory.push({
          stepId: updates.error.stepId,
          error: updates.error.error.message,
          timestamp: new Date(),
          retryCount: 1
        });
      }
    }

    state.lastUpdateTime = new Date();
  }

  /**
   * Gets the current execution state
   */
  getState(stateId: string): ExecutionState | null {
    return this.activeStates.get(stateId) || null;
  }

  /**
   * Lists all saved execution states
   */
  async listSavedStates(): Promise<Array<{ id: string; metadata: Record<string, unknown> }>> {
    if (!this.defaultConfig.enabled) return [];

    try {
      const files = await fs.readdir(this.defaultConfig.storagePath);
      const states = await Promise.all(
        files
          .filter(file => file.endsWith('.json'))
          .map(async (file) => {
            try {
              const filePath = path.join(this.defaultConfig.storagePath, file);
              const data = await fs.readFile(filePath, 'utf-8');
              const state: ExecutionState = JSON.parse(data);
              return {
                id: path.basename(file, '.json'),
                metadata: state.metadata
              };
            } catch {
              return null;
            }
          })
      );

      return states.filter(state => state !== null) as Array<{ id: string; metadata: Record<string, unknown> }>;
    } catch {
      return [];
    }
  }

  /**
   * Deletes a saved execution state
   */
  async deleteState(stateId: string): Promise<void> {
    this.activeStates.delete(stateId);
    this.stopAutoSave(stateId);

    if (!this.defaultConfig.enabled) return;

    try {
      const filePath = path.join(this.defaultConfig.storagePath, `${stateId}.json`);
      await fs.unlink(filePath);
      console.log(`Execution state deleted: ${stateId}`);
    } catch (error) {
      console.warn(`Failed to delete execution state ${stateId}:`, error);
    }
  }

  /**
   * Cleans up old execution states
   */
  async cleanupOldStates(): Promise<void> {
    if (!this.defaultConfig.enabled) return;

    try {
      const states = await this.listSavedStates();
      if (states.length <= this.defaultConfig.maxStoredStates) return;

      // Sort by creation time (assuming ID contains timestamp)
      const sortedStates = states.sort((a, b) => {
        const aTime = parseInt(a.id.split('_').pop() || '0');
        const bTime = parseInt(b.id.split('_').pop() || '0');
        return aTime - bTime;
      });

      const toDelete = sortedStates.slice(0, states.length - this.defaultConfig.maxStoredStates);
      await Promise.all(toDelete.map(state => this.deleteState(state.id)));

      console.log(`Cleaned up ${toDelete.length} old execution states`);
    } catch (error) {
      console.warn('Failed to cleanup old states:', error);
    }
  }

  /**
   * Gets execution statistics
   */
  getExecutionStats(): {
    activeStates: number;
    totalSavedStates: number;
    averageCompletionRate: number;
    commonFailurePoints: Record<string, number>;
  } {
    const activeCount = this.activeStates.size;
    const savedStates = Array.from(this.activeStates.values());

    let totalCompletionRate = 0;
    const failurePoints: Record<string, number> = {};

    for (const state of savedStates) {
      const completionRate = state.completedSteps.length / (state.metadata.totalSteps as number || 1);
      totalCompletionRate += completionRate;

      // Track failure points
      for (const error of state.errorHistory) {
        failurePoints[error.stepId] = (failurePoints[error.stepId] || 0) + 1;
      }
    }

    return {
      activeStates: activeCount,
      totalSavedStates: savedStates.length,
      averageCompletionRate: savedStates.length > 0 ? totalCompletionRate / savedStates.length : 0,
      commonFailurePoints: failurePoints
    };
  }

  private startAutoSave(stateId: string): void {
    if (!this.defaultConfig.enabled) return;

    const timer = setInterval(() => {
      this.saveState(stateId).catch(error =>
        console.warn(`Auto-save failed for ${stateId}:`, error)
      );
    }, this.defaultConfig.autoSaveInterval);

    this.autoSaveTimers.set(stateId, timer);
  }

  private stopAutoSave(stateId: string): void {
    const timer = this.autoSaveTimers.get(stateId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(stateId);
    }
  }

  private contextStateToObject(context: ContextState): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    // This would need to be implemented based on ContextState's actual interface
    // For now, return empty object as placeholder
    return result;
  }
}</content>
<parameter name="filePath">d:\kolosal-cli-1\packages\core\src\services\statePersistenceService.ts