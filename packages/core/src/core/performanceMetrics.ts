/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Performance metrics tracking for Kolosal AI agent.
 * Tracks API calls, cache hits, token usage, and response times.
 */

export interface MetricsSummary {
  totalApiCalls: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  dedupedRequests: number;
  totalTokensUsed: number;
  averageResponseTime: number;
  totalResponseTime: number;
  errors: number;
  retries: number;
}

export interface RequestMetric {
  timestamp: number;
  model: string;
  requestType: 'generate' | 'stream' | 'countTokens' | 'embed';
  cached: boolean;
  deduped: boolean;
  responseTime: number;
  tokenCount?: number;
  error?: string;
  retried?: boolean;
}

/**
 * Performance metrics collector for tracking agent efficiency.
 */
export class PerformanceMetrics {
  private metrics: RequestMetric[] = [];
  private maxMetricHistory = 1000;
  private enabled = true;

  constructor(options?: { maxHistory?: number; enabled?: boolean }) {
    if (options?.maxHistory !== undefined) {
      this.maxMetricHistory = options.maxHistory;
    }
    if (options?.enabled !== undefined) {
      this.enabled = options.enabled;
    }
  }

  /**
   * Record a new metric entry
   */
  record(metric: Omit<RequestMetric, 'timestamp'>): void {
    if (!this.enabled) return;

    const entry: RequestMetric = {
      ...metric,
      timestamp: Date.now(),
    };

    this.metrics.push(entry);

    // Trim history if needed
    if (this.metrics.length > this.maxMetricHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricHistory);
    }
  }

  /**
   * Get summary of all metrics
   */
  getSummary(): MetricsSummary {
    const generateCalls = this.metrics.filter(
      (m) => m.requestType === 'generate' || m.requestType === 'stream',
    );

    const cacheHits = generateCalls.filter((m) => m.cached).length;
    const cacheMisses = generateCalls.filter(
      (m) => !m.cached && !m.deduped,
    ).length;
    const dedupedRequests = generateCalls.filter((m) => m.deduped).length;
    const totalApiCalls = cacheMisses;

    const totalTokens = this.metrics.reduce(
      (sum, m) => sum + (m.tokenCount || 0),
      0,
    );

    const responseTimes = this.metrics.map((m) => m.responseTime);
    const totalTime = responseTimes.reduce((sum, t) => sum + t, 0);
    const avgTime =
      responseTimes.length > 0 ? totalTime / responseTimes.length : 0;

    const errors = this.metrics.filter((m) => m.error).length;
    const retries = this.metrics.filter((m) => m.retried).length;

    return {
      totalApiCalls,
      cacheHits,
      cacheMisses,
      cacheHitRate:
        cacheHits + cacheMisses > 0 ? cacheHits / (cacheHits + cacheMisses) : 0,
      dedupedRequests,
      totalTokensUsed: totalTokens,
      averageResponseTime: avgTime,
      totalResponseTime: totalTime,
      errors,
      retries,
    };
  }

  /**
   * Get metrics for a specific time window
   */
  getMetricsSince(timestampMs: number): RequestMetric[] {
    return this.metrics.filter((m) => m.timestamp >= timestampMs);
  }

  /**
   * Get last N metrics
   */
  getRecentMetrics(count: number): RequestMetric[] {
    return this.metrics.slice(-count);
  }

  /**
   * Get efficiency score (0-100)
   * Higher score = better efficiency
   */
  getEfficiencyScore(): number {
    const summary = this.getSummary();

    // Components of efficiency:
    // - Cache hit rate (40% weight)
    // - Dedup rate (20% weight)
    // - Low error rate (20% weight)
    // - Low retry rate (20% weight)

    const totalRequests =
      summary.cacheHits + summary.cacheMisses + summary.dedupedRequests;
    if (totalRequests === 0) return 100; // No requests = perfect efficiency

    const cacheScore = summary.cacheHitRate * 40;
    const dedupRate =
      totalRequests > 0 ? summary.dedupedRequests / totalRequests : 0;
    const dedupScore = dedupRate * 20;

    const errorRate = totalRequests > 0 ? summary.errors / totalRequests : 0;
    const errorScore = (1 - Math.min(errorRate, 1)) * 20;

    const retryRate = totalRequests > 0 ? summary.retries / totalRequests : 0;
    const retryScore = (1 - Math.min(retryRate, 1)) * 20;

    return Math.round(cacheScore + dedupScore + errorScore + retryScore);
  }

  /**
   * Format summary for display
   */
  formatSummary(): string {
    const summary = this.getSummary();
    const efficiency = this.getEfficiencyScore();

    return `
📊 Performance Metrics
━━━━━━━━━━━━━━━━━━━━━━
API Calls:     ${summary.totalApiCalls}
Cache Hits:    ${summary.cacheHits} (${(summary.cacheHitRate * 100).toFixed(1)}%)
Deduped:       ${summary.dedupedRequests}
Tokens Used:   ${summary.totalTokensUsed.toLocaleString()}
Avg Response:  ${summary.averageResponseTime.toFixed(0)}ms
Errors:        ${summary.errors}
Efficiency:    ${efficiency}%
    `.trim();
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = [];
  }

  /**
   * Enable/disable metrics collection
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if metrics collection is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Global metrics instance
 */
let globalMetrics: PerformanceMetrics | null = null;

/**
 * Get or create global metrics instance
 */
export function getGlobalMetrics(options?: {
  maxHistory?: number;
  enabled?: boolean;
}): PerformanceMetrics {
  if (!globalMetrics) {
    globalMetrics = new PerformanceMetrics(options);
  }
  return globalMetrics;
}

/**
 * Reset global metrics
 */
export function resetGlobalMetrics(): void {
  globalMetrics = null;
}
