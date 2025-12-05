// packages/core/src/tools/manage-dependencies.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolResult } from './tools.js';
import type { Config } from '../config/config.js';
import { DependencyService, type PackageManager, type DependencyType } from '../services/dependencyService.js';

interface ManageDependenciesParams {
  action: 'install' | 'add' | 'remove' | 'update' | 'analyze' | 'audit';
  packages?: string[];
  packageManager?: PackageManager;
  dependencyType?: DependencyType;
  projectPath?: string;
}

export class ManageDependenciesTool extends BaseDeclarativeTool<ManageDependenciesParams, ToolResult> {
  static readonly Name = 'manage_dependencies';

  constructor(private readonly config: Config) {
    super(
      ManageDependenciesTool.Name,
      'ManageDependencies',
      'Manage project dependencies including installation, addition, removal, updates, and security analysis.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['install', 'add', 'remove', 'update', 'analyze', 'audit'],
            description: 'The dependency management action to perform.'
          },
          packages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Package names for add/remove/update actions.'
          },
          packageManager: {
            type: 'string',
            enum: ['npm', 'yarn', 'pnpm', 'bun'],
            description: 'Package manager to use (auto-detected if not specified).'
          },
          dependencyType: {
            type: 'string',
            enum: ['dependency', 'devDependency', 'peerDependency', 'optionalDependency'],
            description: 'Type of dependency for add action.'
          },
          projectPath: {
            type: 'string',
            description: 'Path to the project directory.'
          }
        },
        required: ['action']
      }
    );
  }

  protected createInvocation(params: ManageDependenciesParams): BaseToolInvocation<ManageDependenciesParams, ToolResult> {
    return new ManageDependenciesInvocation(this.config, params);
  }
}

class ManageDependenciesInvocation extends BaseToolInvocation<ManageDependenciesParams, ToolResult> {
  private readonly dependencyService: DependencyService;

  constructor(config: Config, params: ManageDependenciesParams) {
    super(params);
    this.dependencyService = new DependencyService();
  }

  getDescription(): string {
    return `Managing dependencies: ${this.params.action}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const { action, packages, packageManager, dependencyType, projectPath } = this.params;

      switch (action) {
        case 'install':
          const installResult = await this.dependencyService.installDependencies(
            projectPath,
            packageManager
          );
          return {
            llmContent: installResult.success
              ? `Dependencies installed successfully`
              : `Failed to install dependencies: ${installResult.error}`,
            returnDisplay: installResult.output
          };

        case 'add':
          if (!packages || packages.length === 0) {
            return {
              llmContent: 'No packages specified for addition',
              returnDisplay: 'Error: No packages specified'
            };
          }

          const addResults = await Promise.all(
            packages.map(pkg =>
              this.dependencyService.addDependency(
                pkg,
                undefined,
                dependencyType,
                projectPath,
                packageManager
              )
            )
          );

          const successCount = addResults.filter(r => r.success).length;
          const failureCount = addResults.length - successCount;

          return {
            llmContent: `Added ${successCount} packages successfully${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
            returnDisplay: addResults.map((r, i) => `${packages[i]}: ${r.success ? 'OK' : r.error}`).join('\n')
          };

        case 'remove':
          if (!packages || packages.length === 0) {
            return {
              llmContent: 'No packages specified for removal',
              returnDisplay: 'Error: No packages specified'
            };
          }

          const removeResults = await Promise.all(
            packages.map(pkg =>
              this.dependencyService.removeDependency(pkg, projectPath, packageManager)
            )
          );

          const removeSuccessCount = removeResults.filter(r => r.success).length;
          const removeFailureCount = removeResults.length - removeSuccessCount;

          return {
            llmContent: `Removed ${removeSuccessCount} packages successfully${removeFailureCount > 0 ? `, ${removeFailureCount} failed` : ''}`,
            returnDisplay: removeResults.map((r, i) => `${packages[i]}: ${r.success ? 'OK' : r.error}`).join('\n')
          };

        case 'update':
          const updateResult = await this.dependencyService.updateDependencies(
            packages,
            projectPath,
            packageManager
          );
          return {
            llmContent: updateResult.success
              ? `Dependencies updated successfully`
              : `Failed to update dependencies: ${updateResult.error}`,
            returnDisplay: updateResult.output
          };

        case 'analyze':
          const analysis = await this.dependencyService.analyzeDependencies(projectPath);
          const analysisSummary = `
Dependency Analysis:
- Total dependencies: ${analysis.totalDependencies}
- Outdated: ${analysis.outdatedDependencies}
- Vulnerable: ${analysis.vulnerableDependencies}
- Missing: ${analysis.missingDependencies.length}
- Unused: ${analysis.unusedDependencies.length}
- License issues: ${analysis.licenseIssues.length}

Recommendations:
${analysis.recommendations.map(r => `- ${r}`).join('\n')}
          `.trim();

          return {
            llmContent: analysisSummary,
            returnDisplay: JSON.stringify(analysis, null, 2)
          };

        case 'audit':
          const vulnerabilities = await this.dependencyService.checkVulnerabilities(
            projectPath,
            packageManager
          );

          if (vulnerabilities.length === 0) {
            return {
              llmContent: 'No security vulnerabilities found',
              returnDisplay: 'Security audit passed'
            };
          }

          const vulnSummary = `${vulnerabilities.length} vulnerabilities found:
${vulnerabilities.map(v => `- ${v.severity.toUpperCase()}: ${v.title} (${v.package})`).join('\n')}`;

          return {
            llmContent: vulnSummary,
            returnDisplay: JSON.stringify(vulnerabilities, null, 2)
          };

        default:
          return {
            llmContent: `Unknown action: ${action}`,
            returnDisplay: 'Error: Invalid action'
          };
      }

    } catch (error) {
      return {
        llmContent: `Dependency management failed: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: 'Error occurred during dependency management'
      };
    }
  }
}
