// packages/core/src/tools/run-tests.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { BaseDeclarativeTool } from '../types/tools.js';
import type { TestExecutionService, TestExecutionOptions, TestType } from '../services/testExecutionService.js';
import type { Config } from '../config/config.js';

const RunTestsParamsSchema = z.object({
  action: z.enum(['run', 'run-with-coverage', 'run-files', 'run-pattern', 'discover', 'analyze-coverage']).describe('The test action to perform'),
  projectPath: z.string().optional().describe('Path to the project to test (defaults to current directory)'),
  files: z.array(z.string()).optional().describe('Specific test files to run'),
  pattern: z.string().optional().describe('Pattern to match test names'),
  type: z.enum(['unit', 'integration', 'e2e', 'component', 'api']).optional().describe('Type of tests to run'),
  coverage: z.boolean().optional().describe('Whether to generate coverage report'),
  watch: z.boolean().optional().describe('Whether to run in watch mode'),
  verbose: z.boolean().optional().describe('Whether to enable verbose output'),
  bail: z.boolean().optional().describe('Whether to stop on first failure'),
  timeout: z.number().optional().describe('Timeout for test execution in milliseconds')
});

type RunTestsParams = z.infer<typeof RunTestsParamsSchema>;

export class RunTestsTool implements BaseDeclarativeTool {
  name = 'run-tests';
  description = 'Executes automated tests with various frameworks and provides comprehensive results and coverage analysis';
  schema = {
    type: 'function' as const,
    function: {
      name: this.name,
      description: this.description,
      parameters: RunTestsParamsSchema
    }
  };

  constructor(
    private readonly testExecutionService: TestExecutionService,
    private readonly config: Config
  ) {}

  async execute(params: RunTestsParams): Promise<unknown> {
    const {
      action,
      projectPath,
      files,
      pattern,
      type,
      coverage,
      watch,
      verbose,
      bail,
      timeout
    } = params;

    const options: TestExecutionOptions = {
      type: type as TestType | undefined,
      coverage,
      watch,
      verbose,
      bail,
      timeout
    };

    switch (action) {
      case 'run': {
        return await this.testExecutionService.runTests(options, projectPath);
      }

      case 'run-with-coverage': {
        return await this.testExecutionService.runTestsWithCoverage(options, projectPath);
      }

      case 'run-files': {
        if (!files || files.length === 0) {
          throw new Error('Files parameter is required for run-files action');
        }
        return await this.testExecutionService.runTestFiles(files, options, projectPath);
      }

      case 'run-pattern': {
        if (!pattern) {
          throw new Error('Pattern parameter is required for run-pattern action');
        }
        return await this.testExecutionService.runTestsByPattern(pattern, options, projectPath);
      }

      case 'discover': {
        return await this.testExecutionService.discoverTests(projectPath);
      }

      case 'analyze-coverage': {
        return await this.testExecutionService.analyzeCoverage(projectPath);
      }

      default: {
        throw new Error(`Unknown action: ${action}`);
      }
    }
  }

  async validateParams(params: unknown): Promise<RunTestsParams> {
    return RunTestsParamsSchema.parse(params);
  }
}