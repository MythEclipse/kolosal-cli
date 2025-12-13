/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Model Fallback System
 *
 * Automatically switches to backup models when primary model fails.
 * Supports configurable fallback chains and health tracking.
 */

export interface ModelConfig {
  /** Model identifier */
  model: string;
  /** Display name for logging */
  name?: string;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether this model is currently healthy */
  healthy?: boolean;
  /** Number of consecutive failures */
  failureCount?: number;
  /** Last failure timestamp */
  lastFailure?: number;
  /** Custom model options */
  options?: Record<string, unknown>;
}

export interface FallbackOptions {
  /** Maximum failures before marking model unhealthy */
  maxFailures: number;
  /** Time in ms before retrying unhealthy model */
  recoveryTimeout: number;
  /** Whether to automatically recover unhealthy models */
  autoRecover: boolean;
}

const DEFAULT_OPTIONS: FallbackOptions = {
  maxFailures: 3,
  recoveryTimeout: 60000, // 1 minute
  autoRecover: true,
};

/**
 * Model Fallback Manager
 * Manages a chain of models with automatic failover.
 */
export class ModelFallbackManager {
  private models: Map<string, ModelConfig> = new Map();
  private options: FallbackOptions;
  private currentModel: string | null = null;

  constructor(options?: Partial<FallbackOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Add a model to the fallback chain
   */
  addModel(config: ModelConfig): void {
    this.models.set(config.model, {
      ...config,
      healthy: true,
      failureCount: 0,
    });

    // Update current model if this is higher priority
    this.updateCurrentModel();
  }

  /**
   * Remove a model from the chain
   */
  removeModel(model: string): void {
    this.models.delete(model);
    if (this.currentModel === model) {
      this.updateCurrentModel();
    }
  }

  /**
   * Get the current best available model
   */
  getCurrentModel(): string | null {
    this.checkRecovery();
    return this.currentModel;
  }

  /**
   * Get model config
   */
  getModelConfig(model: string): ModelConfig | undefined {
    return this.models.get(model);
  }

  /**
   * Record a successful request
   */
  recordSuccess(model: string): void {
    const config = this.models.get(model);
    if (config) {
      config.failureCount = 0;
      config.healthy = true;
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(model: string): void {
    const config = this.models.get(model);
    if (!config) return;

    config.failureCount = (config.failureCount || 0) + 1;
    config.lastFailure = Date.now();

    if (config.failureCount >= this.options.maxFailures) {
      config.healthy = false;
      this.updateCurrentModel();
    }
  }

  /**
   * Check if any unhealthy models should be recovered
   */
  private checkRecovery(): void {
    if (!this.options.autoRecover) return;

    const now = Date.now();
    for (const config of this.models.values()) {
      if (
        !config.healthy &&
        config.lastFailure &&
        now - config.lastFailure >= this.options.recoveryTimeout
      ) {
        // Reset for retry
        config.healthy = true;
        config.failureCount = 0;
      }
    }

    this.updateCurrentModel();
  }

  /**
   * Update current model to best available
   */
  private updateCurrentModel(): void {
    const healthyModels = Array.from(this.models.values())
      .filter((m) => m.healthy)
      .sort((a, b) => a.priority - b.priority);

    this.currentModel =
      healthyModels.length > 0 ? healthyModels[0].model : null;
  }

  /**
   * Execute with automatic fallback
   */
  async executeWithFallback<T>(
    fn: (model: string) => Promise<T>,
  ): Promise<{ result: T; model: string }> {
    const sortedModels = Array.from(this.models.values())
      .filter((m) => m.healthy)
      .sort((a, b) => a.priority - b.priority);

    if (sortedModels.length === 0) {
      throw new Error('No healthy models available');
    }

    let lastError: Error | null = null;

    for (const modelConfig of sortedModels) {
      try {
        const result = await fn(modelConfig.model);
        this.recordSuccess(modelConfig.model);
        return { result, model: modelConfig.model };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.recordFailure(modelConfig.model);

        // Check if we should try next model
        if (!this.shouldFallback(error)) {
          throw error;
        }
      }
    }

    throw lastError || new Error('All models failed');
  }

  /**
   * Determine if we should fallback based on error type
   */
  private shouldFallback(error: unknown): boolean {
    if (!(error instanceof Error)) return true;

    // Don't fallback on client errors (4xx except 429)
    const status = this.getErrorStatus(error);
    if (status && status >= 400 && status < 500 && status !== 429) {
      return false;
    }

    // Fallback on rate limits, server errors, and network errors
    return true;
  }

  /**
   * Extract status from error
   */
  private getErrorStatus(error: Error): number | undefined {
    const anyError = error as { status?: number; statusCode?: number };
    return anyError.status || anyError.statusCode;
  }

  /**
   * Get all model statuses
   */
  getModelStatuses(): Array<{
    model: string;
    name?: string;
    priority: number;
    healthy: boolean;
    failureCount: number;
    isCurrent: boolean;
  }> {
    return Array.from(this.models.values())
      .sort((a, b) => a.priority - b.priority)
      .map((config) => ({
        model: config.model,
        name: config.name,
        priority: config.priority,
        healthy: config.healthy ?? true,
        failureCount: config.failureCount ?? 0,
        isCurrent: config.model === this.currentModel,
      }));
  }

  /**
   * Force mark a model as healthy
   */
  forceHealthy(model: string): void {
    const config = this.models.get(model);
    if (config) {
      config.healthy = true;
      config.failureCount = 0;
      this.updateCurrentModel();
    }
  }

  /**
   * Force mark a model as unhealthy
   */
  forceUnhealthy(model: string): void {
    const config = this.models.get(model);
    if (config) {
      config.healthy = false;
      this.updateCurrentModel();
    }
  }

  /**
   * Reset all models to healthy
   */
  reset(): void {
    for (const config of this.models.values()) {
      config.healthy = true;
      config.failureCount = 0;
      config.lastFailure = undefined;
    }
    this.updateCurrentModel();
  }

  /**
   * Get count of healthy models
   */
  getHealthyCount(): number {
    return Array.from(this.models.values()).filter((m) => m.healthy).length;
  }
}

/**
 * Global fallback manager
 */
let globalFallbackManager: ModelFallbackManager | null = null;

export function getGlobalFallbackManager(
  options?: Partial<FallbackOptions>,
): ModelFallbackManager {
  if (!globalFallbackManager) {
    globalFallbackManager = new ModelFallbackManager(options);
  }
  return globalFallbackManager;
}

export function resetGlobalFallbackManager(): void {
  globalFallbackManager = null;
}
