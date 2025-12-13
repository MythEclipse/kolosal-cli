/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseCache, getGlobalCache, resetGlobalCache } from './cache.js';

describe('ResponseCache', () => {
  let cache: ResponseCache<string>;

  beforeEach(() => {
    cache = new ResponseCache<string>({
      ttl: 1000, // 1 second for testing
      maxSize: 3,
      enabled: true,
    });
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should handle object keys by hashing', () => {
      const params = { model: 'gpt-4', prompt: 'test' };
      cache.set(params, 'response1');
      expect(cache.get(params)).toBe('response1');
    });

    it('should match identical object keys', () => {
      const params1 = { model: 'gpt-4', prompt: 'test' };
      const params2 = { model: 'gpt-4', prompt: 'test' };

      cache.set(params1, 'response1');
      expect(cache.get(params2)).toBe('response1');
    });

    it('should not match different object keys', () => {
      const params1 = { model: 'gpt-4', prompt: 'test1' };
      const params2 = { model: 'gpt-4', prompt: 'test2' };

      cache.set(params1, 'response1');
      expect(cache.get(params2)).toBeNull();
    });
  });

  describe('TTL (time to live)', () => {
    it('should expire entries after TTL', async () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(cache.get('key1')).toBeNull();
    });

    it('should support custom TTL per entry', async () => {
      cache.set('short', 'value1', 500); // 500ms TTL
      cache.set('long', 'value2', 2000); // 2s TTL

      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(cache.get('short')).toBeNull();
      expect(cache.get('long')).toBe('value2');
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when full', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Cache is now full (maxSize = 3)
      expect(cache.size()).toBe(3);

      // Adding new entry should evict key1 (oldest)
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
      expect(cache.size()).toBe(3);
    });

    it('should update access order on get', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to make it recently used
      cache.get('key1');

      // Add new entry, should evict key2 (now oldest)
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('cache management', () => {
    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(cache.size()).toBe(2);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeNull();
    });

    it('should cleanup expired entries', async () => {
      cache.set('key1', 'value1', 500);
      cache.set('key2', 'value2', 2000);

      await new Promise((resolve) => setTimeout(resolve, 600));

      cache.cleanup();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.size()).toBe(1);
    });

    it('should report accurate stats', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(3);
      expect(stats.enabled).toBe(true);
    });
  });

  describe('cache options', () => {
    it('should not cache when disabled', () => {
      const disabledCache = new ResponseCache<string>({ enabled: false });

      disabledCache.set('key1', 'value1');
      expect(disabledCache.get('key1')).toBeNull();
      expect(disabledCache.size()).toBe(0);
    });

    it('should update options dynamically', () => {
      cache.set('key1', 'value1');

      cache.setOptions({ enabled: false });

      expect(cache.get('key1')).toBeNull();
      expect(cache.size()).toBe(0);
    });

    it('should evict excess entries when maxSize is reduced', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      expect(cache.size()).toBe(3);

      cache.setOptions({ maxSize: 2 });

      expect(cache.size()).toBe(2);
      expect(cache.get('key1')).toBeNull(); // Oldest evicted
    });
  });

  describe('has() method', () => {
    it('should return true for existing non-expired keys', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return false for expired keys', async () => {
      cache.set('key1', 'value1', 500);
      expect(cache.has('key1')).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('global cache', () => {
    beforeEach(() => {
      resetGlobalCache();
    });

    it('should create singleton instance', () => {
      const cache1 = getGlobalCache();
      const cache2 = getGlobalCache();

      expect(cache1).toBe(cache2);
    });

    it('should share state between accesses', () => {
      const cache1 = getGlobalCache({ enabled: true });
      cache1.set('key1', 'value1');

      const cache2 = getGlobalCache();
      expect(cache2.get('key1')).toBe('value1');
    });

    it('should reset properly', () => {
      const cache1 = getGlobalCache();
      cache1.set('key1', 'value1');

      resetGlobalCache();

      const cache2 = getGlobalCache();
      expect(cache2.get('key1')).toBeNull();
    });
  });
});
