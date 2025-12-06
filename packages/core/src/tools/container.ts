/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolResult } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { ContainerizationService } from '../services/containerizationService.js';
import { ContextAnalysisService } from '../services/contextAnalysisService.js';
import { getErrorMessage } from '../utils/errors.js';

interface ContainerParams {
  action: 'generate_dockerfile' | 'generate_compose' | 'build_image';
  projectPath?: string;
  imageName?: string; // For build_image
  options?: {
    nodeVersion?: string;
    ports?: number[];
  };
}

export class ContainerTool extends BaseDeclarativeTool<ContainerParams, ToolResult> {
  static readonly Name = 'container';

  constructor(private readonly config: Config) {
    super(
      ContainerTool.Name,
      'Container',
      'Manage Docker containerization: generate Dockerfiles, docker-compose.yml, and build images.',
      Kind.Create,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['generate_dockerfile', 'generate_compose', 'build_image'],
            description: 'The container action to perform.'
          },
          projectPath: { type: 'string' },
          imageName: { type: 'string', description: 'Tag name for the image (for build_image action)' },
          options: {
            type: 'object',
            properties: {
              nodeVersion: { type: 'string' },
              ports: { type: 'array', items: { type: 'number' } }
            }
          }
        },
        required: ['action']
      }
    );
  }

  protected createInvocation(params: ContainerParams): BaseToolInvocation<ContainerParams, ToolResult> {
    return new ContainerInvocation(this.config, params);
  }
}

class ContainerInvocation extends BaseToolInvocation<ContainerParams, ToolResult> {
  private readonly containerService: ContainerizationService;
  private readonly contextService: ContextAnalysisService;

  constructor(private readonly config: Config, params: ContainerParams) {
    super(params);
    this.containerService = new ContainerizationService();
    this.contextService = new ContextAnalysisService();
  }

  getDescription(): string {
    return `Container action: ${this.params.action}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const projectPath = this.params.projectPath 
        ? path.resolve(this.config.getTargetDir(), this.params.projectPath)
        : this.config.getTargetDir();

      switch (this.params.action) {
        case 'generate_dockerfile': {
          // Auto-detect project type if possible
          const analysis = await this.contextService.analyzeProjectContext(projectPath);
          const projectType = analysis.projectContext.type;

          const content = await this.containerService.generateDockerfile(projectPath, {
            projectType,
            nodeVersion: this.params.options?.nodeVersion,
            ports: this.params.options?.ports
          });

          return {
            llmContent: `Dockerfile generated successfully at ${path.join(projectPath, 'Dockerfile')}\n\n${content}`,
            returnDisplay: 'Dockerfile generated.'
          };
        }

        case 'generate_compose': {
          // Heuristic: Create a basic compose file for the app
          const appName = path.basename(projectPath).toLowerCase().replace(/[^a-z0-9]/g, '-');
          const services = {
            [appName]: {
              build: '.',
              ports: ['3000:3000'],
              environment: ['NODE_ENV=production']
            }
          };
          
          const content = await this.containerService.generateComposeFile(projectPath, services);
          
          return {
            llmContent: `docker-compose.yml generated successfully at ${path.join(projectPath, 'docker-compose.yml')}\n\n${content}`,
            returnDisplay: 'docker-compose.yml generated.'
          };
        }

        case 'build_image': {
          if (!this.params.imageName) {
            throw new Error('imageName is required for build_image action');
          }
          const result = await this.containerService.buildImage(projectPath, this.params.imageName);
          
          return {
            llmContent: result.success ? `Image built successfully: ${this.params.imageName}` : `Failed to build image: ${result.output}`,
            returnDisplay: result.output
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
        llmContent: `Container error: ${getErrorMessage(error)}`,
        returnDisplay: `Error: ${getErrorMessage(error)}`,
        error: {
          message: getErrorMessage(error),
          type: ToolErrorType.CONTAINER_ERROR
        }
      };
    }
  }
}
