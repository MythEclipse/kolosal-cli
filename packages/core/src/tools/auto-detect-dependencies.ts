/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
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
 * Parameters for the AutoDetectDependencies tool
 */
export interface AutoDetectDependenciesToolParams {
  /**
   * The absolute path to the project directory
   */
  project_path?: string;
  
  /**
   * Whether to automatically install detected missing dependencies
   */
  auto_install?: boolean;
}

interface ImportStatement {
  module: string;
  isLocal: boolean;
  filePath: string;
  line: number;
}

interface MissingDependency {
  name: string;
  count: number;
  files: string[];
}

class AutoDetectDependenciesToolInvocation extends BaseToolInvocation<
  AutoDetectDependenciesToolParams,
  ToolResult
> {
  private readonly dependencyService: DependencyService;

  constructor(
    private readonly config: Config,
    params: AutoDetectDependenciesToolParams,
  ) {
    super(params);
    this.dependencyService = new DependencyService();
  }

  override getDescription(): string {
    const projectPath = this.params.project_path || this.config.getTargetDir();
    const relativePath = path.relative(
      this.config.getTargetDir(),
      projectPath,
    );
    return `Auto-detecting missing dependencies at ${relativePath}`;
  }

  async execute(_abortSignal: AbortSignal): Promise<ToolResult> {
    try {
      const projectPath = this.params.project_path || this.config.getTargetDir();
      
      // Get project dependencies from package.json
      const packageJsonPath = path.join(projectPath, 'package.json');
      let packageJson: any = {};
      
      try {
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
        packageJson = JSON.parse(packageJsonContent);
      } catch (error) {
        return {
          llmContent: `Error reading package.json: ${error instanceof Error ? error.message : String(error)}`,
          returnDisplay: `Error reading package.json: ${error instanceof Error ? error.message : String(error)}`,
          error: {
            message: `Error reading package.json: ${error instanceof Error ? error.message : String(error)}`,
            type: ToolErrorType.DEPENDENCY_DETECTION_ERROR,
          },
        };
      }
      
      // Get all declared dependencies
      const declaredDeps = new Set([
        ...Object.keys(packageJson.dependencies || {}),
        ...Object.keys(packageJson.devDependencies || {}),
        ...Object.keys(packageJson.peerDependencies || {}),
        ...Object.keys(packageJson.optionalDependencies || {})
      ]);
      
      // Scan source files for import statements
      const importStatements = await this.scanForImportStatements(projectPath);
      
      // Filter out local imports (those starting with . or /)
      const externalImports = importStatements.filter(imp => !imp.isLocal);
      
      // Count occurrences of each external import
      const importCounts = new Map<string, number>();
      const importFiles = new Map<string, string[]>();
      
      for (const imp of externalImports) {
        const count = importCounts.get(imp.module) || 0;
        importCounts.set(imp.module, count + 1);
        
        const files = importFiles.get(imp.module) || [];
        if (!files.includes(imp.filePath)) {
          files.push(imp.filePath);
        }
        importFiles.set(imp.module, files);
      }
      
      // Find missing dependencies (external imports not in package.json)
      const missingDependencies: MissingDependency[] = [];
      
      for (const [moduleName, count] of importCounts.entries()) {
        // Skip built-in Node.js modules
        if (this.isBuiltInModule(moduleName)) {
          continue;
        }
        
        // Check if module is declared in package.json
        if (!declaredDeps.has(moduleName)) {
          missingDependencies.push({
            name: moduleName,
            count,
            files: importFiles.get(moduleName) || []
          });
        }
      }
      
      // Format results
      let resultMessage = `Auto Dependency Detection Results:
- Scanned ${importStatements.length} import statements
- Found ${externalImports.length} external imports
- Detected ${missingDependencies.length} missing dependencies`;

      if (missingDependencies.length > 0) {
        resultMessage += '\n\nMissing Dependencies:\n';
        resultMessage += missingDependencies
          .map(dep => `- ${dep.name} (imported ${dep.count} times in ${dep.files.length} files)`)
          .join('\n');
          
        // Show files where each missing dependency is used
        resultMessage += '\n\nDetailed Usage:';
        for (const dep of missingDependencies) {
          resultMessage += `\n${dep.name}:\n  ${dep.files.map(f => path.relative(projectPath, f)).join('\n  ')}`;
        }
      } else {
        resultMessage += '\n\nAll dependencies appear to be properly declared.';
      }
      
      // Auto-install if requested
      if (this.params.auto_install && missingDependencies.length > 0) {
        resultMessage += '\n\nInstalling missing dependencies...';
        
        const packageManager = await this.dependencyService.detectPackageManager(projectPath);
        const packageNames = missingDependencies.map(dep => dep.name);
        
        // Install each dependency individually to handle errors better
        const installResults = [];
        for (const packageName of packageNames) {
          try {
            const result = await this.dependencyService.addDependency(
              packageName,
              undefined,
              undefined, // default to regular dependency
              projectPath,
              packageManager
            );
            
            installResults.push({
              name: packageName,
              success: result.success,
              output: result.output,
              error: result.error
            });
          } catch (error) {
            installResults.push({
              name: packageName,
              success: false,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
        
        // Add installation results to message
        resultMessage += '\n\nInstallation Results:\n';
        resultMessage += installResults
          .map(res => `- ${res.name}: ${res.success ? 'SUCCESS' : `FAILED - ${res.error}`}`)
          .join('\n');
      }
      
      return {
        llmContent: resultMessage,
        returnDisplay: resultMessage,
      };
    } catch (error) {
      const errorMsg = `Error detecting dependencies: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: errorMsg,
        returnDisplay: errorMsg,
        error: {
          message: errorMsg,
          type: ToolErrorType.DEPENDENCY_DETECTION_ERROR,
        },
      };
    }
  }
  
  private async scanForImportStatements(projectPath: string): Promise<ImportStatement[]> {
    const importStatements: ImportStatement[] = [];
    
    // Get all source files
    const sourceFiles = await this.getSourceFiles(projectPath);
    
    // Scan each file for import statements
    for (const filePath of sourceFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Match ES6 import statements
          const es6ImportMatch = line.match(/^import\s+(?:.*from\s+)?['"]([^'"]+)['"]/);
          if (es6ImportMatch) {
            const moduleName = es6ImportMatch[1];
            importStatements.push({
              module: moduleName,
              isLocal: moduleName.startsWith('.') || moduleName.startsWith('/'),
              filePath,
              line: i + 1
            });
            continue;
          }
          
          // Match CommonJS require statements
          const requireMatch = line.match(/require\(['"]([^'"]+)['"]\)/);
          if (requireMatch) {
            const moduleName = requireMatch[1];
            importStatements.push({
              module: moduleName,
              isLocal: moduleName.startsWith('.') || moduleName.startsWith('/'),
              filePath,
              line: i + 1
            });
            continue;
          }
          
          // Match dynamic import statements
          const dynamicImportMatch = line.match(/import\(['"]([^'"]+)['"]\)/);
          if (dynamicImportMatch) {
            const moduleName = dynamicImportMatch[1];
            importStatements.push({
              module: moduleName,
              isLocal: moduleName.startsWith('.') || moduleName.startsWith('/'),
              filePath,
              line: i + 1
            });
            continue;
          }
        }
      } catch (error) {
        // Skip files that can't be read
        console.warn(`Could not read file ${filePath}:`, error);
      }
    }
    
    return importStatements;
  }
  
  private async getSourceFiles(projectPath: string): Promise<string[]> {
    const sourceFiles: string[] = [];
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
    
    async function scan(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          // Skip node_modules and other common directories
          if (entry.name === 'node_modules' || 
              entry.name === '.git' || 
              entry.name === 'dist' || 
              entry.name === 'build') {
            continue;
          }
          
          if (entry.isDirectory()) {
            await scan(fullPath);
          } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
            sourceFiles.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories that can't be accessed
        console.warn(`Could not access directory ${dir}:`, error);
      }
    }
    
    await scan(projectPath);
    return sourceFiles;
  }
  
  private isBuiltInModule(moduleName: string): boolean {
    // List of common built-in Node.js modules
    const builtInModules = [
      'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
      'constants', 'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http',
      'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
      'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
      'string_decoder', 'timers', 'tls', 'trace_events', 'tty', 'url',
      'util', 'v8', 'vm', 'worker_threads', 'zlib'
    ];
    
    // Handle scoped built-ins like node:fs
    if (moduleName.startsWith('node:')) {
      return true;
    }
    
    return builtInModules.includes(moduleName);
  }
}

/**
 * Implementation of the AutoDetectDependencies tool logic
 */
export class AutoDetectDependenciesTool extends BaseDeclarativeTool<AutoDetectDependenciesToolParams, ToolResult> {
  static readonly Name: string = 'auto_detect_dependencies';

  constructor(private readonly config: Config) {
    super(
      AutoDetectDependenciesTool.Name,
      'AutoDetectDependencies',
      `Automatically detects missing dependencies by scanning source code for import statements.
      
This tool analyzes JavaScript/TypeScript files to find:
- External module imports that are not declared in package.json
- Usage patterns of undeclared dependencies
- Files that import missing dependencies
      
Optionally, it can automatically install the missing dependencies.`,
      Kind.Read,
      {
        properties: {
          project_path: {
            description: "The absolute path to the project directory (defaults to current working directory)",
            type: 'string',
          },
          auto_install: {
            description: "Whether to automatically install detected missing dependencies",
            type: 'boolean',
          }
        },
        required: [],
        type: 'object',
      },
    );
  }

  protected override validateToolParamValues(
    params: AutoDetectDependenciesToolParams,
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
    params: AutoDetectDependenciesToolParams,
  ): ToolInvocation<AutoDetectDependenciesToolParams, ToolResult> {
    return new AutoDetectDependenciesToolInvocation(this.config, params);
  }
}