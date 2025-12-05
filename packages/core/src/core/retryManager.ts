// packages/core/src/core/retryManager.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { RetryService, type RetryConfig, type RetryResult } from '../services/retryService.js';
import type { ContextState } from '../subagents/subagent.js';

export interface RetryPolicy {
  name: string;
  config: RetryConfig;
  conditions: {
    retryableErrors: string[];
    retryableStatusCodes?: number[];
    customCondition?: (error: Error) => boolean;
  };
}

export interface RetryManagerOptions {
  defaultPolicy: string;
  policies: Record<string, RetryPolicy>;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
}

export class RetryManager {
  private readonly retryService: RetryService;
  private readonly circuitBreakerState: Map<string, {
    failures: number;
    lastFailureTime: number;
    state: 'closed' | 'open' | 'half-open';
  }> = new Map();

  private readonly defaultOptions: RetryManagerOptions = {
    defaultPolicy: 'default',
    policies: {
      default: {
        name: 'default',
        config: {
          maxAttempts: 3,
          strategy: 'exponential_backoff',
          baseDelay: 1000,
          maxDelay: 10000,
          jitter: true,
          retryableErrors: ['network', 'timeout', 'temporary']
        },
        conditions: {
          retryableErrors: ['network', 'timeout', 'temporary', 'connection']
        }
      },
      network: {
        name: 'network',
        config: {
          maxAttempts: 5,
          strategy: 'exponential_backoff',
          baseDelay: 2000,
          maxDelay: 30000,
          jitter: true,
          retryableErrors: ['network', 'timeout', 'connection', 'dns']
        },
        conditions: {
          retryableErrors: ['network', 'timeout', 'connection', 'dns', 'econnrefused']
        }
      },
      filesystem: {
        name: 'filesystem',
        config: {
          maxAttempts: 3,
          strategy: 'linear_backoff',
          baseDelay: 500,
          maxDelay: 5000,
          jitter: false,
          retryableErrors: ['busy', 'locked', 'permission']
        },
        conditions: {
          retryableErrors: ['busy', 'locked', 'permission', 'eaccess']
        }
      },
      api: {
        name: 'api',
        config: {
          maxAttempts: 3,
          strategy: 'exponential_backoff',
          baseDelay: 1000,
          maxDelay: 10000,
          jitter: true,
          retryableErrors: ['rate limit', 'server error', 'timeout']
        },
        conditions: {
          retryableErrors: ['rate limit', 'server error', 'timeout'],
          retryableStatusCodes: [408, 429, 500, 502, 503, 504]
        }
      }
    },
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 60000 // 1 minute
  };

  constructor(
    options: Partial<RetryManagerOptions> = {}
  ) {
    this.retryService = new RetryService();
    this.options = { ...this.defaultOptions, ...options };
  }

  private options: RetryManagerOptions;

  /**
   * Executes an operation with intelligent retry management
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    policyName?: string,
    _context?: ContextState
  ): Promise<RetryResult<T>> {
    const policy = this.getPolicy(policyName || this.options.defaultPolicy);

    // Check circuit breaker
    if (this.options.enableCircuitBreaker && this.isCircuitBreakerOpen(policy.name)) {
      throw new Error(`Circuit breaker is open for policy: ${policy.name}`);
    }

    try {
      const result = await this.retryService.executeWithCustomRetry(
        operation,
        (error, attempt) => this.shouldRetry(error, policy, attempt),
        policy.config
      );

      // Reset circuit breaker on success
      if (result.success) {
        this.resetCircuitBreaker(policy.name);
      }

      return result;
    } catch (error) {
      // Record failure for circuit breaker
      this.recordFailure(policy.name);
      throw error;
    }
  }

  /**
   * Registers a custom retry policy
   */
  registerPolicy(policy: RetryPolicy): void {
    this.options.policies[policy.name] = policy;
  }

  /**
   * Updates retry manager options
   */
  updateOptions(options: Partial<RetryManagerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Gets retry statistics and circuit breaker status
   */
  getRetryStats(): {
    policies: Record<string, {
      totalAttempts: number;
      successRate: number;
      circuitBreakerState: string;
    }>;
    overallStats: {
      totalRetries: number;
      averageSuccessRate: number;
    };
  } {
    const policyStats: Record<string, { totalAttempts: number; successRate: number; circuitBreakerState: string }> = {};
    let totalRetries = 0;
    let totalSuccessRate = 0;
    let policyCount = 0;

    for (const [name, _policy] of Object.entries(this.options.policies)) {
      const circuitState = this.circuitBreakerState.get(name);
      policyStats[name] = {
        totalAttempts: 0, // Would be populated with actual metrics
        successRate: 0.85, // Placeholder
        circuitBreakerState: circuitState?.state || 'closed'
      };
      totalRetries += policyStats[name].totalAttempts;
      totalSuccessRate += policyStats[name].successRate;
      policyCount++;
    }

    return {
      policies: policyStats,
      overallStats: {
        totalRetries,
        averageSuccessRate: policyCount > 0 ? totalSuccessRate / policyCount : 0
      }
    };
  }

  /**
   * Manually resets a circuit breaker
   */
  resetCircuitBreaker(policyName: string): void {
    this.circuitBreakerState.delete(policyName);
    console.log(`Circuit breaker reset for policy: ${policyName}`);
  }

  /**
   * Gets circuit breaker status for a policy
   */
  getCircuitBreakerStatus(policyName: string): {
    state: string;
    failures: number;
    lastFailureTime: number;
    timeUntilRetry: number;
  } {
    const state = this.circuitBreakerState.get(policyName);
    if (!state) {
      return {
        state: 'closed',
        failures: 0,
        lastFailureTime: 0,
        timeUntilRetry: 0
      };
    }

    const now = Date.now();
    let timeUntilRetry = 0;

    if (state.state === 'open') {
      timeUntilRetry = Math.max(0, this.options.circuitBreakerTimeout - (now - state.lastFailureTime));
      if (timeUntilRetry === 0) {
        state.state = 'half-open';
      }
    }

    return {
      state: state.state,
      failures: state.failures,
      lastFailureTime: state.lastFailureTime,
      timeUntilRetry
    };
  }

  private getPolicy(name: string): RetryPolicy {
    const policy = this.options.policies[name];
    if (!policy) {
      throw new Error(`Retry policy not found: ${name}`);
    }
    return policy;
  }

  private shouldRetry(error: Error, policy: RetryPolicy, attempt: number): boolean {
    // Check if we've exceeded max attempts
    if (attempt >= policy.config.maxAttempts) {
      return false;
    }

    // Check error message patterns
    const message = error.message.toLowerCase();
    const matchesErrorPattern = policy.conditions.retryableErrors.some(pattern =>
      message.includes(pattern.toLowerCase())
    );

    if (matchesErrorPattern) {
      return true;
    }

    // Check HTTP status codes if available
    if (policy.conditions.retryableStatusCodes && 'status' in error) {
      const statusCode = (error as { status?: number }).status;
      if (statusCode !== undefined && policy.conditions.retryableStatusCodes.includes(statusCode)) {
        return true;
      }
    }

    // Check custom condition
    if (policy.conditions.customCondition) {
      return policy.conditions.customCondition(error);
    }

    return false;
  }

  private isCircuitBreakerOpen(policyName: string): boolean {
    const state = this.circuitBreakerState.get(policyName);
    if (!state) return false;

    if (state.state === 'open') {
      const now = Date.now();
      if (now - state.lastFailureTime >= this.options.circuitBreakerTimeout) {
        state.state = 'half-open';
        return false;
      }
      return true;
    }

    return false;
  }

  private recordFailure(policyName: string): void {
    const state = this.circuitBreakerState.get(policyName) || {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed' as const
    };

    state.failures++;
    state.lastFailureTime = Date.now();

    if (state.failures >= this.options.circuitBreakerThreshold) {
      state.state = 'open';
      console.warn(`Circuit breaker opened for policy: ${policyName} (${state.failures} failures)`);
    }

    this.circuitBreakerState.set(policyName, state);
  }
}
