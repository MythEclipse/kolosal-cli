/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Token bucket rate limiter for API rate limit protection.
 * Prevents excessive API calls that could trigger rate limits.
 */

export interface RateLimiterOptions {
  /** Maximum tokens in the bucket */
  maxTokens: number;
  /** Tokens added per second */
  refillRate: number;
  /** Initial tokens (defaults to maxTokens) */
  initialTokens?: number;
}

const DEFAULT_OPTIONS: RateLimiterOptions = {
  maxTokens: 60, // 60 requests
  refillRate: 1, // 1 per second = 60 per minute
};

/**
 * Token bucket rate limiter implementation.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private options: Required<RateLimiterOptions>;

  constructor(options?: Partial<RateLimiterOptions>) {
    this.options = {
      ...DEFAULT_OPTIONS,
      initialTokens: options?.maxTokens ?? DEFAULT_OPTIONS.maxTokens,
      ...options,
    };
    this.tokens = this.options.initialTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // in seconds
    const tokensToAdd = elapsed * this.options.refillRate;

    this.tokens = Math.min(this.options.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Check if a request is allowed (consumes 1 token)
   */
  tryAcquire(tokens = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Wait until tokens are available, then acquire
   */
  async acquire(tokens = 1): Promise<void> {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return;
    }

    // Calculate wait time
    const needed = tokens - this.tokens;
    const waitMs = (needed / this.options.refillRate) * 1000;

    await new Promise((resolve) => setTimeout(resolve, waitMs));

    // Refill and acquire
    this.refill();
    this.tokens -= tokens;
  }

  /**
   * Get time until next token is available
   */
  getWaitTime(tokens = 1): number {
    this.refill();

    if (this.tokens >= tokens) {
      return 0;
    }

    const needed = tokens - this.tokens;
    return (needed / this.options.refillRate) * 1000;
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Get rate limiter statistics
   */
  getStats(): {
    availableTokens: number;
    maxTokens: number;
    refillRate: number;
    utilizationPercent: number;
  } {
    this.refill();
    return {
      availableTokens: Math.floor(this.tokens),
      maxTokens: this.options.maxTokens,
      refillRate: this.options.refillRate,
      utilizationPercent:
        ((this.options.maxTokens - this.tokens) / this.options.maxTokens) * 100,
    };
  }

  /**
   * Reset the rate limiter to full capacity
   */
  reset(): void {
    this.tokens = this.options.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Update options dynamically
   */
  setOptions(options: Partial<RateLimiterOptions>): void {
    this.options = { ...this.options, ...options };
    this.tokens = Math.min(this.tokens, this.options.maxTokens);
  }
}

/**
 * Execute a function with rate limiting
 */
export async function withRateLimit<T>(
  limiter: RateLimiter,
  fn: () => Promise<T>,
  tokens = 1,
): Promise<T> {
  await limiter.acquire(tokens);
  return fn();
}

/**
 * Global rate limiters per key
 */
const rateLimiters = new Map<string, RateLimiter>();

/**
 * Get or create a rate limiter for a specific key
 */
export function getRateLimiter(
  key: string,
  options?: Partial<RateLimiterOptions>,
): RateLimiter {
  if (!rateLimiters.has(key)) {
    rateLimiters.set(key, new RateLimiter(options));
  }
  return rateLimiters.get(key)!;
}

/**
 * Reset all rate limiters
 */
export function resetAllRateLimiters(): void {
  rateLimiters.forEach((rl) => rl.reset());
  rateLimiters.clear();
}
