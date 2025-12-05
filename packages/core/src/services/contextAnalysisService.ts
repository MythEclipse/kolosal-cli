// packages/core/src/services/contextAnalysisService.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export enum ProjectType {
  NODEJS = 'nodejs',
  REACT = 'react',
  VUE = 'vue',
  ANGULAR = 'angular',
  EXPRESS = 'express',
  NESTJS = 'nestjs',
  NEXTJS = 'nextjs',
  NUXT = 'nuxt',
  REACT_NATIVE = 'react_native',
  ELECTRON = 'electron',
  CLI_TOOL = 'cli_tool',
  LIBRARY = 'library',
  MONOREPO = 'monorepo',
  UNKNOWN = 'unknown'
}

export enum Language {
  TYPESCRIPT = 'typescript',
  JAVASCRIPT = 'javascript',
  MIXED = 'mixed'
}

export enum Framework {
  EXPRESS = 'express',
  FASTIFY = 'fastify',
  KOA = 'koa',
  NESTJS = 'nestjs',
  REACT = 'react',
  VUE = 'vue',
  ANGULAR = 'angular',
  SVELTE = 'svelte',
  NEXTJS = 'nextjs',
  NUXT = 'nuxt',
  VITE = 'vite',
  WEBPACK = 'webpack',
  ROLLUP = 'rollup',
  ESBUILD = 'esbuild',
  UNKNOWN = 'unknown'
}

export enum TestingFramework {
  JEST = 'jest',
  VITEST = 'vitest',
  MOCHA = 'mocha',
  JASMINE = 'jasmine',
  CYPRESS = 'cypress',
  PLAYWRIGHT = 'playwright',
  TESTING_LIBRARY = 'testing_library',
  UNKNOWN = 'unknown'
}

export interface ProjectContext {
  type: ProjectType;
  language: Language;
  frameworks: Framework[];
  testingFrameworks: TestingFramework[];
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
  hasTypeScript: boolean;
  hasTests: boolean;
  hasLinting: boolean;
  hasBuildScript: boolean;
  dependencies: string[];
  devDependencies: string[];
  scripts: Record<string, string>;
  configFiles: string[];
  sourceDirectories: string[];
  testDirectories: string[];
  buildOutputDirectories: string[];
}

export interface CodePattern {
  name: string;
  description: string;
  examples: string[];
  category: 'architecture' | 'utility' | 'ui' | 'data' | 'testing';
  confidence: number;
}

export interface ContextAnalysisResult {
  projectContext: ProjectContext;
  codePatterns: CodePattern[];
  recommendations: string[];
  confidence: number;
}

export class ContextAnalysisService {
  constructor() {}

  /**
   * Analyzes the project context comprehensively
   */
  async analyzeProjectContext(projectPath: string = process.cwd()): Promise<ContextAnalysisResult> {
    const [
      packageJson,
      directoryStructure,
      configFiles,
      codePatterns
    ] = await Promise.all([
      this.analyzePackageJson(projectPath),
      this.analyzeDirectoryStructure(projectPath),
      this.findConfigFiles(projectPath),
      this.analyzeCodePatterns(projectPath)
    ]);

    const projectContext: ProjectContext = {
      type: this.determineProjectType(packageJson, directoryStructure),
      language: this.determineLanguage(packageJson, directoryStructure),
      frameworks: this.determineFrameworks(packageJson, directoryStructure),
      testingFrameworks: this.determineTestingFrameworks(packageJson),
      packageManager: await this.detectPackageManager(projectPath),
      hasTypeScript: this.hasTypeScript(packageJson, directoryStructure),
      hasTests: this.hasTests(directoryStructure),
      hasLinting: this.hasLinting(packageJson),
      hasBuildScript: this.hasBuildScript(packageJson),
      dependencies: Object.keys(packageJson.dependencies || {}),
      devDependencies: Object.keys(packageJson.devDependencies || {}),
      scripts: packageJson.scripts || {},
      configFiles,
      sourceDirectories: this.findSourceDirectories(directoryStructure),
      testDirectories: this.findTestDirectories(directoryStructure),
      buildOutputDirectories: this.findBuildDirectories(directoryStructure)
    };

    const recommendations = this.generateRecommendations(projectContext);
    const confidence = this.calculateConfidence(projectContext, codePatterns);

    return {
      projectContext,
      codePatterns,
      recommendations,
      confidence
    };
  }

  /**
   * Gets intelligent tool suggestions based on project context
   */
  getToolSuggestions(context: ProjectContext): Array<{
    tool: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }> {
    const suggestions: Array<{ tool: string; reason: string; priority: 'high' | 'medium' | 'low' }> = [];

    // Build tools
    if (!context.hasBuildScript) {
      suggestions.push({
        tool: 'run-build',
        reason: 'Project lacks build script - add automated building',
        priority: 'high'
      });
    }

    // Test tools
    if (!context.hasTests) {
      suggestions.push({
        tool: 'run-build with test action',
        reason: 'No tests detected - add test coverage',
        priority: 'high'
      });
    }

    // Dependency tools
    if (context.dependencies.length > 20) {
      suggestions.push({
        tool: 'manage-dependencies with analyze action',
        reason: 'Large dependency tree - analyze for optimization',
        priority: 'medium'
      });
    }

    // Language-specific tools
    if (context.language === Language.TYPESCRIPT) {
      suggestions.push({
        tool: 'run-build with typecheck action',
        reason: 'TypeScript project - ensure type safety',
        priority: 'high'
      });
    }

    // Framework-specific tools
    if (context.frameworks.includes(Framework.REACT)) {
      suggestions.push({
        tool: 'edit for React components',
        reason: 'React project - use React-aware editing tools',
        priority: 'medium'
      });
    }

    return suggestions;
  }

  /**
   * Analyzes code patterns in the project
   */
  async analyzeCodePatterns(projectPath: string): Promise<CodePattern[]> {
    const patterns: CodePattern[] = [];
    const sourceDirs = ['src', 'lib', 'packages', 'components', 'pages'];

    for (const dir of sourceDirs) {
      try {
        const dirPath = path.join(projectPath, dir);
        const files = await this.getFilesRecursively(dirPath);

        for (const file of files) {
          if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
            const filePatterns = await this.analyzeFilePatterns(file);
            patterns.push(...filePatterns);
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    // Remove duplicates and sort by confidence
    const uniquePatterns = this.deduplicatePatterns(patterns);
    return uniquePatterns.sort((a, b) => b.confidence - a.confidence);
  }

  private async analyzePackageJson(projectPath: string): Promise<any> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private async analyzeDirectoryStructure(projectPath: string): Promise<string[]> {
    const structure: string[] = [];

    async function scan(dir: string, prefix = '') {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = prefix + entry.name;

          if (entry.isDirectory()) {
            structure.push(relativePath + '/');
            await scan(fullPath, relativePath + '/');
          } else {
            structure.push(relativePath);
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    }

    await scan(projectPath);
    return structure;
  }

  private async findConfigFiles(projectPath: string): Promise<string[]> {
    const configFiles: string[] = [];
    const commonConfigs = [
      'package.json', 'tsconfig.json', 'jsconfig.json',
      'webpack.config.js', 'vite.config.js', 'rollup.config.js',
      'esbuild.config.js', 'babel.config.js', '.babelrc',
      'jest.config.js', 'vitest.config.js', '.eslintrc.js',
      'prettier.config.js', '.prettierrc', '.gitignore',
      'Dockerfile', 'docker-compose.yml', '.env.example'
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

  private determineProjectType(packageJson: any, structure: string[]): ProjectType {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    // Check for monorepo
    if (structure.some(s => s.includes('packages/') || s.includes('workspaces'))) {
      return ProjectType.MONOREPO;
    }

    // Check for specific frameworks
    if (deps.next) return ProjectType.NEXTJS;
    if (deps.nuxt) return ProjectType.NUXT;
    if (deps['@angular/core']) return ProjectType.ANGULAR;
    if (deps.vue) return ProjectType.VUE;
    if (deps.react) return ProjectType.REACT;
    if (deps['react-native']) return ProjectType.REACT_NATIVE;
    if (deps.electron) return ProjectType.ELECTRON;
    if (deps['@nestjs/core']) return ProjectType.NESTJS;
    if (deps.express) return ProjectType.EXPRESS;

    // Check for CLI tools
    if (packageJson.bin || structure.some(s => s.includes('bin/'))) {
      return ProjectType.CLI_TOOL;
    }

    // Check for libraries
    if (packageJson.main || packageJson.module || packageJson.exports) {
      return ProjectType.LIBRARY;
    }

    // Default to Node.js
    if (deps.node || structure.some(s => s.includes('package.json'))) {
      return ProjectType.NODEJS;
    }

    return ProjectType.UNKNOWN;
  }

  private determineLanguage(packageJson: any, structure: string[]): Language {
    const hasTS = structure.some(s => s.endsWith('.ts') || s.endsWith('.tsx'));
    const hasJS = structure.some(s => s.endsWith('.js') || s.endsWith('.jsx'));

    if (hasTS && !hasJS) return Language.TYPESCRIPT;
    if (!hasTS && hasJS) return Language.JAVASCRIPT;
    if (hasTS && hasJS) return Language.MIXED;

    return Language.JAVASCRIPT; // Default
  }

  private determineFrameworks(packageJson: any, structure: string[]): Framework[] {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const frameworks: Framework[] = [];

    if (deps.express) frameworks.push(Framework.EXPRESS);
    if (deps.fastify) frameworks.push(Framework.FASTIFY);
    if (deps.koa) frameworks.push(Framework.KOA);
    if (deps['@nestjs/core']) frameworks.push(Framework.NESTJS);
    if (deps.react) frameworks.push(Framework.REACT);
    if (deps.vue) frameworks.push(Framework.VUE);
    if (deps['@angular/core']) frameworks.push(Framework.ANGULAR);
    if (deps.svelte) frameworks.push(Framework.SVELTE);
    if (deps.next) frameworks.push(Framework.NEXTJS);
    if (deps.nuxt) frameworks.push(Framework.NUXT);
    if (deps.vite) frameworks.push(Framework.VITE);
    if (deps.webpack) frameworks.push(Framework.WEBPACK);
    if (deps.rollup) frameworks.push(Framework.ROLLUP);
    if (deps.esbuild) frameworks.push(Framework.ESBUILD);

    return frameworks;
  }

  private determineTestingFrameworks(packageJson: any): TestingFramework[] {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const frameworks: TestingFramework[] = [];

    if (deps.jest) frameworks.push(TestingFramework.JEST);
    if (deps.vitest) frameworks.push(TestingFramework.VITEST);
    if (deps.mocha) frameworks.push(TestingFramework.MOCHA);
    if (deps.jasmine) frameworks.push(TestingFramework.JASMINE);
    if (deps.cypress) frameworks.push(TestingFramework.CYPRESS);
    if (deps['@playwright/test']) frameworks.push(TestingFramework.PLAYWRIGHT);
    if (deps['@testing-library/react'] || deps['@testing-library/vue']) {
      frameworks.push(TestingFramework.TESTING_LIBRARY);
    }

    return frameworks;
  }

  private async detectPackageManager(projectPath: string): Promise<'npm' | 'yarn' | 'pnpm' | 'bun'> {
    const managers = [
      { name: 'pnpm' as const, file: 'pnpm-lock.yaml' },
      { name: 'yarn' as const, file: 'yarn.lock' },
      { name: 'bun' as const, file: 'bun.lockb' },
      { name: 'npm' as const, file: 'package-lock.json' }
    ];

    for (const manager of managers) {
      try {
        await fs.access(path.join(projectPath, manager.file));
        return manager.name;
      } catch {
        // Continue
      }
    }

    return 'npm'; // Default
  }

  private hasTypeScript(packageJson: any, structure: string[]): boolean {
    return packageJson.devDependencies?.typescript ||
           packageJson.devDependencies?.['@types/node'] ||
           structure.some(s => s.endsWith('tsconfig.json'));
  }

  private hasTests(structure: string[]): boolean {
    return structure.some(s =>
      s.includes('test') ||
      s.includes('spec') ||
      s.includes('__tests__') ||
      s.endsWith('.test.js') ||
      s.endsWith('.test.ts') ||
      s.endsWith('.spec.js') ||
      s.endsWith('.spec.ts')
    );
  }

  private hasLinting(packageJson: any): boolean {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    return !!(deps.eslint || deps.tslint || deps.prettier);
  }

  private hasBuildScript(packageJson: any): boolean {
    const scripts = packageJson.scripts || {};
    return !!(scripts.build || scripts.compile || scripts['build:prod']);
  }

  private findSourceDirectories(structure: string[]): string[] {
    const dirs = ['src', 'lib', 'packages', 'components', 'pages', 'app'];
    return dirs.filter(dir => structure.some(s => s.startsWith(dir + '/')));
  }

  private findTestDirectories(structure: string[]): string[] {
    const dirs = ['test', 'tests', 'spec', 'specs', '__tests__'];
    return dirs.filter(dir => structure.some(s => s.startsWith(dir + '/')));
  }

  private findBuildDirectories(structure: string[]): string[] {
    const dirs = ['dist', 'build', 'out', '.next', '.nuxt', 'coverage'];
    return dirs.filter(dir => structure.some(s => s.startsWith(dir + '/')));
  }

  private async analyzeFilePatterns(filePath: string): Promise<CodePattern[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const patterns: CodePattern[] = [];

      // React patterns
      if (content.includes('React') || content.includes('useState') || content.includes('useEffect')) {
        patterns.push({
          name: 'React Hooks',
          description: 'Uses React Hooks for state management',
          examples: ['useState', 'useEffect', 'useContext'],
          category: 'ui',
          confidence: 0.9
        });
      }

      // Express patterns
      if (content.includes('express') || content.includes('app.get') || content.includes('app.post')) {
        patterns.push({
          name: 'Express Routes',
          description: 'Express.js web server with route handlers',
          examples: ['app.get()', 'app.post()', 'middleware'],
          category: 'architecture',
          confidence: 0.95
        });
      }

      // Database patterns
      if (content.includes('mongoose') || content.includes('Schema') || content.includes('model(')) {
        patterns.push({
          name: 'Mongoose ODM',
          description: 'MongoDB object modeling with Mongoose',
          examples: ['Schema', 'model()', 'connect()'],
          category: 'data',
          confidence: 0.9
        });
      }

      // Testing patterns
      if (content.includes('describe(') || content.includes('it(') || content.includes('test(')) {
        patterns.push({
          name: 'Unit Tests',
          description: 'Unit testing with describe/it blocks',
          examples: ['describe()', 'it()', 'expect()'],
          category: 'testing',
          confidence: 0.95
        });
      }

      // Utility patterns
      if (content.includes('lodash') || content.includes('_.') || content.includes('fp.')) {
        patterns.push({
          name: 'Functional Utilities',
          description: 'Functional programming utilities',
          examples: ['lodash', 'ramda', 'functional patterns'],
          category: 'utility',
          confidence: 0.8
        });
      }

      return patterns;
    } catch {
      return [];
    }
  }

  private deduplicatePatterns(patterns: CodePattern[]): CodePattern[] {
    const seen = new Set<string>();
    return patterns.filter(pattern => {
      const key = `${pattern.name}-${pattern.category}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private generateRecommendations(context: ProjectContext): string[] {
    const recommendations: string[] = [];

    if (!context.hasTypeScript && context.language === Language.JAVASCRIPT) {
      recommendations.push('Consider migrating to TypeScript for better type safety');
    }

    if (!context.hasTests) {
      recommendations.push('Add comprehensive test coverage to ensure code reliability');
    }

    if (!context.hasLinting) {
      recommendations.push('Implement linting and code formatting for consistent code quality');
    }

    if (context.dependencies.length > 50) {
      recommendations.push('Large dependency tree detected - consider dependency analysis and cleanup');
    }

    if (context.type === ProjectType.UNKNOWN) {
      recommendations.push('Project type unclear - add more specific configuration files');
    }

    return recommendations;
  }

  private calculateConfidence(context: ProjectContext, patterns: CodePattern[]): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on detected features
    if (context.configFiles.length > 5) confidence += 0.2;
    if (context.hasTypeScript) confidence += 0.1;
    if (context.hasTests) confidence += 0.1;
    if (context.hasLinting) confidence += 0.1;
    if (patterns.length > 3) confidence += 0.1;
    if (context.type !== ProjectType.UNKNOWN) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private async getFilesRecursively(dir: string): Promise<string[]> {
    const files: string[] = [];

    async function scan(currentDir: string) {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scan(fullPath);
          } else if (entry.isFile()) {
            files.push(fullPath);
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    }

    await scan(dir);
    return files;
  }
}
