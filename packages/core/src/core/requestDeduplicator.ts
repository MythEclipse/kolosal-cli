/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';

/**
 * Request deduplication for in-flight API requests.
 * Prevents multiple identical requests from being sent simultaneously.
 */
export class RequestDeduplicator {
  private inFlightRequests = new Map<
    string,
    Promise<GenerateContentResponse>
  >();

  /**
   * Generate a stable hash for request parameters
   */
  private hashRequest(params: GenerateContentParameters): string {
    // Create normalized key from request
    const normalized = {
      model: params.model,
      contents: JSON.stringify(params.contents),
      config: JSON.stringify(params.config || {}),
    };
    return JSON.stringify(normalized);
  }

  /**
   * Execute a request with deduplication.
   * If an identical request is in-flight, return the same promise.
   * Otherwise, execute the request and cache the promise.
   */
  async deduplicate<T>(
    params: GenerateContentParameters,
    executor: () => Promise<T>,
  ): Promise<T> {
    const key = this.hashRequest(params);

    // Check if identical request is already in flight
    const existing = this.inFlightRequests.get(key);
    if (existing) {
      // Return existing promise (will share result)
      return existing as Promise<T>;
    }

    // Create new promise for this request
    const promise = executor();

    // Store in in-flight map
    this.inFlightRequests.set(key, promise as Promise<GenerateContentResponse>);

    try {
      const result = await promise;
      return result;
    } finally {
      // Remove from in-flight map after completion
      this.inFlightRequests.delete(key);
    }
  }

  /**
   * Check if a request is currently in-flight
   */
  isInFlight(params: GenerateContentParameters): boolean {
    const key = this.hashRequest(params);
    return this.inFlightRequests.has(key);
  }

  /**
   * Get count of in-flight requests
   */
  getInFlightCount(): number {
    return this.inFlightRequests.size;
  }

  /**
   * Clear all in-flight requests (useful for testing)
   */
  clear(): void {
    this.inFlightRequests.clear();
  }
}

/**
 * Global request deduplicator instance
 */
let globalDeduplicator: RequestDeduplicator | null = null;

/**
 * Get or create the global deduplicator instance
 */
export function getGlobalDeduplicator(): RequestDeduplicator {
  if (!globalDeduplicator) {
    globalDeduplicator = new RequestDeduplicator();
  }
  return globalDeduplicator;
}

/**
 * Reset the global deduplicator (useful for testing)
 */
export function resetGlobalDeduplicator(): void {
  globalDeduplicator = null;
}
