/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { CodeBuilder } from './CodeBuilder.js';

export interface ProjectFile {
  path: string;
  content: string | CodeBuilder;
}

export class ProjectBuilder {
  private files: ProjectFile[] = [];
  private packageJson: Record<string, unknown> | null = null;

  /**
   * Add a file to the project
   * @param filePath Relative path within the project
   * @param content Either a CodeBuilder instance or raw string content
   */
  file(filePath: string, content: string | CodeBuilder): this {
    this.files.push({ path: filePath, content });
    return this;
  }

  /**
   * Configure package.json
   */
  package(config: {
    name: string;
    version?: string;
    description?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  }): this {
    this.packageJson = {
      name: config.name,
      version: config.version || '1.0.0',
      description: config.description || '',
      type: 'module',
      main: 'dist/index.js',
      scripts: config.scripts || {
        build: 'tsc',
        start: 'node dist/index.js',
      },
      dependencies: config.dependencies || {},
      devDependencies: {
        typescript: '^5.3.3',
        '@types/node': '^20.11.24',
        ...config.devDependencies,
      },
    };
    return this;
  }

  /**
   * Generate the project to the specified directory
   */
  async generate(outputDir: string): Promise<void> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write files
    for (const file of this.files) {
      const filePath = path.join(outputDir, file.path);
      const dir = path.dirname(filePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const content =
        typeof file.content === 'string' ? file.content : file.content.build();

      fs.writeFileSync(filePath, content);
    }

    // Write package.json if configured
    if (this.packageJson) {
      fs.writeFileSync(
        path.join(outputDir, 'package.json'),
        JSON.stringify(this.packageJson, null, 2),
      );
    }

    // Write default tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ['src/**/*'],
    };

    fs.writeFileSync(
      path.join(outputDir, 'tsconfig.json'),
      JSON.stringify(tsconfig, null, 2),
    );
  }
}

/**
 * Factory function to create a new ProjectBuilder
 */
export function project(): ProjectBuilder {
  return new ProjectBuilder();
}
