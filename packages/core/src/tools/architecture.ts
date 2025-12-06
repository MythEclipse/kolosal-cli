/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolResult } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { ArchitectureService } from '../services/architectureService.js';
import { getErrorMessage } from '../utils/errors.js';

interface ArchitectureParams {
  action: 'analyze_structure' | 'analyze_impact' | 'list_patterns';
  projectPath?: string;
  targetFile?: string; // For analyze_impact
}

export class ArchitectureTool extends BaseDeclarativeTool<ArchitectureParams, ToolResult> {
  static readonly Name = 'architecture';

  constructor(private readonly config: Config) {
    super(
      ArchitectureTool.Name,
      'Architecture',
      'Analyze project architecture, dependencies, and impact of changes.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['analyze_structure', 'analyze_impact', 'list_patterns'],
            description: 'The analysis action to perform.'
          },
          projectPath: { type: 'string' },
          targetFile: { type: 'string', description: 'File to analyze impact for.' }
        },
        required: ['action']
      }
    );
  }

  protected createInvocation(params: ArchitectureParams): BaseToolInvocation<ArchitectureParams, ToolResult> {
    return new ArchitectureInvocation(this.config, params);
  }
}

class ArchitectureInvocation extends BaseToolInvocation<ArchitectureParams, ToolResult> {
  private readonly archService: ArchitectureService;

  constructor(private readonly config: Config, params: ArchitectureParams) {
    super(params);
    this.archService = new ArchitectureService();
  }

  getDescription(): string {
    return `Architecture analysis: ${this.params.action}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const projectPath = this.params.projectPath 
        ? path.resolve(this.config.getTargetDir(), this.params.projectPath)
        : this.config.getTargetDir();

      const { graph, report } = await this.archService.analyzeStructure(projectPath);

      switch (this.params.action) {
        case 'analyze_structure': {
          let output = `Architecture Structure Report\n`;
          output += `Files: ${report.files}\n`;
          output += `Relationships: ${report.relationships}\n`;
          
          if (report.patterns.length > 0) {
            output += `\nDetected Patterns:\n${report.patterns.map(p => `- ${p}`).join('\n')}\n`;
          }

          if (report.circularDependencies.length > 0) {
            output += `\nWARNING: ${report.circularDependencies.length} Circular Dependencies Detected:\n`;
            report.circularDependencies.slice(0, 5).forEach(cycle => {
               output += `  - ${cycle.map(f => path.relative(projectPath, f)).join(' -> ')}\n`;
            });
            if (report.circularDependencies.length > 5) output += `  ...and ${report.circularDependencies.length - 5} more.\n`;
          }

          if (report.orphans.length > 0) {
            output += `\nOrphan Files (no inbound imports):\n${report.orphans.slice(0, 10).map(f => `- ${f}`).join('\n')}\n`;
          }

          return {
            llmContent: output,
            returnDisplay: output
          };
        }

        case 'list_patterns': {
           return {
            llmContent: `Architectural Patterns Detected:\n${report.patterns.join('\n') || 'None detected'}`,
            returnDisplay: 'Patterns listed.'
           };
        }

        case 'analyze_impact': {
          if (!this.params.targetFile) throw new Error('targetFile is required for impact analysis');
          
          const targetAbs = path.resolve(projectPath, this.params.targetFile);
          if (!graph.has(targetAbs)) {
             return { llmContent: `File ${this.params.targetFile} not found in dependency graph.`, returnDisplay: 'File not found.' };
          }

          const impacted = await this.archService.analyzeImpact(targetAbs, graph);
          const impactedRel = impacted.map(f => path.relative(projectPath, f));

          return {
            llmContent: `Impact Analysis for ${this.params.targetFile}:\nChanging this file may affect ${impacted.length} other files:\n\n${impactedRel.join('\n')}`,
            returnDisplay: `Impact: ${impacted.length} files.`
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
        llmContent: `Architecture analysis error: ${getErrorMessage(error)}`,
        returnDisplay: `Error: ${getErrorMessage(error)}`,
        error: {
          message: getErrorMessage(error),
          type: ToolErrorType.ARCH_ERROR
        }
      };
    }
  }
}
