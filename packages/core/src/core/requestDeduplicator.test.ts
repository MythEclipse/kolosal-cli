/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RequestDeduplicator,
  getGlobalDeduplicator,
  resetGlobalDeduplicator,
} from './requestDeduplicator.js';
import type { GenerateContentParameters } from '@google/genai';

describe('RequestDeduplicator', () => {
  let deduplicator: RequestDeduplicator;

  beforeEach(() => {
    deduplicator = new RequestDeduplicator();
  });

  describe('deduplicate()', () => {
    it('should execute request normally when no duplicates', async () => {
      const request: GenerateContentParameters = {
        model: 'gpt-4',
        contents: [{ role: 'user', parts: [{ text: 'test' }] }],
      };

      const executor = vi.fn().mockResolvedValue({ response: 'ok' });

      const result = await deduplicator.deduplicate(request, executor);

      expect(result).toEqual({ response: 'ok' });
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should coalesce identical in-flight requests', async () => {
      const request: GenerateContentParameters = {
        model: 'gpt-4',
        contents: [{ role: 'user', parts: [{ text: 'test' }] }],
      };

      let resolveExecutor: (value: unknown) => void;
      const executorPromise = new Promise((resolve) => {
        resolveExecutor = resolve;
      });

      const executor = vi.fn().mockReturnValue(executorPromise);

      // Start two identical requests concurrently
      const promise1 = deduplicator.deduplicate(request, executor);
      const promise2 = deduplicator.deduplicate(request, executor);

      // Should only call executor once
      expect(executor).toHaveBeenCalledTimes(1);
      expect(deduplicator.isInFlight(request)).toBe(true);

      // Resolve the executor
      resolveExecutor!({ response: 'shared' });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should receive the same result
      expect(result1).toEqual({ response: 'shared' });
      expect(result2).toEqual({ response: 'shared' });
      expect(deduplicator.isInFlight(request)).toBe(false);
    });

    it('should not coalesce different requests', async () => {
      const request1: GenerateContentParameters = {
        model: 'gpt-4',
        contents: [{ role: 'user', parts: [{ text: 'test1' }] }],
      };

      const request2: GenerateContentParameters = {
        model: 'gpt-4',
        contents: [{ role: 'user', parts: [{ text: 'test2' }] }],
      };

      const executor1 = vi.fn().mockResolvedValue({ response: 'result1' });
      const executor2 = vi.fn().mockResolvedValue({ response: 'result2' });

      const [result1, result2] = await Promise.all([
        deduplicator.deduplicate(request1, executor1),
        deduplicator.deduplicate(request2, executor2),
      ]);

      expect(result1).toEqual({ response: 'result1' });
      expect(result2).toEqual({ response: 'result2' });
      expect(executor1).toHaveBeenCalledTimes(1);
      expect(executor2).toHaveBeenCalledTimes(1);
    });

    it('should allow sequential identical requests', async () => {
      const request: GenerateContentParameters = {
        model: 'gpt-4',
        contents: [{ role: 'user', parts: [{ text: 'test' }] }],
      };

      const executor = vi
        .fn()
        .mockResolvedValueOnce({ response: 'first' })
        .mockResolvedValueOnce({ response: 'second' });

      const result1 = await deduplicator.deduplicate(request, executor);
      const result2 = await deduplicator.deduplicate(request, executor);

      expect(result1).toEqual({ response: 'first' });
      expect(result2).toEqual({ response: 'second' });
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it('should handle errors properly', async () => {
      const request: GenerateContentParameters = {
        model: 'gpt-4',
        contents: [{ role: 'user', parts: [{ text: 'test' }] }],
      };

      const executor = vi.fn().mockRejectedValue(new Error('Request failed'));

      await expect(deduplicator.deduplicate(request, executor)).rejects.toThrow(
        'Request failed',
      );

      // Should clean up in-flight request after error
      expect(deduplicator.isInFlight(request)).toBe(false);
    });

    it('should handle concurrent errors properly', async () => {
      const request: GenerateContentParameters = {
        model: 'gpt-4',
        contents: [{ role: 'user', parts: [{ text: 'test' }] }],
      };

      const executor = vi.fn().mockRejectedValue(new Error('Request failed'));

      const promise1 = deduplicator.deduplicate(request, executor);
      const promise2 = deduplicator.deduplicate(request, executor);

      await expect(promise1).rejects.toThrow('Request failed');
      await expect(promise2).rejects.toThrow('Request failed');

      expect(executor).toHaveBeenCalledTimes(1);
      expect(deduplicator.isInFlight(request)).toBe(false);
    });
  });

  describe('isInFlight()', () => {
    it('should return true for in-flight requests', async () => {
      const request: GenerateContentParameters = {
        model: 'gpt-4',
        contents: [{ role: 'user', parts: [{ text: 'test' }] }],
      };

      let resolveExecutor: (value: unknown) => void;
      const executorPromise = new Promise((resolve) => {
        resolveExecutor = resolve;
      });

      const executor = vi.fn().mockReturnValue(executorPromise);

      const promise = deduplicator.deduplicate(request, executor);

      expect(deduplicator.isInFlight(request)).toBe(true);

      resolveExecutor!({ response: 'ok' });
      await promise;

      expect(deduplicator.isInFlight(request)).toBe(false);
    });

    it('should return false for completed requests', async () => {
      const request: GenerateContentParameters = {
        model: 'gpt-4',
        contents: [{ role: 'user', parts: [{ text: 'test' }] }],
      };

      expect(deduplicator.isInFlight(request)).toBe(false);
    });
  });

  describe('getInFlightCount()', () => {
    it('should return correct count of in-flight requests', async () => {
      const request1: GenerateContentParameters = {
        model: 'gpt-4',
        contents: [{ role: 'user', parts: [{ text: 'test1' }] }],
      };

      const request2: GenerateContentParameters = {
        model: 'gpt-4',
        contents: [{ role: 'user', parts: [{ text: 'test2' }] }],
      };

      expect(deduplicator.getInFlightCount()).toBe(0);

      const resolvers: ((value: unknown) => void)[] = [];
      const makeExecutor = () => {
        return new Promise((resolve) => {
          resolvers.push(resolve);
        });
      };

      const promise1 = deduplicator.deduplicate(request1, makeExecutor);
      expect(deduplicator.getInFlightCount()).toBe(1);

      const promise2 = deduplicator.deduplicate(request2, makeExecutor);
      expect(deduplicator.getInFlightCount()).toBe(2);

      resolvers[0]({ ok: true });
      await promise1;
      expect(deduplicator.getInFlightCount()).toBe(1);

      resolvers[1]({ ok: true });
      await promise2;
      expect(deduplicator.getInFlightCount()).toBe(0);
    });
  });

  describe('clear()', () => {
    it('should clear all in-flight requests', () => {
      // This is mainly for testing/cleanup
      deduplicator.clear();
      expect(deduplicator.getInFlightCount()).toBe(0);
    });
  });

  describe('global deduplicator', () => {
    beforeEach(() => {
      resetGlobalDeduplicator();
    });

    it('should return singleton instance', () => {
      const dedup1 = getGlobalDeduplicator();
      const dedup2 = getGlobalDeduplicator();

      expect(dedup1).toBe(dedup2);
    });

    it('should share state', async () => {
      const dedup1 = getGlobalDeduplicator();

      const request: GenerateContentParameters = {
        model: 'gpt-4',
        contents: [{ role: 'user', parts: [{ text: 'test' }] }],
      };

      let resolveExecutor: (value: unknown) => void;
      const executorPromise = new Promise((resolve) => {
        resolveExecutor = resolve;
      });

      const executor = vi.fn().mockReturnValue(executorPromise);
      const promise = dedup1.deduplicate(request, executor);

      const dedup2 = getGlobalDeduplicator();
      expect(dedup2.isInFlight(request)).toBe(true);

      resolveExecutor!({ response: 'ok' });
      await promise;
    });

    it('should reset properly', () => {
      const dedup1 = getGlobalDeduplicator();
      resetGlobalDeduplicator();
      const dedup2 = getGlobalDeduplicator();

      expect(dedup2).not.toBe(dedup1);
    });
  });
});
