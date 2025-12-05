// packages/core/src/tools/generate-output.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { BaseDeclarativeTool } from '../types/tools.js';
import type { MultiModalService, OutputFormat, OutputOptions } from '../services/multiModalService.js';
import type { Config } from '../config/config.js';

const GenerateOutputParamsSchema = z.object({
  action: z.enum(['generate', 'save', 'create-report', 'create-visualization', 'create-documentation']).describe('The output action to perform'),
  content: z.union([z.string(), z.record(z.any())]).describe('The content to generate output from'),
  format: z.enum(['text', 'json', 'html', 'markdown', 'pdf', 'image']).optional().describe('Output format(s) to generate'),
  destination: z.string().optional().describe('Destination path for saving outputs'),
  title: z.string().optional().describe('Title for the output'),
  includeMetadata: z.boolean().optional().describe('Whether to include metadata in outputs'),
  compress: z.boolean().optional().describe('Whether to compress outputs'),
  quality: z.number().optional().describe('Quality setting for images/videos (0-100)'),
  width: z.number().optional().describe('Width for images/videos'),
  height: z.number().optional().describe('Height for images/videos'),
  // Report-specific parameters
  summary: z.string().optional().describe('Summary for reports'),
  metrics: z.record(z.number()).optional().describe('Metrics data for reports'),
  // Visualization-specific parameters
  visualizationType: z.enum(['chart', 'graph', 'diagram', 'heatmap']).optional().describe('Type of visualization'),
  // Documentation-specific parameters
  sections: z.array(z.object({
    title: z.string(),
    content: z.string(),
    codeBlocks: z.array(z.string()).optional()
  })).optional().describe('Documentation sections'),
  apiReference: z.record(z.any()).optional().describe('API reference data'),
  examples: z.array(z.string()).optional().describe('Code examples')
});

type GenerateOutputParams = z.infer<typeof GenerateOutputParamsSchema>;

export class GenerateOutputTool implements BaseDeclarativeTool {
  name = 'generate-output';
  description = 'Generates multi-modal outputs in various formats including reports, visualizations, and documentation';
  schema = {
    type: 'function' as const,
    function: {
      name: this.name,
      description: this.description,
      parameters: GenerateOutputParamsSchema
    }
  };

  constructor(
    private readonly multiModalService: MultiModalService,
    private readonly config: Config
  ) {}

  async execute(params: GenerateOutputParams): Promise<unknown> {
    const {
      action,
      content,
      format,
      destination,
      title,
      includeMetadata,
      compress,
      quality,
      width,
      height,
      summary,
      metrics,
      visualizationType,
      sections,
      apiReference,
      examples
    } = params;

    const options: OutputOptions = {
      format: format as OutputFormat | undefined,
      destination,
      includeMetadata,
      compress,
      quality,
      dimensions: width && height ? { width, height } : undefined
    };

    switch (action) {
      case 'generate': {
        return await this.multiModalService.generateOutputs(content, options);
      }

      case 'save': {
        const result = await this.multiModalService.generateOutputs(content, options);
        const savedFiles = await this.multiModalService.saveOutputs(result, destination);
        return {
          ...result,
          savedFiles
        };
      }

      case 'create-report': {
        if (!title || !summary) {
          throw new Error('Title and summary are required for report creation');
        }
        return await this.multiModalService.createComprehensiveReport({
          title,
          summary,
          details: content,
          metrics
        }, options);
      }

      case 'create-visualization': {
        if (!visualizationType) {
          throw new Error('Visualization type is required for visualization creation');
        }
        return await this.multiModalService.createVisualization(content, visualizationType, options);
      }

      case 'create-documentation': {
        if (!title || !sections) {
          throw new Error('Title and sections are required for documentation creation');
        }
        return await this.multiModalService.createDocumentation({
          title,
          sections,
          apiReference,
          examples
        }, options);
      }

      default: {
        throw new Error(`Unknown action: ${action}`);
      }
    }
  }

  async validateParams(params: unknown): Promise<GenerateOutputParams> {
    return GenerateOutputParamsSchema.parse(params);
  }
}