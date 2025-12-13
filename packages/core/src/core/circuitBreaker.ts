/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Circuit Breaker States
 */
export enum CircuitState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Blocking all requests
  HALF_OPEN = 'half_open', // Testing if service recovered
}

/**
 * Options for circuit breaker configuration
 */
export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting to close circuit */
  resetTimeout: number;
  /** Time window in ms for counting failures */
  windowMs: number;
  /** Optional threshold for success rate (0-1) */
  successRateThreshold?: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeout: 30000, // 30 seconds
  windowMs: 60000, // 1 minute
  successRateThreshold: 0.5,
};

/**
 * Circuit Breaker for protecting against persistent API failures.
 * Prevents cascading failures by temporarily blocking requests.
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number[] = [];
  private successes: number[] = [];
  private lastFailure: number = 0;
  private lastStateChange: number = Date.now();
  private options: CircuitBreakerOptions;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.checkStateTransition();
    return this.state;
  }

  /**
   * Check if requests are allowed
   */
  isAllowed(): boolean {
    const state = this.getState();
    return state === CircuitState.CLOSED || state === CircuitState.HALF_OPEN;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isAllowed()) {
      throw new CircuitOpenError(
        'Circuit breaker is open. Service temporarily unavailable.',
        this.getTimeUntilReset(),
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    const now = Date.now();
    this.successes.push(now);
    this.cleanupOldRecords();

    if (this.state === CircuitState.HALF_OPEN) {
      // If half-open and we got success, close the circuit
      this.transitionTo(CircuitState.CLOSED);
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailure = now;
    this.cleanupOldRecords();

    if (this.state === CircuitState.HALF_OPEN) {
      // If half-open and we got failure, open again
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    if (this.shouldOpen()) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Check if circuit should open based on failure rate
   */
  private shouldOpen(): boolean {
    const recentFailures = this.failures.length;

    if (recentFailures >= this.options.failureThreshold) {
      return true;
    }

    // Check success rate if threshold is set
    if (this.options.successRateThreshold !== undefined) {
      const total = recentFailures + this.successes.length;
      if (total >= this.options.failureThreshold) {
        const successRate = this.successes.length / total;
        return successRate < this.options.successRateThreshold;
      }
    }

    return false;
  }

  /**
   * Check and perform state transitions
   */
  private checkStateTransition(): void {
    if (this.state === CircuitState.OPEN) {
      const timeSinceOpen = Date.now() - this.lastStateChange;
      if (timeSinceOpen >= this.options.resetTimeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.lastStateChange = Date.now();

      if (newState === CircuitState.CLOSED) {
        // Reset counters when closing
        this.failures = [];
        this.successes = [];
      }
    }
  }

  /**
   * Clean up records outside the window
   */
  private cleanupOldRecords(): void {
    const cutoff = Date.now() - this.options.windowMs;
    this.failures = this.failures.filter((t) => t > cutoff);
    this.successes = this.successes.filter((t) => t > cutoff);
  }

  /**
   * Get time until circuit attempts to reset
   */
  getTimeUntilReset(): number {
    if (this.state !== CircuitState.OPEN) {
      return 0;
    }
    const elapsed = Date.now() - this.lastStateChange;
    return Math.max(0, this.options.resetTimeout - elapsed);
  }

  /**
   * Get statistics about the circuit breaker
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    successRate: number;
    timeUntilReset: number;
  } {
    this.cleanupOldRecords();
    const total = this.failures.length + this.successes.length;
    return {
      state: this.getState(),
      failures: this.failures.length,
      successes: this.successes.length,
      successRate: total > 0 ? this.successes.length / total : 1,
      timeUntilReset: this.getTimeUntilReset(),
    };
  }

  /**
   * Get timestamp of last failure
   */
  getLastFailure(): number {
    return this.lastFailure;
  }

  /**
   * Force close the circuit (for manual recovery)
   */
  forceClose(): void {
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Force open the circuit (for manual intervention)
   */
  forceOpen(): void {
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.failures = [];
    this.successes = [];
    this.lastFailure = 0;
    this.state = CircuitState.CLOSED;
    this.lastStateChange = Date.now();
  }
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(
    message: string,
    public readonly timeUntilReset: number,
  ) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Global circuit breakers per endpoint/model
 */
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker for a specific key
 */
export function getCircuitBreaker(
  key: string,
  options?: Partial<CircuitBreakerOptions>,
): CircuitBreaker {
  if (!circuitBreakers.has(key)) {
    circuitBreakers.set(key, new CircuitBreaker(options));
  }
  return circuitBreakers.get(key)!;
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers(): void {
  circuitBreakers.forEach((cb) => cb.reset());
  circuitBreakers.clear();
}
