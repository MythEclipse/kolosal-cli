/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ModelFallbackManager,
  getGlobalFallbackManager,
  resetGlobalFallbackManager,
} from './modelFallback.js';

describe('ModelFallbackManager', () => {
  let manager: ModelFallbackManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ModelFallbackManager({
      maxFailures: 3,
      recoveryTimeout: 10000,
      autoRecover: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetGlobalFallbackManager();
  });

  describe('model management', () => {
    it('should add models with priority', () => {
      manager.addModel({ model: 'gpt-4', priority: 1 });
      manager.addModel({ model: 'gpt-3.5', priority: 2 });

      expect(manager.getCurrentModel()).toBe('gpt-4');
    });

    it('should select highest priority (lowest number)', () => {
      manager.addModel({ model: 'gpt-3.5', priority: 2 });
      manager.addModel({ model: 'gpt-4', priority: 1 });
      manager.addModel({ model: 'claude', priority: 3 });

      expect(manager.getCurrentModel()).toBe('gpt-4');
    });

    it('should remove models', () => {
      manager.addModel({ model: 'gpt-4', priority: 1 });
      manager.addModel({ model: 'gpt-3.5', priority: 2 });

      manager.removeModel('gpt-4');
      expect(manager.getCurrentModel()).toBe('gpt-3.5');
    });
  });

  describe('failure tracking', () => {
    it('should mark model unhealthy after max failures', () => {
      manager.addModel({ model: 'gpt-4', priority: 1 });
      manager.addModel({ model: 'gpt-3.5', priority: 2 });

      manager.recordFailure('gpt-4');
      manager.recordFailure('gpt-4');
      manager.recordFailure('gpt-4');

      expect(manager.getCurrentModel()).toBe('gpt-3.5');
    });

    it('should reset failure count on success', () => {
      manager.addModel({ model: 'gpt-4', priority: 1 });

      manager.recordFailure('gpt-4');
      manager.recordFailure('gpt-4');
      manager.recordSuccess('gpt-4');

      const status = manager.getModelStatuses()[0];
      expect(status.failureCount).toBe(0);
    });
  });

  describe('auto recovery', () => {
    it('should recover unhealthy model after timeout', () => {
      manager.addModel({ model: 'gpt-4', priority: 1 });
      manager.addModel({ model: 'gpt-3.5', priority: 2 });

      // Make gpt-4 unhealthy
      manager.recordFailure('gpt-4');
      manager.recordFailure('gpt-4');
      manager.recordFailure('gpt-4');
      expect(manager.getCurrentModel()).toBe('gpt-3.5');

      // Wait for recovery
      vi.advanceTimersByTime(10001);
      expect(manager.getCurrentModel()).toBe('gpt-4');
    });
  });

  describe('executeWithFallback()', () => {
    it('should execute with first healthy model', async () => {
      manager.addModel({ model: 'gpt-4', priority: 1 });

      const fn = vi.fn().mockResolvedValue('success');
      const result = await manager.executeWithFallback(fn);

      expect(result).toEqual({ result: 'success', model: 'gpt-4' });
      expect(fn).toHaveBeenCalledWith('gpt-4');
    });

    it('should fallback to next model on failure', async () => {
      manager.addModel({ model: 'gpt-4', priority: 1 });
      manager.addModel({ model: 'gpt-3.5', priority: 2 });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Server error'))
        .mockResolvedValue('success');

      const result = await manager.executeWithFallback(fn);

      expect(result).toEqual({ result: 'success', model: 'gpt-3.5' });
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw when all models fail', async () => {
      manager.addModel({ model: 'gpt-4', priority: 1 });
      manager.addModel({ model: 'gpt-3.5', priority: 2 });

      const fn = vi.fn().mockRejectedValue(new Error('Failed'));

      await expect(manager.executeWithFallback(fn)).rejects.toThrow('Failed');
    });

    it('should not fallback on client errors except 429', async () => {
      manager.addModel({ model: 'gpt-4', priority: 1 });
      manager.addModel({ model: 'gpt-3.5', priority: 2 });

      const error = new Error('Bad request');
      (error as unknown as { status: number }).status = 400;

      const fn = vi.fn().mockRejectedValue(error);

      await expect(manager.executeWithFallback(fn)).rejects.toThrow(
        'Bad request',
      );
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('getModelStatuses()', () => {
    it('should return all model statuses', () => {
      manager.addModel({ model: 'gpt-4', name: 'GPT-4', priority: 1 });
      manager.addModel({ model: 'gpt-3.5', name: 'GPT-3.5', priority: 2 });
      manager.recordFailure('gpt-4');

      const statuses = manager.getModelStatuses();

      expect(statuses).toHaveLength(2);
      expect(statuses[0]).toMatchObject({
        model: 'gpt-4',
        name: 'GPT-4',
        healthy: true,
        failureCount: 1,
        isCurrent: true,
      });
    });
  });

  describe('force controls', () => {
    it('should force model healthy', () => {
      manager.addModel({ model: 'gpt-4', priority: 1 });
      manager.recordFailure('gpt-4');
      manager.recordFailure('gpt-4');
      manager.recordFailure('gpt-4');

      expect(manager.getHealthyCount()).toBe(0);
      manager.forceHealthy('gpt-4');
      expect(manager.getHealthyCount()).toBe(1);
    });

    it('should force model unhealthy', () => {
      manager.addModel({ model: 'gpt-4', priority: 1 });
      manager.forceUnhealthy('gpt-4');
      expect(manager.getHealthyCount()).toBe(0);
    });
  });

  describe('global manager', () => {
    it('should return singleton instance', () => {
      const m1 = getGlobalFallbackManager();
      const m2 = getGlobalFallbackManager();
      expect(m1).toBe(m2);
    });
  });
});
