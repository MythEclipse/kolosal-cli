// packages/core/src/tools/analyze-context.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolResult } from './tools.js';
import type { ContextAnalysisService, ContextAnalysisResult } from '../services/contextAnalysisService.js';

const AnalyzeContextParamsSchema = z.object({
  action: z.enum(['analyze', 'suggest-tools', 'get-patterns', 'get-recommendations']).describe('The analysis action to perform'),
  projectPath: z.string().optional().describe('Path to the project to analyze (defaults to current directory)'),
  includePatterns: z.boolean().optional().describe('Whether to include code pattern analysis'),
  includeRecommendations: z.boolean().optional().describe('Whether to include project recommendations')
});

type AnalyzeContextParams = z.infer<typeof AnalyzeContextParamsSchema>;

export class AnalyzeContextTool extends BaseDeclarativeTool<AnalyzeContextParams, ToolResult> {
  static readonly Name = 'analyze-context';

  constructor(private readonly contextAnalysisService: ContextAnalysisService) {
    super(
      AnalyzeContextTool.Name,
      'AnalyzeContext',
      'Analyzes project context, code patterns, and provides intelligent tool suggestions for automation',
      Kind.Other,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['analyze', 'suggest-tools', 'get-patterns', 'get-recommendations'],
            description: 'The analysis action to perform'
          },
          projectPath: {
            type: 'string',
            description: 'Path to the project to analyze (defaults to current directory)'
          },
          includePatterns: {
            type: 'boolean',
            description: 'Whether to include code pattern analysis'
          },
          includeRecommendations: {
            type: 'boolean',
            description: 'Whether to include project recommendations'
          }
        },
        required: ['action']
      }
    );
  }

  protected createInvocation(params: AnalyzeContextParams): BaseToolInvocation<AnalyzeContextParams, ToolResult> {
    return new AnalyzeContextInvocation(this.contextAnalysisService, params);
  }
}

class AnalyzeContextInvocation extends BaseToolInvocation<AnalyzeContextParams, ToolResult> {
  constructor(
    private readonly contextAnalysisService: ContextAnalysisService,
    params: AnalyzeContextParams
  ) {
    super(params);
  }

  getDescription(): string {
    return `Analyzing context: ${this.params.action}`;
  }

  async execute(): Promise<ToolResult> {
    const { action, projectPath, includePatterns = true, includeRecommendations = true } = this.params;

    switch (action) {
      case 'analyze': {
        const result = await this.analyzeFullContext(projectPath, includePatterns, includeRecommendations);
        return {
          llmContent: JSON.stringify(result, null, 2),
          returnDisplay: `Project analysis completed for ${projectPath || 'current directory'}`
        };
      }

      case 'suggest-tools': {
        const context = await this.contextAnalysisService.analyzeProjectContext(projectPath);
        const suggestions = this.contextAnalysisService.getToolSuggestions(context.projectContext);
        return {
          llmContent: JSON.stringify(suggestions, null, 2),
          returnDisplay: `Tool suggestions generated`
        };
      }

      case 'get-patterns': {
        const patterns = await this.contextAnalysisService.analyzeCodePatterns(projectPath || process.cwd());
        return {
          llmContent: JSON.stringify(patterns, null, 2),
          returnDisplay: `Code patterns analyzed`
        };
      }

      case 'get-recommendations': {
        const analysis = await this.contextAnalysisService.analyzeProjectContext(projectPath);
        return {
          llmContent: JSON.stringify({
            recommendations: analysis.recommendations,
            confidence: analysis.confidence
          }, null, 2),
          returnDisplay: `Recommendations generated`
        };
      }

      default: {
        return {
          llmContent: `Unknown action: ${action}`,
          returnDisplay: 'Error: Invalid action'
        };
      }
    }
  }

  private async analyzeFullContext(
    projectPath?: string,
    includePatterns = true,
    includeRecommendations = true
  ): Promise<ContextAnalysisResult> {
    const result = await this.contextAnalysisService.analyzeProjectContext(projectPath);

    // Filter results based on parameters
    if (!includePatterns) {
      result.codePatterns = [];
    }

    if (!includeRecommendations) {
      result.recommendations = [];
    }

    return result;
  }
}
