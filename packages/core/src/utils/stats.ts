/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { getGlobalMetrics } from '../core/performanceMetrics.js';
import { getGlobalCache } from '../core/cache.js';

/**
 * CLI Stats Command
 * Displays performance metrics and optimization statistics.
 */
export interface StatsOptions {
  /** Show detailed breakdown */
  detailed?: boolean;
  /** Output format */
  format?: 'text' | 'json';
  /** Reset metrics after display */
  reset?: boolean;
}

/**
 * Format duration to human readable
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Get performance stats as text
 */
export function getStatsText(options: StatsOptions = {}): string {
  const metrics = getGlobalMetrics();
  const summary = metrics.getSummary();
  const efficiency = metrics.getEfficiencyScore();
  const cache = getGlobalCache();
  const cacheStats = cache.getStats();

  const lines: string[] = [
    '',
    '╔═══════════════════════════════════════════════════════╗',
    '║            🚀 Kolosal AI Performance Stats            ║',
    '╠═══════════════════════════════════════════════════════╣',
    '',
    '📊 API Metrics',
    `   Total API Calls:     ${summary.totalApiCalls}`,
    `   Cache Hits:          ${summary.cacheHits} (${(summary.cacheHitRate * 100).toFixed(1)}%)`,
    `   Cache Misses:        ${summary.cacheMisses}`,
    `   Deduped Requests:    ${summary.dedupedRequests}`,
    '',
    '⏱️  Performance',
    `   Avg Response Time:   ${formatDuration(summary.averageResponseTime)}`,
    `   Total Time:          ${formatDuration(summary.totalResponseTime)}`,
    `   Tokens Used:         ${summary.totalTokensUsed.toLocaleString()}`,
    '',
    '🔧 Reliability',
    `   Errors:              ${summary.errors}`,
    `   Retries:             ${summary.retries}`,
    '',
    '💾 Cache',
    `   Size:                ${cacheStats.size} / ${cacheStats.maxSize} entries`,
    `   Enabled:             ${cacheStats.enabled ? '✅' : '❌'}`,
    '',
    `📈 Efficiency Score:    ${efficiency}%`,
    '',
    '╚═══════════════════════════════════════════════════════╝',
    '',
  ];

  if (options.detailed) {
    const recent = metrics.getRecentMetrics(10);
    if (recent.length > 0) {
      lines.push('📜 Recent Requests:');
      for (const req of recent) {
        const cached = req.cached ? '💾' : '🌐';
        const deduped = req.deduped ? '🔄' : '';
        lines.push(
          `   ${cached}${deduped} ${req.model} - ${formatDuration(req.responseTime)}`,
        );
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Get performance stats as JSON
 */
export function getStatsJson(): string {
  const metrics = getGlobalMetrics();
  const summary = metrics.getSummary();
  const cache = getGlobalCache();
  const cacheStats = cache.getStats();

  return JSON.stringify(
    {
      metrics: summary,
      efficiency: metrics.getEfficiencyScore(),
      cache: cacheStats,
      timestamp: Date.now(),
    },
    null,
    2,
  );
}

/**
 * Print stats to console
 */
export function printStats(options: StatsOptions = {}): void {
  if (options.format === 'json') {
    console.log(getStatsJson());
  } else {
    console.log(getStatsText(options));
  }

  if (options.reset) {
    getGlobalMetrics().reset();
    console.log('✅ Metrics reset.');
  }
}

/**
 * Get stats summary for inline display
 */
export function getStatsInline(): string {
  const metrics = getGlobalMetrics();
  const summary = metrics.getSummary();

  return `API: ${summary.totalApiCalls} | Cache: ${(summary.cacheHitRate * 100).toFixed(0)}% | Eff: ${metrics.getEfficiencyScore()}%`;
}
