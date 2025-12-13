/* eslint-disable vitest/no-conditional-expect, vitest/no-disabled-tests */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PerformanceMetrics,
  getGlobalMetrics,
  resetGlobalMetrics,
} from './performanceMetrics.js';

describe('PerformanceMetrics', () => {
  let metrics: PerformanceMetrics;

  beforeEach(() => {
    metrics = new PerformanceMetrics({ maxHistory: 100 });
  });

  afterEach(() => {
    resetGlobalMetrics();
  });

  describe('record()', () => {
    it('should record a metric entry', () => {
      metrics.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: false,
        deduped: false,
        responseTime: 100,
      });

      const recent = metrics.getRecentMetrics(1);
      expect(recent).toHaveLength(1);
      expect(recent[0].model).toBe('gpt-4');
    });

    it('should trim history when exceeding max', () => {
      const smallMetrics = new PerformanceMetrics({ maxHistory: 5 });

      for (let i = 0; i < 10; i++) {
        smallMetrics.record({
          model: 'gpt-4',
          requestType: 'generate',
          cached: false,
          deduped: false,
          responseTime: i * 10,
        });
      }

      expect(smallMetrics.getRecentMetrics(100)).toHaveLength(5);
    });

    it('should not record when disabled', () => {
      const disabled = new PerformanceMetrics({ enabled: false });

      disabled.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: false,
        deduped: false,
        responseTime: 100,
      });

      expect(disabled.getRecentMetrics(100)).toHaveLength(0);
    });
  });

  describe('getSummary()', () => {
    it('should calculate correct summary', () => {
      // 2 cache hits
      metrics.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: true,
        deduped: false,
        responseTime: 10,
      });
      metrics.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: true,
        deduped: false,
        responseTime: 20,
      });

      // 2 cache misses (actual API calls)
      metrics.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: false,
        deduped: false,
        responseTime: 100,
      });
      metrics.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: false,
        deduped: false,
        responseTime: 200,
      });

      // 1 deduped
      metrics.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: false,
        deduped: true,
        responseTime: 50,
      });

      const summary = metrics.getSummary();

      expect(summary.cacheHits).toBe(2);
      expect(summary.cacheMisses).toBe(2);
      expect(summary.dedupedRequests).toBe(1);
      expect(summary.cacheHitRate).toBe(0.5); // 2 hits / 4 (hits + misses)
    });

    it('should handle empty metrics', () => {
      const summary = metrics.getSummary();

      expect(summary.totalApiCalls).toBe(0);
      expect(summary.cacheHitRate).toBe(0);
    });

    it('should track errors', () => {
      metrics.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: false,
        deduped: false,
        responseTime: 100,
        error: 'Failed',
      });
      metrics.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: false,
        deduped: false,
        responseTime: 100,
      });

      const summary = metrics.getSummary();
      expect(summary.errors).toBe(1);
    });

    it('should track retries', () => {
      metrics.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: false,
        deduped: false,
        responseTime: 100,
        retried: true,
      });
      metrics.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: false,
        deduped: false,
        responseTime: 100,
      });

      const summary = metrics.getSummary();
      expect(summary.retries).toBe(1);
    });
  });

  describe('getEfficiencyScore()', () => {
    it('should return 100 for no requests', () => {
      expect(metrics.getEfficiencyScore()).toBe(100);
    });

    it('should return high score for good cache rate', () => {
      // All cache hits
      for (let i = 0; i < 10; i++) {
        metrics.record({
          model: 'gpt-4',
          requestType: 'generate',
          cached: true,
          deduped: false,
          responseTime: 10,
        });
      }

      expect(metrics.getEfficiencyScore()).toBeGreaterThan(50);
    });

    it('should return lower score for errors', () => {
      for (let i = 0; i < 10; i++) {
        metrics.record({
          model: 'gpt-4',
          requestType: 'generate',
          cached: false,
          deduped: false,
          responseTime: 100,
          error: 'Failed',
        });
      }

      expect(metrics.getEfficiencyScore()).toBeLessThan(50);
    });
  });

  describe('getMetricsSince()', () => {
    it('should filter by timestamp', () => {
      const now = Date.now();

      metrics.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: false,
        deduped: false,
        responseTime: 100,
      });

      const future = now + 10000;
      const filtered = metrics.getMetricsSince(future);

      expect(filtered).toHaveLength(0);
    });
  });

  describe('formatSummary()', () => {
    it('should return formatted string', () => {
      metrics.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: true,
        deduped: false,
        responseTime: 100,
      });

      const formatted = metrics.formatSummary();

      expect(formatted).toContain('Performance Metrics');
      expect(formatted).toContain('Cache Hits');
    });
  });

  describe('reset()', () => {
    it('should clear all metrics', () => {
      metrics.record({
        model: 'gpt-4',
        requestType: 'generate',
        cached: false,
        deduped: false,
        responseTime: 100,
      });
      metrics.reset();

      expect(metrics.getRecentMetrics(100)).toHaveLength(0);
    });
  });

  describe('global metrics', () => {
    it('should return singleton', () => {
      const m1 = getGlobalMetrics();
      const m2 = getGlobalMetrics();
      expect(m1).toBe(m2);
    });

    it('should reset properly', () => {
      const m1 = getGlobalMetrics();
      resetGlobalMetrics();
      const m2 = getGlobalMetrics();
      expect(m1).not.toBe(m2);
    });
  });
});
