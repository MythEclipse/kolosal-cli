/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import { ResponseCache, getGlobalCache } from './cache.js';
import {
  RequestDeduplicator,
  getGlobalDeduplicator,
} from './requestDeduplicator.js';
import type { Config } from '../config/config.js';

/**
 * A decorator that wraps a ContentGenerator to add response caching.
 * This reduces redundant API calls for identical requests.
 */
export class CachingContentGenerator implements ContentGenerator {
  private cache: ResponseCache<GenerateContentResponse>;
  private deduplicator: RequestDeduplicator;

  constructor(
    private readonly wrapped: ContentGenerator,
    private readonly config: Config,
    cacheOptions?: {
      ttl?: number;
      maxSize?: number;
      enabled?: boolean;
      enableDeduplication?: boolean;
    },
  ) {
    // Use global cache or create a new one with custom options
    if (cacheOptions) {
      this.cache = new ResponseCache<GenerateContentResponse>(cacheOptions);
    } else {
      // Get global cache and cast to correct type
      this.cache = getGlobalCache() as ResponseCache<GenerateContentResponse>;
    }

    // Initialize request deduplicator
    const dedupEnabled = cacheOptions?.enableDeduplication !== false;
    this.deduplicator = dedupEnabled
      ? getGlobalDeduplicator()
      : new RequestDeduplicator();

    // Setup periodic cleanup
    if (cacheOptions?.enabled !== false) {
      this.startCleanupInterval();
    }
  }

  private cleanupInterval?: NodeJS.Timeout;

  private startCleanupInterval(): void {
    // Cleanup every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cache.cleanup();
    }, 30000);

    // Ensure cleanup doesn't prevent process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop the cleanup interval (useful for testing or shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Generate a cache key from request parameters
   */
  private getCacheKey(req: GenerateContentParameters): Record<string, unknown> {
    // Create a normalized cache key from request parameters
    return {
      model: req.model,
      contents: req.contents,
      // Include relevant config options that affect the response
      temperature: req.config?.temperature,
      topK: req.config?.topK,
      topP: req.config?.topP,
      maxTokens: req.config?.maxOutputTokens,
      // Exclude non-deterministic options like responseLogprobs
    };
  }

  async generateContent(
    req: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const cacheKey = this.getCacheKey(req);

    // Try to get from cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      // Cache hit - return cached response
      if (this.config.getDebugMode()) {
        console.error('[Cache] Hit for request:', req.model);
      }
      return cached;
    }

    // Cache miss - check if identical request is in-flight
    if (this.deduplicator.isInFlight(req)) {
      if (this.config.getDebugMode()) {
        console.error('[Dedup] Coalescing in-flight request for:', req.model);
      }
    } else if (this.config.getDebugMode()) {
      console.error('[Cache] Miss for request:', req.model);
    }

    // Use deduplicator to prevent duplicate in-flight requests
    const response = await this.deduplicator.deduplicate(req, () =>
      this.wrapped.generateContent(req, userPromptId),
    );

    // Only cache successful responses (not errors)
    if (response.candidates && response.candidates.length > 0) {
      this.cache.set(cacheKey, response);
    }

    return response;
  }

  async generateContentStream(
    req: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // Note: Streaming responses are generally not cached because:
    // 1. They are consumed incrementally
    // 2. Caching would require buffering the entire stream
    // 3. Use cases for streaming usually want real-time updates
    //
    // If caching streaming is needed in the future, we could:
    // - Buffer the stream and cache the complete result
    // - Replay the buffered stream from cache

    return this.wrapped.generateContentStream(req, userPromptId);
  }

  async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
    // Token counting is fast and cheap, no need to cache
    return this.wrapped.countTokens(req);
  }

  async embedContent(
    req: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    // Embeddings could benefit from caching, but keeping it simple for Phase 1
    return this.wrapped.embedContent(req);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; enabled: boolean } {
    return this.cache.getStats();
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get the wrapped content generator
   */
  getWrapped(): ContentGenerator {
    return this.wrapped;
  }
}

/**
 * Wrap a content generator with caching if enabled in config
 */
export function withCaching(
  generator: ContentGenerator,
  config: Config,
): ContentGenerator {
  // Check if caching is enabled via environment variable or config
  const cacheEnabled = process.env['KOLOSAL_ENABLE_CACHE'] !== 'false';

  if (!cacheEnabled) {
    return generator;
  }

  const ttl = process.env['KOLOSAL_CACHE_TTL_MS']
    ? parseInt(process.env['KOLOSAL_CACHE_TTL_MS'], 10)
    : undefined;

  const maxSize = process.env['KOLOSAL_CACHE_MAX_SIZE']
    ? parseInt(process.env['KOLOSAL_CACHE_MAX_SIZE'], 10)
    : undefined;

  return new CachingContentGenerator(generator, config, {
    enabled: cacheEnabled,
    ttl,
    maxSize,
  });
}
