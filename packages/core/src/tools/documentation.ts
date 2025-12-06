/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolResult } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { DocumentationService } from '../services/documentationService.js';
import { getErrorMessage } from '../utils/errors.js';

interface DocumentationParams {
  action: 'check_coverage' | 'generate_readme' | 'generate_api_docs';
  targetPath?: string; // File or directory
}

export class DocumentationTool extends BaseDeclarativeTool<DocumentationParams, ToolResult> {
  static readonly Name = 'documentation';

  constructor(private readonly config: Config) {
    super(
      DocumentationTool.Name,
      'Documentation',
      'Manage project documentation: check coverage, scan for missing docs, and generate documentation artifacts.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['check_coverage', 'generate_readme', 'generate_api_docs'],
            description: 'The documentation action to perform.'
          },
          targetPath: {
            type: 'string',
            description: 'Path to the file or directory to analyze/document.'
          }
        },
        required: ['action']
      }
    );
  }

  protected createInvocation(params: DocumentationParams): BaseToolInvocation<DocumentationParams, ToolResult> {
    return new DocumentationInvocation(this.config, params);
  }
}

class DocumentationInvocation extends BaseToolInvocation<DocumentationParams, ToolResult> {
  private readonly docService: DocumentationService;

  constructor(private readonly config: Config, params: DocumentationParams) {
    super(params);
    this.docService = new DocumentationService();
  }

  getDescription(): string {
    return `Documentation action: ${this.params.action}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const targetPath = this.params.targetPath 
        ? path.resolve(this.config.getTargetDir(), this.params.targetPath)
        : this.config.getTargetDir();

      switch (this.params.action) {
        case 'check_coverage': {
          const results = await this.docService.checkCoverage(targetPath);
          
          const totalItems = results.reduce((sum, r) => sum + r.totalItems, 0);
          const totalDocumented = results.reduce((sum, r) => sum + r.documentedItems, 0);
          const overallCoverage = totalItems > 0 ? (totalDocumented / totalItems) * 100 : 100;

          let output = `Documentation Coverage Report\n`;
          output += `Overall Coverage: ${overallCoverage.toFixed(1)}% (${totalDocumented}/${totalItems})\n\n`;
          
          const lowCoverageFiles = results
            .filter(r => r.coverage < 1.0 && r.totalItems > 0)
            .sort((a, b) => a.coverage - b.coverage)
            .slice(0, 10);

          if (lowCoverageFiles.length > 0) {
            output += `Files needing attention:\n`;
            for (const file of lowCoverageFiles) {
              const relPath = path.relative(this.config.getTargetDir(), file.filePath);
              output += `- ${relPath}: ${(file.coverage * 100).toFixed(0)}% (${file.documentedItems}/${file.totalItems})\n`;
              if (file.missingDocs.length > 0) {
                output += `  Missing: ${file.missingDocs.slice(0, 3).map(d => d.name).join(', ')}${file.missingDocs.length > 3 ? '...' : ''}\n`;
              }
            }
          }

          return {
            llmContent: output,
            returnDisplay: output
          };
        }

        case 'generate_readme': {
            // This is a placeholder. In a real agent, the agent itself would write the README using existing tools.
            // This tool just signals INTENT or scaffolds.
            return {
                llmContent: "To generate a README, please use the 'read_file' tool to inspect the project structure and 'write_file' to create README.md. This tool action is a placeholder for future auto-generation logic.",
                returnDisplay: "Please use standard file tools to generate README."
            };
        }

        case 'generate_api_docs': {
             return {
                llmContent: "To generate API docs, please use 'read_file' to inspect source code and 'write_file' to create the documentation. For automated tools like TypeDoc, use 'run_shell_command'.",
                returnDisplay: "Please use standard file tools or shell commands."
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
        llmContent: `Documentation error: ${getErrorMessage(error)}`,
        returnDisplay: `Error: ${getErrorMessage(error)}`,
        error: {
          message: getErrorMessage(error),
          type: ToolErrorType.DOC_ERROR
        }
      };
    }
  }
}
