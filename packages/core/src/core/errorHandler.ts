// packages/core/src/core/errorHandler.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { ErrorRecoveryService, type RecoveryStrategy } from '../services/errorRecoveryService.js';
import { RetryService, type RetryResult } from '../services/retryService.js';
import { StatePersistenceService } from '../services/statePersistenceService.js';
import { ContextState } from '../subagents/subagent.js';

export interface ErrorHandlingOptions {
  enableRetry: boolean;
  enableRecovery: boolean;
  enablePersistence: boolean;
  maxRetries: number;
  retryStrategy: 'immediate' | 'linear' | 'exponential';
  persistStateOnError: boolean;
}

export interface ErrorHandlingResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  recoveryAttempted: boolean;
  retryAttempted: boolean;
  persisted: boolean;
}

export class ErrorHandler {
  private readonly recoveryService: ErrorRecoveryService;
  private readonly retryService: RetryService;
  private readonly persistenceService: StatePersistenceService;

  constructor() {
    this.recoveryService = new ErrorRecoveryService();
    this.retryService = new RetryService();
    this.persistenceService = new StatePersistenceService();;
  }

  /**
   * Initializes the error handling system
   */
  async initialize(): Promise<void> {
    await this.persistenceService.initialize();
  }

  /**
   * Executes an operation with comprehensive error handling
   */
  async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    context: ContextState,
    options: Partial<ErrorHandlingOptions> = {},
    executionStateId?: string
  ): Promise<ErrorHandlingResult<T>> {
    const opts: ErrorHandlingOptions = {
      enableRetry: true,
      enableRecovery: true,
      enablePersistence: true,
      maxRetries: 3,
      retryStrategy: 'exponential',
      persistStateOnError: true,
      ...options
    };

    let retryResult: RetryResult<T> | undefined;
    let recoveryAttempted = false;
    let persisted = false;

    try {
      // First attempt with retry logic
      if (opts.enableRetry) {
        retryResult = await this.retryService.executeWithRetry(operation, {
          maxAttempts: opts.maxRetries,
          strategy: opts.retryStrategy === 'immediate' ? 'immediate' :
                   opts.retryStrategy === 'linear' ? 'linear_backoff' : 'exponential_backoff'
        }, context);

        if (retryResult.success) {
          return {
            success: true,
            result: retryResult.result,
            recoveryAttempted: false,
            retryAttempted: true,
            persisted: false
          };
        }
      } else {
        // No retry, just execute once
        try {
          const result = await operation();
          return {
            success: true,
            result,
            recoveryAttempted: false,
            retryAttempted: false,
            persisted: false
          };
        } catch (error) {
          retryResult = {
            success: false,
            error: error as Error,
            attempts: 1,
            totalDuration: 0
          };
        }
      }

      // If we reach here, operation failed even with retries
      const error = retryResult?.error;
      if (!error) {
        throw new Error('Unknown error occurred');
      }

      // Analyze the error
      const errorAnalysis = this.recoveryService.analyzeError(error, {
        executionStateId,
        retryAttempts: retryResult?.attempts,
        context
      });

      console.log(`Error analysis: ${errorAnalysis.category} (${errorAnalysis.severity})`);

      // Attempt recovery if enabled
      if (opts.enableRecovery && errorAnalysis.recoverable) {
        console.log('Attempting error recovery...');
        recoveryAttempted = true;
        const recoverySuccess = await this.recoveryService.attemptRecovery(errorAnalysis, context);

        if (recoverySuccess) {
          // Try the operation again after recovery
          try {
            const result = await operation();
            return {
              success: true,
              result,
              recoveryAttempted: true,
              retryAttempted: !!retryResult,
              persisted: false
            };
          } catch (recoveryError) {
            console.warn('Operation failed even after recovery:', recoveryError);
          }
        }
      }

      // Persist state if enabled and we have an execution state
      if (opts.enablePersistence && opts.persistStateOnError && executionStateId) {
        try {
          await this.persistenceService.saveState(executionStateId);
          persisted = true;
          console.log(`Execution state persisted: ${executionStateId}`);
        } catch (persistError) {
          console.warn('Failed to persist execution state:', persistError);
        }
      }

      return {
        success: false,
        error,
        recoveryAttempted,
        retryAttempted: !!retryResult,
        persisted
      };

    } catch (unexpectedError) {
      console.error('Unexpected error in error handler:', unexpectedError);
      return {
        success: false,
        error: unexpectedError as Error,
        recoveryAttempted,
        retryAttempted: !!retryResult,
        persisted
      };
    }
  }

  /**
   * Registers a custom recovery strategy
   */
  registerRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.recoveryService.registerStrategy(strategy);
  }

  /**
   * Gets error handling statistics
   */
  getErrorStats(): {
    recoveryStats: unknown;
    retryStats: unknown;
    persistenceStats: unknown;
  } {
    return {
      recoveryStats: this.recoveryService.getRecoveryStats(),
      retryStats: this.retryService.getRetryStats(),
      persistenceStats: this.persistenceService.getExecutionStats()
    };
  }

  /**
   * Creates a resumable operation wrapper
   */
  createResumableOperation<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    operationName: string
  ): T {
    return ((...args: Parameters<T>) => 
      this.executeWithErrorHandling(
        () => fn(...args),
        new ContextState(),
        { enablePersistence: true },
        operationName
      )
    ) as T;
  }

  /**
   * Resumes a previously failed operation
   */
  async resumeOperation(stateId: string): Promise<{ resumed: boolean; state: unknown }> {
    const state = await this.persistenceService.loadState(stateId);
    if (!state) {
      throw new Error(`No saved state found for: ${stateId}`);
    }

    console.log(`Resuming operation from step ${state.currentStepIndex}`);
    // Implementation would depend on the orchestrator integration
    // This is a placeholder for the resume functionality
    return { resumed: true, state };
  }
}
