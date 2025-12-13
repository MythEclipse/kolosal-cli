/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';

/**
 * Options for history compression
 */
export interface CompressionOptions {
  /** Maximum tokens to keep in compressed history */
  maxTokens: number;
  /** Preserve recent N turns completely */
  preserveRecentTurns: number;
  /** Preserve tool calls (function calls/responses) */
  preserveToolCalls: boolean;
  /** Characters per token estimate for fast estimation */
  charsPerToken: number;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxTokens: 8000,
  preserveRecentTurns: 4,
  preserveToolCalls: true,
  charsPerToken: 4, // Conservative estimate
};

/**
 * Compress conversation history to fit within token limits.
 * Uses a sliding window approach with smart preservation.
 */
export class HistoryCompressor {
  private options: CompressionOptions;

  constructor(options?: Partial<CompressionOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Estimate token count for content
   * Uses character-based estimation for fast processing
   */
  private estimateTokens(content: Content): number {
    if (!content.parts) return 0;

    let chars = 0;
    for (const part of content.parts) {
      if (part.text) {
        chars += part.text.length;
      }
      if (part.functionCall) {
        chars += JSON.stringify(part.functionCall).length;
      }
      if (part.functionResponse) {
        chars += JSON.stringify(part.functionResponse).length;
      }
    }

    return Math.ceil(chars / this.options.charsPerToken);
  }

  /**
   * Check if a content item contains tool calls
   */
  private hasToolCalls(content: Content): boolean {
    if (!content.parts) return false;
    return content.parts.some(
      (part) => part.functionCall || part.functionResponse,
    );
  }

  /**
   * Summarize long text content
   */
  private summarizeText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const half = Math.floor(maxLength / 2) - 10;
    return `${text.slice(0, half)}\n...[truncated]...\n${text.slice(-half)}`;
  }

  /**
   * Compress a single content item
   */
  private compressContent(content: Content, aggressive: boolean): Content {
    if (!content.parts) return content;

    const newParts: Part[] = [];

    for (const part of content.parts) {
      if (part.functionCall || part.functionResponse) {
        // Preserve tool calls if option is set
        if (this.options.preserveToolCalls || !aggressive) {
          newParts.push(part);
        }
      } else if (part.text) {
        // Compress long text content
        const maxChars = aggressive ? 500 : 2000;
        newParts.push({
          ...part,
          text: this.summarizeText(part.text, maxChars),
        });
      } else {
        // Preserve other parts (inline data, etc.)
        newParts.push(part);
      }
    }

    return { ...content, parts: newParts };
  }

  /**
   * Compress conversation history
   */
  compress(history: Content[]): Content[] {
    if (history.length === 0) return [];

    // Estimate current token usage
    let totalTokens = 0;
    const tokenCounts = history.map((c) => {
      const tokens = this.estimateTokens(c);
      totalTokens += tokens;
      return tokens;
    });

    // If under limit, return as-is
    if (totalTokens <= this.options.maxTokens) {
      return history;
    }

    const compressed: Content[] = [];
    const historyLength = history.length;
    const preserveFrom = Math.max(
      0,
      historyLength - this.options.preserveRecentTurns * 2,
    );

    const targetTokens = this.options.maxTokens;

    // First pass: preserve recent turns completely
    const recentTurns = history.slice(preserveFrom);
    let recentTokens = 0;
    for (const content of recentTurns) {
      recentTokens += this.estimateTokens(content);
    }

    // Budget for older content
    const olderBudget = Math.max(0, targetTokens - recentTokens);
    let olderTokensUsed = 0;

    // Process older content with compression
    for (let i = 0; i < preserveFrom; i++) {
      const content = history[i];
      const originalTokens = tokenCounts[i];

      // Check if we've exceeded budget for older content
      if (olderTokensUsed + originalTokens > olderBudget) {
        // Apply aggressive compression
        const aggressive = true;

        // Skip if not tool call and we're over budget
        if (!this.hasToolCalls(content) && !this.options.preserveToolCalls) {
          continue;
        }

        const compressedContent = this.compressContent(content, aggressive);
        const newTokens = this.estimateTokens(compressedContent);

        if (olderTokensUsed + newTokens <= olderBudget) {
          compressed.push(compressedContent);
          olderTokensUsed += newTokens;
        }
      } else {
        // Light compression
        const compressedContent = this.compressContent(content, false);
        compressed.push(compressedContent);
        olderTokensUsed += this.estimateTokens(compressedContent);
      }
    }

    // Add marker if compression happened
    if (compressed.length < preserveFrom && preserveFrom > 0) {
      const compressionMarker: Content = {
        role: 'user',
        parts: [{ text: '[Earlier conversation compressed for context]' }],
      };

      // Insert at beginning if we skipped content
      compressed.unshift(compressionMarker);
    }

    // Add recent turns unchanged
    compressed.push(...recentTurns);

    return compressed;
  }

  /**
   * Quick check if compression is needed
   */
  needsCompression(history: Content[]): boolean {
    let totalTokens = 0;
    for (const content of history) {
      totalTokens += this.estimateTokens(content);
      if (totalTokens > this.options.maxTokens) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get compression statistics
   */
  getCompressionStats(
    original: Content[],
    compressed: Content[],
  ): {
    originalTokens: number;
    compressedTokens: number;
    reductionPercent: number;
    turnsRemoved: number;
  } {
    const originalTokens = original.reduce(
      (sum, c) => sum + this.estimateTokens(c),
      0,
    );
    const compressedTokens = compressed.reduce(
      (sum, c) => sum + this.estimateTokens(c),
      0,
    );

    return {
      originalTokens,
      compressedTokens,
      reductionPercent:
        originalTokens > 0
          ? ((originalTokens - compressedTokens) / originalTokens) * 100
          : 0,
      turnsRemoved: original.length - compressed.length,
    };
  }

  /**
   * Update options
   */
  setOptions(options: Partial<CompressionOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

/**
 * Global history compressor
 */
let globalCompressor: HistoryCompressor | null = null;

export function getGlobalCompressor(
  options?: Partial<CompressionOptions>,
): HistoryCompressor {
  if (!globalCompressor) {
    globalCompressor = new HistoryCompressor(options);
  } else if (options) {
    globalCompressor.setOptions(options);
  }
  return globalCompressor;
}

export function resetGlobalCompressor(): void {
  globalCompressor = null;
}
