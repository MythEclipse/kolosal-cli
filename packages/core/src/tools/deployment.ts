/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolResult } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { DeploymentService } from '../services/deploymentService.js';
import { ContextAnalysisService } from '../services/contextAnalysisService.js';
import { getErrorMessage } from '../utils/errors.js';

interface DeploymentParams {
  action: 'generate_pipeline' | 'generate_config' | 'rollback';
  platform?: 'github' | 'gitlab' | 'vercel' | 'netlify'; // Optional for rollback
  projectPath?: string;
  commitHash?: string; // For rollback action
}

export class DeploymentTool extends BaseDeclarativeTool<DeploymentParams, ToolResult> {
  static readonly Name = 'deployment';

  constructor(private readonly config: Config) {
    super(
      DeploymentTool.Name,
      'Deployment',
      'Manage deployment configurations, CI/CD pipelines, and project rollbacks.',
      Kind.Create,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['generate_pipeline', 'generate_config', 'rollback'],
            description: 'The deployment action to perform.'
          },
          platform: {
            type: 'string',
            enum: ['github', 'gitlab', 'vercel', 'netlify'],
            description: 'Target platform (optional for rollback).'
          },
          projectPath: { type: 'string' },
          commitHash: { type: 'string', description: 'Commit hash to rollback to (for rollback action).' }
        },
        required: ['action']
      }
    );
  }

  protected createInvocation(params: DeploymentParams): BaseToolInvocation<DeploymentParams, ToolResult> {
    return new DeploymentInvocation(this.config, params);
  }
}

class DeploymentInvocation extends BaseToolInvocation<DeploymentParams, ToolResult> {
  private readonly deploymentService: DeploymentService;
  private readonly contextService: ContextAnalysisService;

  constructor(private readonly config: Config, params: DeploymentParams) {
    super(params);
    this.deploymentService = new DeploymentService();
    this.contextService = new ContextAnalysisService();
  }

  getDescription(): string {
    return `Deployment action: ${this.params.action} for ${this.params.platform || ''}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const projectPath = this.params.projectPath 
        ? path.resolve(this.config.getTargetDir(), this.params.projectPath)
        : this.config.getTargetDir();

      // Only analyze project context if needed for actions other than rollback
      let analysis: Awaited<ReturnType<ContextAnalysisService['analyzeProjectContext']>> | undefined;
      if (this.params.action !== 'rollback') {
         analysis = await this.contextService.analyzeProjectContext(projectPath);
      }

      switch (this.params.action) {
        case 'generate_pipeline':
          if (!this.params.platform) throw new Error('Platform is required for generate_pipeline action.');
          if (this.params.platform === 'github') {
            const content = await this.deploymentService.generateGithubActions(projectPath, analysis!.projectContext.type);
            return {
              llmContent: `GitHub Actions workflow generated at .github/workflows/ci.yml\n\n${content}`,
              returnDisplay: 'GitHub Actions workflow generated.'
            };
          }
          // Fallback for other platforms not yet implemented
          return {
            llmContent: `Pipeline generation for ${this.params.platform} is not yet supported.`,
            returnDisplay: 'Not supported.'
          };

        case 'generate_config':
          if (!this.params.platform) throw new Error('Platform is required for generate_config action.');
          if (this.params.platform === 'vercel') {
            const content = await this.deploymentService.generateVercelConfig(projectPath);
            return {
              llmContent: `Vercel config generated at vercel.json\n\n${content}`,
              returnDisplay: 'Vercel config generated.'
            };
          }
          return {
            llmContent: `Config generation for ${this.params.platform} is not yet supported.`,
            returnDisplay: 'Not supported.'
          };
        
        case 'rollback': {
          if (!this.params.commitHash) {
            throw new Error('commitHash is required for rollback action.');
          }
          const gitService = await this.config.getGitService();
          await gitService.restoreProjectFromSnapshot(this.params.commitHash);
          return {
            llmContent: `Project successfully rolled back to commit ${this.params.commitHash}`,
            returnDisplay: `Project rolled back to ${this.params.commitHash}`
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
        llmContent: `Deployment error: ${getErrorMessage(error)}`,
        returnDisplay: `Error: ${getErrorMessage(error)}`,
        error: {
          message: getErrorMessage(error),
          type: ToolErrorType.DEPLOYMENT_ERROR
        }
      };
    }
  }
}
