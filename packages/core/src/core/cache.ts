/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';

/**
 * Options for configuring the response cache
 */
export interface CacheOptions {
  /** Time to live in milliseconds for cached entries */
  ttl: number;
  /** Maximum number of cache entries */
  maxSize: number;
  /** Whether caching is enabled */
  enabled: boolean;
}

/**
 * Cached response entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

/**
 * LRU (Least Recently Used) cache implementation for API responses
 *
 * This cache helps reduce redundant API calls by storing responses
 * and serving them for identical requests within the TTL period.
 */
export class ResponseCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];
  private options: CacheOptions;

  constructor(options: Partial<CacheOptions> = {}) {
    this.options = {
      ttl: options.ttl ?? 5 * 60 * 1000, // 5 minutes default
      maxSize: options.maxSize ?? 100,
      enabled: options.enabled ?? true,
    };
  }

  /**
   * Generate a hash key from request parameters
   */
  private hashKey(params: Record<string, unknown>): string {
    const normalized = JSON.stringify(params, Object.keys(params).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Get a cached response if available and not expired
   */
  get(key: string | Record<string, unknown>): T | null {
    if (!this.options.enabled) {
      return null;
    }

    const cacheKey = typeof key === 'string' ? key : this.hashKey(key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(cacheKey);
      this.removeFromAccessOrder(cacheKey);
      return null;
    }

    // Update access order (move to end = most recently used)
    this.updateAccessOrder(cacheKey);

    return entry.value;
  }

  /**
   * Store a response in the cache
   */
  set(key: string | Record<string, unknown>, value: T, ttl?: number): void {
    if (!this.options.enabled) {
      return;
    }

    const cacheKey = typeof key === 'string' ? key : this.hashKey(key);
    const effectiveTtl = ttl ?? this.options.ttl;

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.options.maxSize && !this.cache.has(cacheKey)) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: effectiveTtl,
    };

    this.cache.set(cacheKey, entry);
    this.updateAccessOrder(cacheKey);
  }

  /**
   * Check if a key exists in cache and is not expired
   */
  has(key: string | Record<string, unknown>): boolean {
    return this.get(key) !== null;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache hit statistics
   */
  getStats(): { size: number; maxSize: number; enabled: boolean } {
    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      enabled: this.options.enabled,
    };
  }

  /**
   * Remove expired entries from cache
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
    }
  }

  /**
   * Evict the least recently used entry
   */
  private evictOldest(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    const oldestKey = this.accessOrder[0];
    this.cache.delete(oldestKey);
    this.accessOrder.shift();
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order array
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Update cache options
   */
  setOptions(options: Partial<CacheOptions>): void {
    this.options = { ...this.options, ...options };

    // If cache is disabled, clear it
    if (!this.options.enabled) {
      this.clear();
    }

    // If maxSize was reduced, evict excess entries
    while (this.cache.size > this.options.maxSize) {
      this.evictOldest();
    }
  }
}

/**
 * Global response cache instance (singleton pattern)
 */
let globalCache: ResponseCache | null = null;

/**
 * Get or create the global cache instance
 */
export function getGlobalCache(options?: Partial<CacheOptions>): ResponseCache {
  if (!globalCache) {
    globalCache = new ResponseCache(options);
  } else if (options) {
    globalCache.setOptions(options);
  }
  return globalCache;
}

/**
 * Reset the global cache (useful for testing)
 */
export function resetGlobalCache(): void {
  globalCache = null;
}
