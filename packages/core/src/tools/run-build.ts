// packages/core/src/tools/run-build.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolResult } from './tools.js';
import type { Config } from '../config/config.js';
import { BuildService } from '../services/buildService.js';

interface RunBuildParams {
  action: 'build' | 'test' | 'lint' | 'typecheck' | 'clean';
  projectPath?: string;
  fix?: boolean; // For lint action
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

  constructor(config: Config, params: RunBuildParams) {
    super(config, params);
    this.buildService = new BuildService(config);
  }

  async execute(): Promise<ToolResult> {
    try {
      const { action, projectPath, fix } = this.params;

      switch (action) {
        case 'build':
          const buildResult = await this.buildService.runBuild(projectPath);
          const buildSummary = `
Build ${buildResult.success ? 'succeeded' : 'failed'} in ${Math.round(buildResult.duration / 1000)}s
Errors: ${buildResult.errors.length}
Warnings: ${buildResult.warnings.length}
          `.trim();

          return {
            llmContent: buildSummary,
            returnDisplay: buildResult.output || 'No output'
          };

        case 'test':
          const testResult = await this.buildService.runTests(projectPath);
          const testSummary = `
Tests ${testResult.success ? 'passed' : 'failed'} in ${Math.round(testResult.duration / 1000)}s
Passed: ${testResult.passed}
Failed: ${testResult.failed}
Total: ${testResult.total}
${testResult.coverage ? `Coverage: ${testResult.coverage.lines}% lines` : ''}
          `.trim();

          return {
            llmContent: testSummary,
            returnDisplay: testResult.output || 'No test output'
          };

        case 'lint':
          const lintResult = await this.buildService.runLint(projectPath, undefined, fix);
          const lintSummary = `
Lint ${lintResult.success ? 'passed' : 'failed'} in ${Math.round(lintResult.duration / 1000)}s
Errors: ${lintResult.errorCount}
Warnings: ${lintResult.warningCount}
Fixable: ${lintResult.fixableCount}
          `.trim();

          return {
            llmContent: lintSummary,
            returnDisplay: lintResult.output || 'No lint output'
          };

        case 'typecheck':
          const typeResult = await this.buildService.runTypeCheck(projectPath);
          const typeSummary = `
Type check ${typeResult.success ? 'passed' : 'failed'} in ${Math.round(typeResult.duration / 1000)}s
Errors: ${typeResult.errors.length}
Warnings: ${typeResult.warnings.length}
          `.trim();

          return {
            llmContent: typeSummary,
            returnDisplay: typeResult.output || 'No type check output'
          };

        case 'clean':
          const cleanResult = await this.buildService.cleanBuild(projectPath);
          return {
            llmContent: cleanResult.success ? 'Build artifacts cleaned successfully' : 'Failed to clean build artifacts',
            returnDisplay: cleanResult.output || 'No output'
          };

        default:
          return {
            llmContent: `Unknown build action: ${action}`,
            returnDisplay: 'Error: Invalid action'
          };
      }

    } catch (error) {
      return {
        llmContent: `Build operation failed: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: 'Error occurred during build operation'
      };
    }
  }
}</content>
<parameter name="filePath">d:\kolosal-cli-1\packages\core\src\tools\run-build.ts