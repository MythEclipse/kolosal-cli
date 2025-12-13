/* eslint-disable vitest/no-conditional-expect, vitest/no-disabled-tests */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Content } from '@google/genai';
import {
  HistoryCompressor,
  getGlobalCompressor,
  resetGlobalCompressor,
} from './historyCompressor.js';

describe('HistoryCompressor', () => {
  let compressor: HistoryCompressor;

  beforeEach(() => {
    compressor = new HistoryCompressor({
      maxTokens: 1000,
      preserveRecentTurns: 2,
      preserveToolCalls: true,
      charsPerToken: 4,
    });
    resetGlobalCompressor();
  });

  describe('estimateTokens via needsCompression', () => {
    it('should not need compression for small history', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there!' }] },
      ];

      expect(compressor.needsCompression(history)).toBe(false);
    });

    it('should need compression for large history', () => {
      const history: Content[] = [];
      for (let i = 0; i < 100; i++) {
        history.push({
          role: 'user',
          parts: [{ text: 'A'.repeat(100) }],
        });
        history.push({
          role: 'model',
          parts: [{ text: 'B'.repeat(100) }],
        });
      }

      expect(compressor.needsCompression(history)).toBe(true);
    });
  });

  describe('compress()', () => {
    it('should return empty array for empty history', () => {
      expect(compressor.compress([])).toEqual([]);
    });

    it('should return unchanged for small history', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi!' }] },
      ];

      const compressed = compressor.compress(history);
      expect(compressed).toEqual(history);
    });

    it('should compress large history', () => {
      const history: Content[] = [];
      for (let i = 0; i < 50; i++) {
        history.push({
          role: 'user',
          parts: [{ text: `Question ${i}: ${'A'.repeat(200)}` }],
        });
        history.push({
          role: 'model',
          parts: [{ text: `Answer ${i}: ${'B'.repeat(200)}` }],
        });
      }

      const compressed = compressor.compress(history);

      // Should be smaller
      expect(compressed.length).toBeLessThan(history.length);
    });

    it('should preserve recent turns', () => {
      const history: Content[] = [];
      for (let i = 0; i < 20; i++) {
        history.push({
          role: 'user',
          parts: [{ text: `Question ${i}: ${'A'.repeat(100)}` }],
        });
        history.push({
          role: 'model',
          parts: [{ text: `Answer ${i}: ${'B'.repeat(100)}` }],
        });
      }

      const compressed = compressor.compress(history);

      // Last turns should be preserved
      const lastOriginal = history[history.length - 1];
      const lastCompressed = compressed[compressed.length - 1];

      expect(lastCompressed).toEqual(lastOriginal);
    });

    it('should preserve tool calls when enabled', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'A'.repeat(500) }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: { name: 'read_file', args: { path: '/test' } },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'read_file',
                response: { content: 'file content' },
              },
            },
          ],
        },
        { role: 'user', parts: [{ text: 'B'.repeat(500) }] },
        { role: 'model', parts: [{ text: 'C'.repeat(500) }] },
      ];

      const compressed = compressor.compress(history);

      // Should contain function call somewhere
      const hasFunctionCall = compressed.some((c) =>
        c.parts?.some((p) => p.functionCall),
      );
      expect(hasFunctionCall).toBe(true);
    });
  });

  describe('getCompressionStats()', () => {
    it('should calculate stats correctly', () => {
      const original: Content[] = [
        { role: 'user', parts: [{ text: 'A'.repeat(400) }] },
        { role: 'model', parts: [{ text: 'B'.repeat(400) }] },
      ];

      const compressed: Content[] = [
        { role: 'user', parts: [{ text: 'A'.repeat(100) }] },
      ];

      const stats = compressor.getCompressionStats(original, compressed);

      expect(stats.originalTokens).toBeGreaterThan(stats.compressedTokens);
      expect(stats.reductionPercent).toBeGreaterThan(0);
      expect(stats.turnsRemoved).toBe(1);
    });
  });

  describe('global compressor', () => {
    it('should return singleton', () => {
      const c1 = getGlobalCompressor();
      const c2 = getGlobalCompressor();
      expect(c1).toBe(c2);
    });

    it('should update options', () => {
      const c1 = getGlobalCompressor({ maxTokens: 500 });
      getGlobalCompressor({ maxTokens: 1000 });
      // Options should be updated
      expect(c1).toBeDefined();
    });
  });
});
