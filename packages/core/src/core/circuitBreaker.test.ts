/* eslint-disable vitest/no-conditional-expect, vitest/no-disabled-tests */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  getCircuitBreaker,
  resetAllCircuitBreakers,
} from './circuitBreaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 10000,
      windowMs: 60000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAllCircuitBreakers();
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should allow requests when closed', () => {
      expect(breaker.isAllowed()).toBe(true);
    });
  });

  describe('failure tracking', () => {
    it('should remain closed under threshold', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open after reaching threshold', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should block requests when open', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.isAllowed()).toBe(false);
    });
  });

  describe('recovery', () => {
    it('should transition to HALF_OPEN after reset timeout', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      vi.advanceTimersByTime(10001);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should close on success in HALF_OPEN state', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      vi.advanceTimersByTime(10001);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      breaker.recordSuccess();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reopen on failure in HALF_OPEN state', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      vi.advanceTimersByTime(10001);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      breaker.recordFailure();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('execute()', () => {
    it('should execute function when closed', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should throw CircuitOpenError when open', async () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      const fn = vi.fn();
      await expect(breaker.execute(fn)).rejects.toThrow(CircuitOpenError);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should record success on successful execution', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      await breaker.execute(fn);
      expect(breaker.getStats().successes).toBe(1);
    });

    it('should record failure and rethrow on failed execution', async () => {
      const error = new Error('test error');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(breaker.execute(fn)).rejects.toThrow('test error');
      expect(breaker.getStats().failures).toBe(1);
    });
  });

  describe('getStats()', () => {
    it('should return accurate statistics', () => {
      breaker.recordSuccess();
      breaker.recordSuccess();
      breaker.recordFailure();

      const stats = breaker.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.failures).toBe(1);
      expect(stats.successRate).toBeCloseTo(0.667, 2);
      expect(stats.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('time until reset', () => {
    it('should return 0 when not open', () => {
      expect(breaker.getTimeUntilReset()).toBe(0);
    });

    it('should return correct time when open', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      vi.advanceTimersByTime(3000);
      expect(breaker.getTimeUntilReset()).toBe(7000);
    });
  });

  describe('force controls', () => {
    it('should force close the circuit', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.forceClose();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should force open the circuit', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      breaker.forceOpen();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('global circuit breakers', () => {
    it('should create and retrieve circuit breakers by key', () => {
      const cb1 = getCircuitBreaker('model-gpt4');
      const cb2 = getCircuitBreaker('model-gpt4');
      expect(cb1).toBe(cb2);
    });

    it('should create separate breakers for different keys', () => {
      const cb1 = getCircuitBreaker('model-gpt4');
      const cb2 = getCircuitBreaker('model-claude');
      expect(cb1).not.toBe(cb2);
    });
  });
});
