// packages/core/src/tools/analyze-context.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { BaseDeclarativeTool } from '../types/tools.js';
import type { ContextAnalysisService, ContextAnalysisResult } from '../services/contextAnalysisService.js';
import type { Config } from '../config/config.js';

const AnalyzeContextParamsSchema = z.object({
  action: z.enum(['analyze', 'suggest-tools', 'get-patterns', 'get-recommendations']).describe('The analysis action to perform'),
  projectPath: z.string().optional().describe('Path to the project to analyze (defaults to current directory)'),
  includePatterns: z.boolean().optional().describe('Whether to include code pattern analysis'),
  includeRecommendations: z.boolean().optional().describe('Whether to include project recommendations')
});

type AnalyzeContextParams = z.infer<typeof AnalyzeContextParamsSchema>;

export class AnalyzeContextTool implements BaseDeclarativeTool {
  name = 'analyze-context';
  description = 'Analyzes project context, code patterns, and provides intelligent tool suggestions for automation';
  schema = {
    type: 'function' as const,
    function: {
      name: this.name,
      description: this.description,
      parameters: AnalyzeContextParamsSchema
    }
  };

  constructor(
    private readonly contextAnalysisService: ContextAnalysisService,
    private readonly config: Config
  ) {}

  async execute(params: AnalyzeContextParams): Promise<unknown> {
    const { action, projectPath, includePatterns = true, includeRecommendations = true } = params;

    switch (action) {
      case 'analyze': {
        return await this.analyzeFullContext(projectPath, includePatterns, includeRecommendations);
      }

      case 'suggest-tools': {
        const context = await this.contextAnalysisService.analyzeProjectContext(projectPath);
        return this.contextAnalysisService.getToolSuggestions(context.projectContext);
      }

      case 'get-patterns': {
        return await this.contextAnalysisService.analyzeCodePatterns(projectPath || process.cwd());
      }

      case 'get-recommendations': {
        const analysis = await this.contextAnalysisService.analyzeProjectContext(projectPath);
        return {
          recommendations: analysis.recommendations,
          confidence: analysis.confidence
        };
      }

      default: {
        throw new Error(`Unknown action: ${action}`);
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

  async validateParams(params: unknown): Promise<AnalyzeContextParams> {
    return AnalyzeContextParamsSchema.parse(params);
  }
}