// packages/core/src/services/buildService.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

export enum BuildSystem {
  WEBPACK = 'webpack',
  VITE = 'vite',
  ROLLUP = 'rollup',
  ESBUILD = 'esbuild',
  TSC = 'tsc',
  BABEL = 'babel',
  PARCEL = 'parcel',
  SNOWPACK = 'snowpack',
  UNKNOWN = 'unknown'
}

export enum TestFramework {
  JEST = 'jest',
  VITEST = 'vitest',
  MOCHA = 'mocha',
  JASMINE = 'jasmine',
  CYPRESS = 'cypress',
  PLAYWRIGHT = 'playwright',
  UNKNOWN = 'unknown'
}

export enum LintFramework {
  ESLINT = 'eslint',
  TSLINT = 'tslint',
  PRETTIER = 'prettier',
  STYLELINT = 'stylelint',
  UNKNOWN = 'unknown'
}

export interface BuildConfig {
  buildSystem: BuildSystem;
  testFramework: TestFramework;
  lintFramework: LintFramework;
  scripts: Record<string, string>;
  configFiles: string[];
}

export interface BuildResult {
  success: boolean;
  duration: number;
  output: string;
  errors: string[];
  warnings: string[];
}

export interface TestResult {
  success: boolean;
  duration: number;
  passed: number;
  failed: number;
  total: number;
  coverage?: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
  output: string;
}

export interface LintResult {
  success: boolean;
  duration: number;
  errorCount: number;
  warningCount: number;
  fixableCount: number;
  output: string;
}

export class BuildService {
  constructor() {}

  /**
   * Detects the build configuration of a project
   */
  async detectBuildConfig(projectPath: string = process.cwd()): Promise<BuildConfig> {
    const packageJsonPath = path.join(projectPath, 'package.json');

    let scripts: Record<string, string> = {};
    let configFiles: string[] = [];

    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      scripts = packageJson.scripts || {};
    } catch {
      // Continue without package.json
    }

    // Detect build system
    const buildSystem = await this.detectBuildSystem(projectPath);

    // Detect test framework
    const testFramework = await this.detectTestFramework(projectPath);

    // Detect lint framework
    const lintFramework = await this.detectLintFramework(projectPath);

    // Find config files
    configFiles = await this.findConfigFiles(projectPath);

    return {
      buildSystem,
      testFramework,
      lintFramework,
      scripts,
      configFiles
    };
  }

  /**
   * Runs the build process
   */
  async runBuild(
    projectPath: string = process.cwd(),
    buildConfig?: BuildConfig
  ): Promise<BuildResult> {
    const startTime = Date.now();
    const config = buildConfig || await this.detectBuildConfig(projectPath);

    // Try to find build script
    const buildScript = config.scripts['build'] || config.scripts['build:prod'] || config.scripts['compile'];

    if (!buildScript) {
      // Try common build commands based on detected build system
      const command = this.getBuildCommand(config.buildSystem);
      if (command) {
        return this.runCommand(command, projectPath, startTime);
      }

      return {
        success: false,
        duration: Date.now() - startTime,
        output: 'No build script found in package.json',
        errors: ['No build script configured'],
        warnings: []
      };
    }

    // Run the build script
    return this.runCommand(['npm', 'run', buildScript.split(' ')[0]], projectPath, startTime);
  }

  /**
   * Runs tests
   */
  async runTests(
    projectPath: string = process.cwd(),
    buildConfig?: BuildConfig
  ): Promise<TestResult> {
    const startTime = Date.now();
    const config = buildConfig || await this.detectBuildConfig(projectPath);

    // Try to find test script
    const testScript = config.scripts['test'] || config.scripts['test:unit'] || config.scripts['test:ci'];

    if (!testScript) {
      // Try common test commands
      const command = this.getTestCommand(config.testFramework);
      if (command) {
        return this.parseTestResult(await this.runCommand(command, projectPath, startTime));
      }

      return {
        success: false,
        duration: Date.now() - startTime,
        passed: 0,
        failed: 0,
        total: 0,
        output: 'No test script found'
      };
    }

    // Run the test script
    const result = await this.runCommand(['npm', 'run', testScript.split(' ')[0]], projectPath, startTime);
    return this.parseTestResult(result);
  }

  /**
   * Runs linting
   */
  async runLint(
    projectPath: string = process.cwd(),
    buildConfig?: BuildConfig,
    fix: boolean = false
  ): Promise<LintResult> {
    const startTime = Date.now();
    const config = buildConfig || await this.detectBuildConfig(projectPath);

    // Try to find lint script
    const lintScript = config.scripts['lint'] || config.scripts['lint:check'] || config.scripts['lint:fix'];

    if (!lintScript) {
      // Try common lint commands
      const command = this.getLintCommand(config.lintFramework, fix);
      if (command) {
        return this.parseLintResult(await this.runCommand(command, projectPath, startTime));
      }

      return {
        success: false,
        duration: Date.now() - startTime,
        errorCount: 0,
        warningCount: 0,
        fixableCount: 0,
        output: 'No lint script found'
      };
    }

    // Run the lint script
    const scriptName = fix && config.scripts['lint:fix'] ? 'lint:fix' : 'lint';
    const result = await this.runCommand(['npm', 'run', scriptName], projectPath, startTime);
    return this.parseLintResult(result);
  }

  /**
   * Runs type checking
   */
  async runTypeCheck(projectPath: string = process.cwd()): Promise<BuildResult> {
    const startTime = Date.now();

    // Check if TypeScript is available
    try {
      await fs.access(path.join(projectPath, 'tsconfig.json'));
      return this.runCommand(['npx', 'tsc', '--noEmit'], projectPath, startTime);
    } catch {
      // No TypeScript config
      return {
        success: false,
        duration: Date.now() - startTime,
        output: 'No TypeScript configuration found',
        errors: ['TypeScript not configured'],
        warnings: []
      };
    }
  }

  /**
   * Cleans build artifacts
   */
  async cleanBuild(projectPath: string = process.cwd()): Promise<BuildResult> {
    const startTime = Date.now();

    // Try clean script first
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      if (packageJson.scripts?.clean) {
        return this.runCommand(['npm', 'run', 'clean'], projectPath, startTime);
      }
    } catch {
      // Continue
    }

    // Default clean: remove common build directories
    const commonDirs = ['dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.cache'];

    for (const dir of commonDirs) {
      try {
        await fs.rm(path.join(projectPath, dir), { recursive: true, force: true });
      } catch {
        // Directory doesn't exist or can't be removed
      }
    }

    return {
      success: true,
      duration: Date.now() - startTime,
      output: 'Build artifacts cleaned',
      errors: [],
      warnings: []
    };
  }

  private async detectBuildSystem(projectPath: string): Promise<BuildSystem> {
    const configFiles = await fs.readdir(projectPath);

    if (configFiles.includes('vite.config.js') || configFiles.includes('vite.config.ts')) {
      return BuildSystem.VITE;
    }
    if (configFiles.includes('webpack.config.js') || configFiles.includes('webpack.config.ts')) {
      return BuildSystem.WEBPACK;
    }
    if (configFiles.includes('rollup.config.js') || configFiles.includes('rollup.config.ts')) {
      return BuildSystem.ROLLUP;
    }
    if (configFiles.includes('esbuild.config.js') || configFiles.includes('esbuild.config.ts')) {
      return BuildSystem.ESBUILD;
    }
    if (configFiles.includes('tsconfig.json')) {
      return BuildSystem.TSC;
    }
    if (configFiles.includes('babel.config.js') || configFiles.includes('.babelrc')) {
      return BuildSystem.BABEL;
    }
    if (configFiles.includes('parcelrc') || configFiles.includes('.parcelrc')) {
      return BuildSystem.PARCEL;
    }

    return BuildSystem.UNKNOWN;
  }

  private async detectTestFramework(projectPath: string): Promise<TestFramework> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (deps.vitest) return TestFramework.VITEST;
      if (deps.jest) return TestFramework.JEST;
      if (deps.mocha) return TestFramework.MOCHA;
      if (deps.jasmine) return TestFramework.JASMINE;
      if (deps.cypress) return TestFramework.CYPRESS;
      if (deps['@playwright/test']) return TestFramework.PLAYWRIGHT;

    } catch {
      // Continue
    }

    return TestFramework.UNKNOWN;
  }

  private async detectLintFramework(projectPath: string): Promise<LintFramework> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (deps.eslint) return LintFramework.ESLINT;
      if (deps.tslint) return LintFramework.TSLINT;
      if (deps.prettier) return LintFramework.PRETTIER;
      if (deps.stylelint) return LintFramework.STYLELINT;

    } catch {
      // Continue
    }

    return LintFramework.UNKNOWN;
  }

  private async findConfigFiles(projectPath: string): Promise<string[]> {
    const configFiles: string[] = [];
    const commonConfigs = [
      'package.json', 'tsconfig.json', 'jsconfig.json',
      'webpack.config.js', 'vite.config.js', 'rollup.config.js',
      'esbuild.config.js', 'babel.config.js', '.babelrc',
      'jest.config.js', 'vitest.config.js', '.eslintrc.js',
      'prettier.config.js', '.prettierrc'
    ];

    for (const file of commonConfigs) {
      try {
        await fs.access(path.join(projectPath, file));
        configFiles.push(file);
      } catch {
        // File doesn't exist
      }
    }

    return configFiles;
  }

  private getBuildCommand(buildSystem: BuildSystem): string[] | null {
    switch (buildSystem) {
      case BuildSystem.VITE:
        return ['npx', 'vite', 'build'];
      case BuildSystem.WEBPACK:
        return ['npx', 'webpack', '--mode=production'];
      case BuildSystem.ROLLUP:
        return ['npx', 'rollup', '-c'];
      case BuildSystem.ESBUILD:
        return ['npx', 'esbuild', '--bundle'];
      case BuildSystem.TSC:
        return ['npx', 'tsc'];
      case BuildSystem.BABEL:
        return ['npx', 'babel', 'src', '--out-dir', 'dist'];
      default:
        return null;
    }
  }

  private getTestCommand(testFramework: TestFramework): string[] | null {
    switch (testFramework) {
      case TestFramework.JEST:
        return ['npx', 'jest'];
      case TestFramework.VITEST:
        return ['npx', 'vitest', 'run'];
      case TestFramework.MOCHA:
        return ['npx', 'mocha'];
      case TestFramework.JASMINE:
        return ['npx', 'jasmine'];
      default:
        return null;
    }
  }

  private getLintCommand(lintFramework: LintFramework, fix: boolean): string[] | null {
    const fixFlag = fix ? '--fix' : '';

    switch (lintFramework) {
      case LintFramework.ESLINT:
        return ['npx', 'eslint', '.', fixFlag].filter(Boolean);
      case LintFramework.PRETTIER:
        return ['npx', 'prettier', '--check', '.'];
      case LintFramework.STYLELINT:
        return ['npx', 'stylelint', '**/*.{css,scss,sass}', fixFlag].filter(Boolean);
      default:
        return null;
    }
  }

  private async runCommand(
    command: string[],
    cwd: string,
    startTime: number
  ): Promise<BuildResult> {
    return new Promise((resolve) => {
      const [cmd, ...args] = command;
      const child = spawn(cmd, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const duration = Date.now() - startTime;
        const success = code === 0;
        const output = stdout + stderr;
        const errors = stderr ? stderr.split('\n').filter(line => line.trim()) : [];
        const warnings = stdout.split('\n').filter(line =>
          line.toLowerCase().includes('warning') ||
          line.toLowerCase().includes('warn')
        );

        resolve({
          success,
          duration,
          output,
          errors,
          warnings
        });
      });

      child.on('error', (error) => {
        const duration = Date.now() - startTime;
        resolve({
          success: false,
          duration,
          output: stdout,
          errors: [error.message],
          warnings: []
        });
      });
    });
  }

  private parseTestResult(buildResult: BuildResult): TestResult {
    // Basic parsing - could be enhanced for specific test frameworks
    const output = buildResult.output.toLowerCase();

    let passed = 0;
    let failed = 0;
    let total = 0;

    // Try to extract numbers from output
    const passMatch = output.match(/(\d+)\s*(?:passing|passed|pass)/i);
    const failMatch = output.match(/(\d+)\s*(?:failing|failed|fail)/i);
    const totalMatch = output.match(/(\d+)\s*(?:tests?|specs?|suites?)/i);

    if (passMatch) passed = parseInt(passMatch[1]);
    if (failMatch) failed = parseInt(failMatch[1]);
    if (totalMatch) total = parseInt(totalMatch[1]);

    // If we couldn't parse, assume all tests passed if build succeeded
    if (total === 0 && buildResult.success) {
      total = passed = 1;
    }

    return {
      success: buildResult.success && failed === 0,
      duration: buildResult.duration,
      passed,
      failed,
      total,
      output: buildResult.output
    };
  }

  private parseLintResult(buildResult: BuildResult): LintResult {
    // Basic parsing - could be enhanced for specific lint frameworks
    const output = buildResult.output.toLowerCase();

    let errorCount = 0;
    let warningCount = 0;
    let fixableCount = 0;

    const errorMatch = output.match(/(\d+)\s*(?:errors?|problems?)/i);
    const warningMatch = output.match(/(\d+)\s*warnings?/i);
    const fixableMatch = output.match(/(\d+)\s*(?:fixable|auto-fixable)/i);

    if (errorMatch) errorCount = parseInt(errorMatch[1]);
    if (warningMatch) warningCount = parseInt(warningMatch[1]);
    if (fixableMatch) fixableCount = parseInt(fixableMatch[1]);

    return {
      success: buildResult.success && errorCount === 0,
      duration: buildResult.duration,
      errorCount,
      warningCount,
      fixableCount,
      output: buildResult.output
    };
  }
}
