// packages/core/src/services/retryService.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { ContextState } from '../subagents/subagent.js';

export enum RetryStrategy {
  IMMEDIATE = 'immediate',
  LINEAR_BACKOFF = 'linear_backoff',
  EXPONENTIAL_BACKOFF = 'exponential_backoff',
  FIBONACCI_BACKOFF = 'fibonacci_backoff'
}

export interface RetryConfig {
  maxAttempts: number;
  strategy: RetryStrategy;
  baseDelay: number; // in milliseconds
  maxDelay: number; // in milliseconds
  jitter: boolean; // add randomness to delay
  retryableErrors: string[]; // error messages/patterns that should be retried
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDuration: number;
}

export class RetryService {
  private readonly defaultConfig: RetryConfig = {
    maxAttempts: 3,
    strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
    baseDelay: 1000,
    maxDelay: 30000,
    jitter: true,
    retryableErrors: [
      'network',
      'timeout',
      'connection',
      'temporary',
      'retryable'
    ]
  };

  constructor(private readonly config: Config) {}

  /**
   * Executes a function with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    retryConfig: Partial<RetryConfig> = {},
    context?: ContextState
  ): Promise<RetryResult<T>> {
    const config = { ...this.defaultConfig, ...retryConfig };
    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${config.maxAttempts} for operation`);
        const result = await operation();
        return {
          success: true,
          result,
          attempts: attempt,
          totalDuration: Date.now() - startTime
        };
      } catch (error) {
        lastError = error as Error;
        console.warn(`Attempt ${attempt} failed:`, error);

        // Check if error is retryable
        if (!this.isRetryableError(error as Error, config)) {
          console.log('Error is not retryable, stopping retry attempts');
          break;
        }

        // Don't wait after the last attempt
        if (attempt < config.maxAttempts) {
          const delay = this.calculateDelay(attempt, config);
          console.log(`Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: config.maxAttempts,
      totalDuration: Date.now() - startTime
    };
  }

  /**
   * Executes a function with retry logic and custom retry condition
   */
  async executeWithCustomRetry<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: Error, attempt: number) => boolean,
    retryConfig: Partial<RetryConfig> = {}
  ): Promise<RetryResult<T>> {
    const config = { ...this.defaultConfig, ...retryConfig };
    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        console.log(`Custom retry attempt ${attempt}/${config.maxAttempts}`);
        const result = await operation();
        return {
          success: true,
          result,
          attempts: attempt,
          totalDuration: Date.now() - startTime
        };
      } catch (error) {
        lastError = error as Error;

        if (!shouldRetry(error as Error, attempt)) {
          console.log('Custom retry condition not met, stopping');
          break;
        }

        if (attempt < config.maxAttempts) {
          const delay = this.calculateDelay(attempt, config);
          console.log(`Waiting ${delay}ms before custom retry...`);
          await this.delay(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: config.maxAttempts,
      totalDuration: Date.now() - startTime
    };
  }

  /**
   * Creates a retry wrapper for functions
   */
  createRetryWrapper<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    retryConfig: Partial<RetryConfig> = {}
  ): T {
    return ((...args: Parameters<T>) => {
      return this.executeWithRetry(() => fn(...args), retryConfig);
    }) as T;
  }

  /**
   * Gets retry statistics and recommendations
   */
  getRetryStats(): {
    recommendedConfigs: Record<string, RetryConfig>;
    successRates: Record<string, number>;
  } {
    // This would be populated with actual usage data
    return {
      recommendedConfigs: {
        network: {
          maxAttempts: 5,
          strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
          baseDelay: 1000,
          maxDelay: 10000,
          jitter: true,
          retryableErrors: ['network', 'timeout', 'connection']
        },
        filesystem: {
          maxAttempts: 3,
          strategy: RetryStrategy.LINEAR_BACKOFF,
          baseDelay: 500,
          maxDelay: 5000,
          jitter: false,
          retryableErrors: ['permission', 'busy', 'locked']
        },
        api: {
          maxAttempts: 3,
          strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
          baseDelay: 2000,
          maxDelay: 20000,
          jitter: true,
          retryableErrors: ['rate limit', 'server error', 'timeout']
        }
      },
      successRates: {
        network: 0.85,
        filesystem: 0.92,
        api: 0.78
      }
    };
  }

  private isRetryableError(error: Error, config: RetryConfig): boolean {
    const message = error.message.toLowerCase();

    // Check against configured retryable error patterns
    return config.retryableErrors.some(pattern =>
      message.includes(pattern.toLowerCase())
    );
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay: number;

    switch (config.strategy) {
      case RetryStrategy.IMMEDIATE:
        delay = 0;
        break;

      case RetryStrategy.LINEAR_BACKOFF:
        delay = config.baseDelay * attempt;
        break;

      case RetryStrategy.EXPONENTIAL_BACKOFF:
        delay = config.baseDelay * Math.pow(2, attempt - 1);
        break;

      case RetryStrategy.FIBONACCI_BACKOFF:
        delay = this.fibonacci(attempt) * config.baseDelay;
        break;

      default:
        delay = config.baseDelay;
    }

    // Apply maximum delay limit
    delay = Math.min(delay, config.maxDelay);

    // Add jitter if enabled
    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5); // ±50% jitter
    }

    return Math.floor(delay);
  }

  private fibonacci(n: number): number {
    if (n <= 1) return 1;
    let prev = 1, curr = 1;
    for (let i = 2; i < n; i++) {
      const next = prev + curr;
      prev = curr;
      curr = next;
    }
    return curr;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}</content>
<parameter name="filePath">d:\kolosal-cli-1\packages\core\src\services\retryService.ts