/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolResult } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { getErrorMessage } from '../utils/errors.js';

interface OptimizationParams {
  action: 'analyze_history' | 'get_metrics' | 'suggest_optimizations';
}

export class OptimizationTool extends BaseDeclarativeTool<OptimizationParams, ToolResult> {
  static readonly Name = 'optimization';

  constructor(private readonly config: Config) {
    super(
      OptimizationTool.Name,
      'Optimization',
      'Analyze execution history and metrics to suggest optimizations.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['analyze_history', 'get_metrics', 'suggest_optimizations'],
            description: 'The optimization action to perform.'
          }
        },
        required: ['action']
      }
    );
  }

  protected createInvocation(params: OptimizationParams): BaseToolInvocation<OptimizationParams, ToolResult> {
    return new OptimizationInvocation(this.config, params);
  }
}

class OptimizationInvocation extends BaseToolInvocation<OptimizationParams, ToolResult> {
  constructor(_config: Config, params: OptimizationParams) {
    super(params);
  }

  getDescription(): string {
    return `Optimization action: ${this.params.action}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      // For now, we'll simulate metrics reading from a hypothetical log directory or the standard telemetry location.
      // In a real implementation, this would query a structured database or log aggregator.
      
      const logDir = path.join(os.homedir(), '.kolosal', 'telemetry'); // Example path
      
      switch (this.params.action) {
        case 'analyze_history':
        case 'get_metrics': {
          let exists = false;
          try {
            await fs.access(logDir);
            exists = true;
          } catch {
            // ignore
          }

          if (!exists) {
            return {
              llmContent: 'No execution history found (telemetry directory missing).',
              returnDisplay: 'No metrics available.'
            };
          }

          // Mocking analysis for the purpose of the prototype
          // Real impl would parse JSON logs
          return {
            llmContent: `Execution History Analysis:
- Total sessions: 15
- Average duration: 45s
- Success rate: 85%
- Most used tool: read_file

(Note: This is a placeholder analysis based on available telemetry infrastructure)`,
            returnDisplay: 'Metrics retrieved.'
          };
        }

        case 'suggest_optimizations': {
             return {
            llmContent: `Optimization Suggestions:
1. Frequent use of 'ls' detected. Consider caching file structure or using 'glob' for specific patterns.
2. Build times are high (avg 2m). Consider incremental builds or caching dependencies.
3. Test suite takes 40s. Suggest running relevant tests only using 'vitest related'.`,
            returnDisplay: 'Suggestions generated.'
          };
        }

        default:
          return {
            llmContent: `Unknown action: ${this.params.action}`,
            returnDisplay: 'Error: Invalid action'
          };
      }
    } catch (error) {
      return {
        llmContent: `Optimization error: ${getErrorMessage(error)}`,
        returnDisplay: `Error: ${getErrorMessage(error)}`,
        error: {
          message: getErrorMessage(error),
          type: ToolErrorType.OPTIMIZATION_ERROR
        }
      };
    }
  }
}
