/* eslint-disable vitest/no-conditional-expect, vitest/no-disabled-tests */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  RateLimiter,
  withRateLimit,
  getRateLimiter,
  resetAllRateLimiters,
} from './rateLimiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter({
      maxTokens: 10,
      refillRate: 1, // 1 token per second
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAllRateLimiters();
  });

  describe('tryAcquire()', () => {
    it('should allow requests when tokens available', () => {
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.getAvailableTokens()).toBe(9);
    });

    it('should deny requests when no tokens', () => {
      // Use up all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should allow multiple token acquisition', () => {
      expect(limiter.tryAcquire(5)).toBe(true);
      expect(limiter.getAvailableTokens()).toBe(5);
    });
  });

  describe('token refill', () => {
    it('should refill tokens over time', () => {
      // Use 5 tokens
      limiter.tryAcquire(5);
      expect(limiter.getAvailableTokens()).toBe(5);

      // Wait 3 seconds
      vi.advanceTimersByTime(3000);
      expect(limiter.getAvailableTokens()).toBe(8);
    });

    it('should not exceed max tokens', () => {
      // Wait a long time
      vi.advanceTimersByTime(60000);
      expect(limiter.getAvailableTokens()).toBe(10);
    });
  });

  describe('acquire()', () => {
    it('should acquire immediately when tokens available', async () => {
      const start = Date.now();
      await limiter.acquire();
      expect(Date.now() - start).toBe(0);
    });

    it('should wait when no tokens available', async () => {
      // Use all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      const acquirePromise = limiter.acquire();

      // Advance time to refill 1 token
      vi.advanceTimersByTime(1000);

      await acquirePromise;
      expect(limiter.getAvailableTokens()).toBe(0);
    });
  });

  describe('getWaitTime()', () => {
    it('should return 0 when tokens available', () => {
      expect(limiter.getWaitTime()).toBe(0);
    });

    it('should return correct wait time when no tokens', () => {
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }
      expect(limiter.getWaitTime()).toBe(1000); // 1 second for 1 token
      expect(limiter.getWaitTime(5)).toBe(5000); // 5 seconds for 5 tokens
    });
  });

  describe('getStats()', () => {
    it('should return accurate statistics', () => {
      limiter.tryAcquire(3);
      const stats = limiter.getStats();

      expect(stats.availableTokens).toBe(7);
      expect(stats.maxTokens).toBe(10);
      expect(stats.refillRate).toBe(1);
      expect(stats.utilizationPercent).toBe(30);
    });
  });

  describe('reset()', () => {
    it('should reset to full capacity', () => {
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }
      expect(limiter.getAvailableTokens()).toBe(0);

      limiter.reset();
      expect(limiter.getAvailableTokens()).toBe(10);
    });
  });

  describe('withRateLimit()', () => {
    it('should execute function with rate limiting', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRateLimit(limiter, fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should wait for tokens before executing', async () => {
      // Use all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      const fn = vi.fn().mockResolvedValue('success');
      const promise = withRateLimit(limiter, fn);

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      await promise;

      expect(fn).toHaveBeenCalled();
    });
  });

  describe('global rate limiters', () => {
    it('should create and retrieve rate limiters by key', () => {
      const rl1 = getRateLimiter('api-openai');
      const rl2 = getRateLimiter('api-openai');
      expect(rl1).toBe(rl2);
    });

    it('should create separate limiters for different keys', () => {
      const rl1 = getRateLimiter('api-openai');
      const rl2 = getRateLimiter('api-anthropic');
      expect(rl1).not.toBe(rl2);
    });
  });
});
