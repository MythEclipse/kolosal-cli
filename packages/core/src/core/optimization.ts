/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Kolosal AI Core Optimization Utilities
 *
 * This module exports all optimization and protection utilities
 * for the Kolosal AI coding agent.
 */

// Caching utilities
export {
  ResponseCache,
  getGlobalCache,
  resetGlobalCache,
  type CacheOptions,
} from './cache.js';

export {
  CachingContentGenerator,
  withCaching,
} from './cachingContentGenerator.js';

// Request deduplication
export {
  RequestDeduplicator,
  getGlobalDeduplicator,
  resetGlobalDeduplicator,
} from './requestDeduplicator.js';

// Performance monitoring
export {
  PerformanceMetrics,
  getGlobalMetrics,
  resetGlobalMetrics,
  type MetricsSummary,
  type RequestMetric,
} from './performanceMetrics.js';

// History compression
export {
  HistoryCompressor,
  getGlobalCompressor,
  resetGlobalCompressor,
  type CompressionOptions,
} from './historyCompressor.js';

// Error recovery
export {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  getCircuitBreaker,
  resetAllCircuitBreakers,
  type CircuitBreakerOptions,
} from './circuitBreaker.js';

// Rate limiting
export {
  RateLimiter,
  withRateLimit,
  getRateLimiter,
  resetAllRateLimiters,
  type RateLimiterOptions,
} from './rateLimiter.js';

// Model fallback
export {
  ModelFallbackManager,
  getGlobalFallbackManager,
  resetGlobalFallbackManager,
  type ModelConfig,
  type FallbackOptions,
} from './modelFallback.js';

// Session management
export {
  SessionManager,
  getGlobalSessionManager,
  resetGlobalSessionManager,
  type SessionData,
  type SessionStorageOptions,
} from './sessionManager.js';
