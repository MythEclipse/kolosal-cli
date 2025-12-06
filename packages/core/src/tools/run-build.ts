// packages/core/src/tools/run-build.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolResult } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { BuildService } from '../services/buildService.js';
import { getErrorMessage } from '../utils/errors.js';

interface RunBuildParams {
  action: 'build' | 'test' | 'lint' | 'typecheck' | 'clean';
  projectPath?: string;
  fix?: boolean; // For lint action
  retries?: number; // For test action
}

export class RunBuildTool extends BaseDeclarativeTool<RunBuildParams, ToolResult> {
  static readonly Name = 'run_build';

  constructor(private readonly config: Config) {
    super(
      RunBuildTool.Name,
      'RunBuild',
      'Execute build, test, lint, type checking, or cleanup operations for the project.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['build', 'test', 'lint', 'typecheck', 'clean'],
            description: 'The build action to perform.'
          },
          projectPath: {
            type: 'string',
            description: 'Path to the project directory.'
          },
          fix: {
            type: 'boolean',
            description: 'Whether to auto-fix linting issues (only for lint action).'
          },
          retries: {
            type: 'number',
            description: 'Number of times to retry failed tests (only for test action).',
            minimum: 0,
            default: 0
          }
        },
        required: ['action']
      }
    );
  }

  protected createInvocation(params: RunBuildParams): BaseToolInvocation<RunBuildParams, ToolResult> {
    return new RunBuildInvocation(this.config, params);
  }
}

class RunBuildInvocation extends BaseToolInvocation<RunBuildParams, ToolResult> {
  private readonly buildService: BuildService;

  constructor(_config: Config, params: RunBuildParams) {
    super(params);
    this.buildService = new BuildService();
  }

  getDescription(): string {
    return `Running build action: ${this.params.action}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const { action, projectPath, fix, retries } = this.params;

      switch (action) {
        case 'build': {
          const buildResult = await this.buildService.runBuild(projectPath);
          const buildSummary = `
Build ${buildResult.success ? 'succeeded' : 'failed'} in ${Math.round(buildResult.duration / 1000)}s
Errors: ${buildResult.errors.length}
Warnings: ${buildResult.warnings.length}
          `.trim();

          return {
            llmContent: buildSummary,
            returnDisplay: buildSummary
          };
        }

        case 'test': {
          const testResult = await this.buildService.runTests(projectPath, undefined, retries);
          const testSummary = `
Tests ${testResult.success ? 'passed' : 'failed'} in ${Math.round(testResult.duration / 1000)}s
Passed: ${testResult.passed}
Failed: ${testResult.failed}
Total: ${testResult.total}
${testResult.coverage ? `Coverage: ${testResult.coverage.lines}% lines` : ''}
          `.trim();

          return {
            llmContent: testSummary,
            returnDisplay: testSummary
          };
        }

        case 'lint': {
          const lintResult = await this.buildService.runLint(projectPath, undefined, fix);
          const lintSummary = `
Lint ${lintResult.success ? 'passed' : 'failed'} in ${Math.round(lintResult.duration / 1000)}s
Errors: ${lintResult.errorCount}
Warnings: ${lintResult.warningCount}
Fixable: ${lintResult.fixableCount}
          `.trim();

          return {
            llmContent: lintSummary,
            returnDisplay: lintSummary
          };
        }

        case 'typecheck': {
          const typeResult = await this.buildService.runTypeCheck(projectPath);
          const typeSummary = `
Type check ${typeResult.success ? 'passed' : 'failed'} in ${Math.round(typeResult.duration / 1000)}s
Errors: ${typeResult.errors.length}
Warnings: ${typeResult.warnings.length}
          `.trim();

          return {
            llmContent: typeSummary,
            returnDisplay: typeSummary
          };
        }

        case 'clean': {
          const cleanResult = await this.buildService.cleanBuild(projectPath);
          return {
            llmContent: cleanResult.success ? 'Build artifacts cleaned successfully' : `Failed to clean build artifacts: ${cleanResult.output}`,
            returnDisplay: cleanResult.output
          };
        }

        default: {
          return {
            llmContent: `Unknown build action: ${action}`,
            returnDisplay: 'Error: Invalid action'
          };
        }
      }
    } catch (error) {
      return {
        llmContent: `Build operation failed: ${getErrorMessage(error)}`,
        returnDisplay: `Error occurred during build operation: ${getErrorMessage(error)}`,
        error: {
          message: getErrorMessage(error),
          type: ToolErrorType.BUILD_ERROR
        }
      };
    }
  }
}
