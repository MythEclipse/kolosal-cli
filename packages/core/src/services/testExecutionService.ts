// packages/core/src/services/testExecutionService.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Config } from '../config/config.js';

export enum TestFramework {
  JEST = 'jest',
  VITEST = 'vitest',
  MOCHA = 'mocha',
  JASMINE = 'jasmine',
  CYPRESS = 'cypress',
  PLAYWRIGHT = 'playwright',
  TESTING_LIBRARY = 'testing_library',
  UNKNOWN = 'unknown'
}

export enum TestType {
  UNIT = 'unit',
  INTEGRATION = 'integration',
  E2E = 'e2e',
  COMPONENT = 'component',
  API = 'api'
}

export interface TestResult {
  framework: TestFramework;
  type: TestType;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
  coverage?: TestCoverage;
  errors: string[];
  output: string;
}

export interface TestCoverage {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
  threshold?: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
}

export interface TestConfig {
  framework: TestFramework;
  configFile?: string;
  testScripts: string[];
  coverageEnabled: boolean;
  watchMode: boolean;
  parallel: boolean;
  timeout: number;
}

export interface TestExecutionOptions {
  type?: TestType;
  files?: string[];
  pattern?: string;
  coverage?: boolean;
  watch?: boolean;
  verbose?: boolean;
  bail?: boolean;
  timeout?: number;
}

export class TestExecutionService {
  constructor(private readonly config: Config) {}

  /**
   * Discovers and analyzes test configuration
   */
  async discoverTestConfig(projectPath: string = process.cwd()): Promise<TestConfig> {
    const packageJson = await this.readPackageJson(projectPath);
    const configFiles = await this.findTestConfigFiles(projectPath);

    const framework = this.detectTestFramework(packageJson, configFiles);
    const testScripts = this.extractTestScripts(packageJson);
    const coverageEnabled = this.hasCoverage(packageJson, configFiles);
    const configFile = this.findConfigFile(framework, configFiles);

    return {
      framework,
      configFile,
      testScripts,
      coverageEnabled,
      watchMode: false,
      parallel: true,
      timeout: 30000
    };
  }

  /**
   * Runs tests with specified options
   */
  async runTests(
    options: TestExecutionOptions = {},
    projectPath: string = process.cwd()
  ): Promise<TestResult> {
    const config = await this.discoverTestConfig(projectPath);
    const command = this.buildTestCommand(config, options);

    try {
      const result = await this.executeTestCommand(command, projectPath, options.timeout || config.timeout);
      return this.parseTestResult(result, config.framework);
    } catch (error) {
      return this.createErrorResult(error as Error, config.framework);
    }
  }

  /**
   * Runs tests with coverage analysis
   */
  async runTestsWithCoverage(
    options: TestExecutionOptions = {},
    projectPath: string = process.cwd()
  ): Promise<TestResult> {
    const coverageOptions = { ...options, coverage: true };
    return this.runTests(coverageOptions, projectPath);
  }

  /**
   * Runs specific test files
   */
  async runTestFiles(
    files: string[],
    options: TestExecutionOptions = {},
    projectPath: string = process.cwd()
  ): Promise<TestResult> {
    const fileOptions = { ...options, files };
    return this.runTests(fileOptions, projectPath);
  }

  /**
   * Runs tests matching a pattern
   */
  async runTestsByPattern(
    pattern: string,
    options: TestExecutionOptions = {},
    projectPath: string = process.cwd()
  ): Promise<TestResult> {
    const patternOptions = { ...options, pattern };
    return this.runTests(patternOptions, projectPath);
  }

  /**
   * Gets test discovery information
   */
  async discoverTests(projectPath: string = process.cwd()): Promise<{
    testFiles: string[];
    testTypes: TestType[];
    estimatedDuration: number;
  }> {
    const config = await this.discoverTestConfig(projectPath);
    const testFiles = await this.findTestFiles(projectPath, config);
    const testTypes = this.classifyTestTypes(testFiles);
    const estimatedDuration = this.estimateTestDuration(testFiles.length, testTypes);

    return {
      testFiles,
      testTypes,
      estimatedDuration
    };
  }

  /**
   * Analyzes test coverage
   */
  async analyzeCoverage(projectPath: string = process.cwd()): Promise<TestCoverage | null> {
    const coverageDir = path.join(projectPath, 'coverage');
    const coverageFile = path.join(coverageDir, 'coverage-summary.json');

    try {
      const content = await fs.readFile(coverageFile, 'utf-8');
      const coverage = JSON.parse(content);

      return {
        statements: coverage.total.statements.pct,
        branches: coverage.total.branches.pct,
        functions: coverage.total.functions.pct,
        lines: coverage.total.lines.pct,
        threshold: coverage.threshold || undefined
      };
    } catch {
      return null;
    }
  }

  private async readPackageJson(projectPath: string): Promise<any> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private async findTestConfigFiles(projectPath: string): Promise<string[]> {
    const configFiles: string[] = [];
    const possibleConfigs = [
      'jest.config.js', 'jest.config.ts', 'jest.config.json',
      'vitest.config.js', 'vitest.config.ts', 'vitest.config.json',
      'mocha.opts', '.mocharc.js', '.mocharc.json',
      'cypress.config.js', 'cypress.config.ts',
      'playwright.config.js', 'playwright.config.ts'
    ];

    for (const file of possibleConfigs) {
      try {
        await fs.access(path.join(projectPath, file));
        configFiles.push(file);
      } catch {
        // File doesn't exist
      }
    }

    return configFiles;
  }

  private detectTestFramework(packageJson: any, configFiles: string[]): TestFramework {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps.vitest || configFiles.some(f => f.includes('vitest'))) return TestFramework.VITEST;
    if (deps.jest || configFiles.some(f => f.includes('jest'))) return TestFramework.JEST;
    if (deps.mocha || configFiles.some(f => f.includes('mocha'))) return TestFramework.MOCHA;
    if (deps.jasmine) return TestFramework.JASMINE;
    if (deps.cypress || configFiles.some(f => f.includes('cypress'))) return TestFramework.CYPRESS;
    if (deps['@playwright/test'] || configFiles.some(f => f.includes('playwright'))) return TestFramework.PLAYWRIGHT;
    if (deps['@testing-library/react'] || deps['@testing-library/vue']) return TestFramework.TESTING_LIBRARY;

    return TestFramework.UNKNOWN;
  }

  private extractTestScripts(packageJson: any): string[] {
    const scripts = packageJson.scripts || {};
    const testScripts: string[] = [];

    if (scripts.test) testScripts.push('test');
    if (scripts['test:unit']) testScripts.push('test:unit');
    if (scripts['test:integration']) testScripts.push('test:integration');
    if (scripts['test:e2e']) testScripts.push('test:e2e');
    if (scripts['test:component']) testScripts.push('test:component');

    return testScripts;
  }

  private hasCoverage(packageJson: any, configFiles: string[]): boolean {
    const scripts = packageJson.scripts || {};
    return !!(scripts['test:coverage'] || scripts['test:cov'] ||
              configFiles.some(f => f.includes('jest') || f.includes('vitest')));
  }

  private findConfigFile(framework: TestFramework, configFiles: string[]): string | undefined {
    const frameworkMap: Record<TestFramework, string[]> = {
      [TestFramework.JEST]: ['jest.config.js', 'jest.config.ts', 'jest.config.json'],
      [TestFramework.VITEST]: ['vitest.config.js', 'vitest.config.ts', 'vitest.config.json'],
      [TestFramework.MOCHA]: ['mocha.opts', '.mocharc.js', '.mocharc.json'],
      [TestFramework.CYPRESS]: ['cypress.config.js', 'cypress.config.ts'],
      [TestFramework.PLAYWRIGHT]: ['playwright.config.js', 'playwright.config.ts'],
      [TestFramework.JASMINE]: [],
      [TestFramework.TESTING_LIBRARY]: [],
      [TestFramework.UNKNOWN]: []
    };

    const possibleFiles = frameworkMap[framework] || [];
    return configFiles.find(file => possibleFiles.includes(file));
  }

  private buildTestCommand(config: TestConfig, options: TestExecutionOptions): string {
    const { framework } = config;
    const { type, files, pattern, coverage, watch, verbose, bail } = options;

    let command = '';

    switch (framework) {
      case TestFramework.JEST:
        command = 'npx jest';
        if (coverage || config.coverageEnabled) command += ' --coverage';
        if (watch) command += ' --watch';
        if (verbose) command += ' --verbose';
        if (bail) command += ' --bail';
        if (files && files.length > 0) command += ` ${files.join(' ')}`;
        if (pattern) command += ` --testNamePattern="${pattern}"`;
        break;

      case TestFramework.VITEST:
        command = 'npx vitest run';
        if (coverage || config.coverageEnabled) command += ' --coverage';
        if (watch) command += ' --watch';
        if (verbose) command += ' --reporter=verbose';
        if (bail) command += ' --bail';
        if (files && files.length > 0) command += ` ${files.join(' ')}`;
        if (pattern) command += ` --testNamePattern="${pattern}"`;
        break;

      case TestFramework.MOCHA:
        command = 'npx mocha';
        if (verbose) command += ' --reporter=spec';
        if (bail) command += ' --bail';
        if (files && files.length > 0) command += ` ${files.join(' ')}`;
        if (pattern) command += ` --grep="${pattern}"`;
        break;

      case TestFramework.CYPRESS:
        command = 'npx cypress run';
        if (verbose) command += ' --reporter=spec';
        break;

      case TestFramework.PLAYWRIGHT:
        command = 'npx playwright test';
        if (verbose) command += ' --reporter=line';
        break;

      default:
        throw new Error(`Unsupported test framework: ${framework}`);
    }

    return command;
  }

  private async executeTestCommand(
    command: string,
    projectPath: string,
    timeout: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        cwd: projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Test execution timed out after ${timeout}ms`));
      }, timeout);

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: exitCode || 0 });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private parseTestResult(
    result: { stdout: string; stderr: string; exitCode: number },
    framework: TestFramework
  ): TestResult {
    const { stdout, stderr, exitCode } = result;
    const output = stdout + stderr;

    // Basic parsing - in a real implementation, this would be more sophisticated
    const passed = (output.match(/✓|PASS|passed/g) || []).length;
    const failed = (output.match(/✗|FAIL|failed|Error/g) || []).length;
    const skipped = (output.match(/skip|SKIP/g) || []).length;
    const total = passed + failed + skipped;

    // Extract duration (simplified)
    const durationMatch = output.match(/(\d+(\.\d+)?)\s*(ms|s|sec)/);
    const duration = durationMatch ? parseFloat(durationMatch[1]) * 1000 : 0;

    // Extract errors
    const errors: string[] = [];
    const errorLines = output.split('\n').filter(line =>
      line.includes('Error') || line.includes('FAIL') || line.includes('✗')
    );
    errors.push(...errorLines.slice(0, 10)); // Limit to first 10 errors

    return {
      framework,
      type: TestType.UNIT, // Default, would be determined by analysis
      passed,
      failed,
      skipped,
      total,
      duration,
      errors,
      output
    };
  }

  private createErrorResult(error: Error, framework: TestFramework): TestResult {
    return {
      framework,
      type: TestType.UNIT,
      passed: 0,
      failed: 1,
      skipped: 0,
      total: 1,
      duration: 0,
      errors: [error.message],
      output: error.message
    };
  }

  private async findTestFiles(projectPath: string, config: TestConfig): Promise<string[]> {
    const testFiles: string[] = [];
    const extensions = ['.test.js', '.test.ts', '.test.tsx', '.spec.js', '.spec.ts', '.spec.tsx'];

    async function scan(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scan(fullPath);
          } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
            testFiles.push(path.relative(projectPath, fullPath));
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    }

    await scan(projectPath);
    return testFiles;
  }

  private classifyTestTypes(testFiles: string[]): TestType[] {
    const types = new Set<TestType>();

    for (const file of testFiles) {
      if (file.includes('integration') || file.includes('int')) {
        types.add(TestType.INTEGRATION);
      } else if (file.includes('e2e') || file.includes('end-to-end')) {
        types.add(TestType.E2E);
      } else if (file.includes('component')) {
        types.add(TestType.COMPONENT);
      } else if (file.includes('api')) {
        types.add(TestType.API);
      } else {
        types.add(TestType.UNIT);
      }
    }

    return Array.from(types);
  }

  private estimateTestDuration(fileCount: number, types: TestType[]): number {
    let baseDuration = fileCount * 1000; // 1 second per file average

    // Adjust for test types
    if (types.includes(TestType.E2E)) baseDuration *= 3;
    if (types.includes(TestType.INTEGRATION)) baseDuration *= 2;
    if (types.includes(TestType.COMPONENT)) baseDuration *= 1.5;

    return Math.max(baseDuration, 5000); // Minimum 5 seconds
  }
}