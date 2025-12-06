/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import type { Config } from '../config/config.js';
import type {
  ToolResult,
  ToolInvocation,
} from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { DependencyService } from '../services/dependencyService.js';

/**
 * Parameters for the ResolveConflicts tool
 */
export interface ResolveConflictsToolParams {
  /**
   * The absolute path to the project directory
   */
  project_path?: string;
  
  /**
   * Whether to automatically resolve conflicts
   */
  auto_resolve?: boolean;
  
  /**
   * Whether to auto-update packages to latest versions
   */
  auto_update?: boolean;
}

class ResolveConflictsToolInvocation extends BaseToolInvocation<
  ResolveConflictsToolParams,
  ToolResult
> {
  private readonly dependencyService: DependencyService;

  constructor(
    private readonly config: Config,
    params: ResolveConflictsToolParams,
  ) {
    super(params);
    this.dependencyService = new DependencyService();
  }

  override getDescription(): string {
    const projectPath = this.params.project_path || this.config.getTargetDir();
    return `Resolving dependency conflicts in ${projectPath}`;
  }

  async execute(_abortSignal: AbortSignal): Promise<ToolResult> {
    try {
      const projectPath = this.params.project_path || this.config.getTargetDir();
      
      // First, analyze dependencies to detect conflicts
      const analysis = await this.dependencyService.analyzeDependencies(projectPath);
      
      let resultMessage = `Dependency Conflict Analysis:
- Total dependencies: ${analysis.totalDependencies}
- Outdated dependencies: ${analysis.outdatedDependencies}
- Vulnerable dependencies: ${analysis.vulnerableDependencies}
- Missing dependencies: ${analysis.missingDependencies.length}`;

      // Add conflict information if available
      if (analysis.conflicts && analysis.conflicts.length > 0) {
        resultMessage += `\n- Version conflicts detected: ${analysis.conflicts.length}`;
        
        resultMessage += '\n\nConflicts Details:';
        for (const conflict of analysis.conflicts) {
          resultMessage += `\n- ${conflict.name}:`;
          resultMessage += `\n  Versions: ${conflict.versions.map(v => v.version).join(', ')}`;
          resultMessage += `\n  Recommended: ${conflict.recommendedVersion}`;
          resultMessage += `\n  Resolution: ${conflict.resolution} (${conflict.severity} severity)`;
          
          // Show sources for each version
          for (const version of conflict.versions) {
            resultMessage += `\n    ${version.version} required by: ${version.sources.slice(0, 3).join(', ')}`;
            if (version.sources.length > 3) {
              resultMessage += ` and ${version.sources.length - 3} more`;
            }
          }
        }
      } else {
        resultMessage += '\n- No version conflicts detected';
      }
      
      // Auto-resolve conflicts if requested
      if (this.params.auto_resolve && analysis.conflicts && analysis.conflicts.length > 0) {
        resultMessage += '\n\nResolving conflicts...';
        
        const packageManager = await this.dependencyService.detectPackageManager(projectPath);
        const resolveResult = await this.dependencyService.resolveVersionConflicts(
          projectPath,
          packageManager
        );
        
        resultMessage += `\n\nConflict Resolution Results:\n${resolveResult.output}`;
      }
      
      // Auto-update packages if requested
      if (this.params.auto_update) {
        resultMessage += '\n\nChecking for package updates...';
        
        const packageManager = await this.dependencyService.detectPackageManager(projectPath);
        const updateResult = await this.dependencyService.autoUpdatePackages(
          projectPath,
          packageManager
        );
        
        resultMessage += `\n\nUpdate Results:\n${updateResult.output}`;
      }
      
      return {
        llmContent: resultMessage,
        returnDisplay: resultMessage,
      };
    } catch (error) {
      const errorMsg = `Error resolving conflicts: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: errorMsg,
        returnDisplay: errorMsg,
        error: {
          message: errorMsg,
          type: ToolErrorType.CONFLICT_RESOLUTION_ERROR,
        },
      };
    }
  }
}

/**
 * Implementation of the ResolveConflicts tool logic
 */
export class ResolveConflictsTool extends BaseDeclarativeTool<ResolveConflictsToolParams, ToolResult> {
  static readonly Name: string = 'resolve_conflicts';

  constructor(private readonly config: Config) {
    super(
      ResolveConflictsTool.Name,
      'ResolveConflicts',
      `Detects and resolves dependency version conflicts in a project.
      
This tool analyzes the dependency tree to find:
- Version conflicts between different packages requiring different versions
- Outdated dependencies that could be updated
- Security vulnerabilities in dependencies
      
It can automatically resolve conflicts by:
- Updating packages to compatible versions
- Pinning specific versions when needed
- Recommending manual resolution for complex cases`,
      Kind.Other,
      {
        properties: {
          project_path: {
            description: "The absolute path to the project directory (defaults to current working directory)",
            type: 'string',
          },
          auto_resolve: {
            description: "Whether to automatically resolve detected conflicts",
            type: 'boolean',
          },
          auto_update: {
            description: "Whether to automatically update packages to latest versions",
            type: 'boolean',
          }
        },
        required: [],
        type: 'object',
      },
    );
  }

  protected override validateToolParamValues(
    params: ResolveConflictsToolParams,
  ): string | null {
    if (params.project_path) {
      if (!path.isAbsolute(params.project_path)) {
        return `Project path must be absolute: ${params.project_path}`;
      }

      const workspaceContext = this.config.getWorkspaceContext();
      if (!workspaceContext.isPathWithinWorkspace(params.project_path)) {
        const directories = workspaceContext.getDirectories();
        return `Project path must be within one of the workspace directories: ${directories.join(
          ', ',
        )}`;
      }
    }

    return null;
  }

  protected createInvocation(
    params: ResolveConflictsToolParams,
  ): ToolInvocation<ResolveConflictsToolParams, ToolResult> {
    return new ResolveConflictsToolInvocation(this.config, params);
  }
}