// packages/core/src/services/dependencyService.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

export enum PackageManager {
  NPM = 'npm',
  YARN = 'yarn',
  PNPM = 'pnpm',
  BUN = 'bun'
}

export enum DependencyType {
  DEPENDENCY = 'dependency',
  DEV_DEPENDENCY = 'devDependency',
  PEER_DEPENDENCY = 'peerDependency',
  OPTIONAL_DEPENDENCY = 'optionalDependency'
}

export interface DependencyInfo {
  name: string;
  version: string;
  type: DependencyType;
  isInstalled: boolean;
  latestVersion?: string;
  vulnerabilities?: VulnerabilityInfo[];
  license?: string;
  size?: number;
}

export interface VulnerabilityInfo {
  severity: 'low' | 'moderate' | 'high' | 'critical';
  title: string;
  description: string;
  package: string;
  patched_versions: string[];
  recommendation: string;
}

export interface DependencyConflict {
  name: string;
  versions: Array<{
    version: string;
    sources: string[]; // Packages that require this version
  }>;
  recommendedVersion: string;
  resolution: 'update' | 'pin' | 'manual';
  severity: 'low' | 'medium' | 'high';
}

export interface DependencyAnalysis {
  totalDependencies: number;
  outdatedDependencies: number;
  vulnerableDependencies: number;
  missingDependencies: string[];
  unusedDependencies: string[];
  licenseIssues: Array<{ package: string; license: string; issue: string }>;
  recommendations: string[];
  conflicts?: DependencyConflict[]; // Add conflicts field
}

export class DependencyService {
  constructor() {}

  /**
   * Detects the package manager used in the project
   */
  async detectPackageManager(projectPath: string = process.cwd()): Promise<PackageManager> {
    const packageManagers = [
      { name: PackageManager.PNPM, lockFile: 'pnpm-lock.yaml' },
      { name: PackageManager.YARN, lockFile: 'yarn.lock' },
      { name: PackageManager.BUN, lockFile: 'bun.lockb' },
      { name: PackageManager.NPM, lockFile: 'package-lock.json' }
    ];

    for (const pm of packageManagers) {
      try {
        await fs.access(path.join(projectPath, pm.lockFile));
        return pm.name;
      } catch {
        // Continue checking
      }
    }

    // Default to npm if no lock file found
    return PackageManager.NPM;
  }

  /**
   * Installs dependencies
   */
  async installDependencies(
    projectPath: string = process.cwd(),
    packageManager?: PackageManager
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const pm = packageManager || await this.detectPackageManager(projectPath);
    const command = this.getInstallCommand(pm);

    return this.runPackageManagerCommand(command, projectPath);
  }

  /**
   * Adds a new dependency
   */
  async addDependency(
    packageName: string,
    version?: string,
    type: DependencyType = DependencyType.DEPENDENCY,
    projectPath: string = process.cwd(),
    packageManager?: PackageManager
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const pm = packageManager || await this.detectPackageManager(projectPath);
    const command = this.getAddCommand(pm, packageName, version, type);

    return this.runPackageManagerCommand(command, projectPath);
  }

  /**
   * Removes a dependency
   */
  async removeDependency(
    packageName: string,
    projectPath: string = process.cwd(),
    packageManager?: PackageManager
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const pm = packageManager || await this.detectPackageManager(projectPath);
    const command = this.getRemoveCommand(pm, packageName);

    return this.runPackageManagerCommand(command, projectPath);
  }

  /**
   * Updates dependencies
   */
  async updateDependencies(
    packageNames?: string[],
    projectPath: string = process.cwd(),
    packageManager?: PackageManager
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const pm = packageManager || await this.detectPackageManager(projectPath);
    const command = this.getUpdateCommand(pm, packageNames);

    return this.runPackageManagerCommand(command, projectPath);
  }

  /**
   * Analyzes project dependencies
   */
  async analyzeDependencies(projectPath: string = process.cwd()): Promise<DependencyAnalysis> {
    const packageJsonPath = path.join(projectPath, 'package.json');

    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
        ...packageJson.optionalDependencies
      };

      const analysis: DependencyAnalysis = {
        totalDependencies: Object.keys(allDeps).length,
        outdatedDependencies: 0,
        vulnerableDependencies: 0,
        missingDependencies: [],
        unusedDependencies: [],
        licenseIssues: [],
        recommendations: []
      };

      // Check for outdated packages
      try {
        const outdatedResult = await this.runPackageManagerCommand(['npm', 'outdated', '--json'], projectPath);
        if (outdatedResult.success) {
          const outdated = JSON.parse(outdatedResult.output);
          analysis.outdatedDependencies = Object.keys(outdated).length;
        }
      } catch {
        // npm outdated may fail, continue
      }

      // Check for vulnerabilities
      try {
        const auditResult = await this.runPackageManagerCommand(['npm', 'audit', '--json'], projectPath);
        if (auditResult.success) {
          const audit = JSON.parse(auditResult.output);
          analysis.vulnerableDependencies = audit.metadata?.vulnerabilities?.total || 0;
        }
      } catch {
        // npm audit may fail, continue
      }

      // Generate recommendations
      analysis.recommendations = this.generateRecommendations(analysis);

      // Check for version conflicts
      try {
        analysis.conflicts = await this.detectVersionConflicts(projectPath, packageJson);
      } catch (error) {
        console.warn('Failed to detect version conflicts:', error);
      }

      return analysis;

    } catch (error) {
      throw new Error(`Failed to analyze dependencies: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Detects version conflicts in dependencies
   */
  private async detectVersionConflicts(
    projectPath: string,
    packageJson: any
  ): Promise<DependencyConflict[]> {
    const conflicts: DependencyConflict[] = [];
    
    try {
      // Run npm ls to get the dependency tree
      const lsResult = await this.runPackageManagerCommand(['npm', 'ls', '--json', '--depth=3'], projectPath);
      
      if (lsResult.success) {
        const dependencyTree = JSON.parse(lsResult.output);
        const conflictMap = this.analyzeDependencyTree(dependencyTree);
        
        // Convert conflict map to DependencyConflict objects
        for (const [packageName, versions] of Object.entries(conflictMap)) {
          if (versions.size > 1) {
            // Explicitly cast the iterator to avoid type inference issues
            const entries = Array.from(versions.entries()) as [
              string,
              Set<string>,
            ][];
            const versionArray = entries.map(([version, sources]) => ({
              version,
              sources: Array.from(sources),
            }));

            // Determine recommended version (latest semver)
            const sortedVersions = versionArray
              .map((v) => v.version)
              .sort((a, b) => this.compareVersions(a, b));
            const recommendedVersion = sortedVersions[sortedVersions.length - 1];

            // Determine resolution strategy
            let resolution: 'update' | 'pin' | 'manual' = 'update';
            let severity: 'low' | 'medium' | 'high' = 'low';

            // If there's a large version gap, mark as higher severity
            if (sortedVersions.length > 0) {
              const first = sortedVersions[0];
              const last = sortedVersions[sortedVersions.length - 1];
              if (this.getVersionDifference(first, last) > 1) {
                severity = 'high';
                resolution = 'manual';
              } else if (this.getVersionDifference(first, last) > 0) {
                severity = 'medium';
              }
            }

            conflicts.push({
              name: packageName,
              versions: versionArray,
              recommendedVersion,
              resolution,
              severity,
            });
          }
        }
      }
    } catch (error) {
      console.warn('Error detecting version conflicts:', error);
    }
    
    return conflicts;
  }

  /**
   * Analyzes the dependency tree to find version conflicts
   */
  private analyzeDependencyTree(tree: any): Map<string, Map<string, Set<string>>> {
    const conflictMap = new Map<string, Map<string, Set<string>>>();
    
    const traverse = (node: any, path: string[] = []) => {
      if (!node || !node.dependencies) return;
      
      for (const [depName, depInfo] of Object.entries(node.dependencies)) {
        const info = depInfo as any;
        if (info.version) {
          if (!conflictMap.has(depName)) {
            conflictMap.set(depName, new Map<string, Set<string>>());
          }
          
          const versions = conflictMap.get(depName)!;
          if (!versions.has(info.version)) {
            versions.set(info.version, new Set<string>());
          }
          
          versions.get(info.version)!.add(path.join(' > ') || 'root');
        }
        
        // Traverse children
        if (info.dependencies) {
          traverse(info, [...path, depName]);
        }
      }
    };
    
    traverse(tree);
    return conflictMap;
  }

  /**
   * Compares two semantic version strings
   */
  private compareVersions(a: string, b: string): number {
    // Simple semver comparison - in a real implementation, you'd use a proper semver library
    const aParts = a.replace(/[^\d.]/g, '').split('.').map(Number);
    const bParts = b.replace(/[^\d.]/g, '').split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      
      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }
    
    return 0;
  }

  /**
   * Calculates the difference between two version numbers
   */
  private getVersionDifference(a: string, b: string): number {
    // Simple version difference calculation
    const aParts = a.replace(/[^\d.]/g, '').split('.').map(Number);
    const bParts = b.replace(/[^\d.]/g, '').split('.').map(Number);
    
    // Compare major versions
    if (aParts[0] !== bParts[0]) return Math.abs(aParts[0] - bParts[0]);
    
    // Compare minor versions
    if (aParts[1] !== bParts[1]) return Math.abs(aParts[1] - bParts[1]) / 10;
    
    // Compare patch versions
    if (aParts[2] !== bParts[2]) return Math.abs(aParts[2] - bParts[2]) / 100;
    
    return 0;
  }

  /**
   * Resolves version conflicts by updating dependencies
   */
  async resolveVersionConflicts(
    projectPath: string = process.cwd(),
    packageManager?: PackageManager
  ): Promise<{ success: boolean; output: string; conflictsResolved: number; error?: string }> {
    const pm = packageManager || await this.detectPackageManager(projectPath);
    
    try {
      // First, analyze dependencies to find conflicts
      const analysis = await this.analyzeDependencies(projectPath);
      const conflicts = analysis.conflicts || [];
      
      if (conflicts.length === 0) {
        return {
          success: true,
          output: 'No version conflicts detected',
          conflictsResolved: 0
        };
      }
      
      let resolvedCount = 0;
      let output = `Resolving ${conflicts.length} version conflicts:\n`;
      
      // Resolve each conflict based on its resolution strategy
      for (const conflict of conflicts) {
        output += `\n- ${conflict.name}: `;
        
        try {
          switch (conflict.resolution) {
            case 'update':
              // Update to the recommended version
              const updateResult = await this.updateDependencies(
                [conflict.name],
                projectPath,
                pm
              );
              
              if (updateResult.success) {
                output += `Updated to ${conflict.recommendedVersion} - SUCCESS`;
                resolvedCount++;
              } else {
                output += `Failed to update: ${updateResult.error || 'Unknown error'}`;
              }
              break;
              
            case 'pin':
              // Pin to the recommended version
              const pinResult = await this.addDependency(
                conflict.name,
                conflict.recommendedVersion,
                DependencyType.DEPENDENCY,
                projectPath,
                pm
              );
              
              if (pinResult.success) {
                output += `Pinned to ${conflict.recommendedVersion} - SUCCESS`;
                resolvedCount++;
              } else {
                output += `Failed to pin: ${pinResult.error || 'Unknown error'}`;
              }
              break;
              
            case 'manual':
              // Recommend manual resolution
              output += `Manual resolution recommended - Multiple major versions detected`;
              break;
          }
        } catch (error) {
          output += `Error during resolution: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      
      return {
        success: true,
        output,
        conflictsResolved: resolvedCount
      };
      
    } catch (error) {
      return {
        success: false,
        output: '',
        conflictsResolved: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }  }

  /**
   * Auto-updates package versions to their latest compatible versions
   */
  async autoUpdatePackages(
    projectPath: string = process.cwd(),
    packageManager?: PackageManager
  ): Promise<{ success: boolean; output: string; packagesUpdated: number; error?: string }> {
    const pm = packageManager || await this.detectPackageManager(projectPath);
    
    try {
      // Check for outdated packages
      const outdatedResult = await this.runPackageManagerCommand(['npm', 'outdated', '--json'], projectPath);
      
      if (!outdatedResult.success) {
        return {
          success: false,
          output: outdatedResult.output,
          packagesUpdated: 0,
          error: outdatedResult.error
        };
      }
      
      const outdated = JSON.parse(outdatedResult.output);
      const packageNames = Object.keys(outdated);
      
      if (packageNames.length === 0) {
        return {
          success: true,
          output: 'All packages are up to date',
          packagesUpdated: 0
        };
      }
      
      // Update all outdated packages
      const updateResult = await this.updateDependencies(
        packageNames,
        projectPath,
        pm
      );
      
      if (updateResult.success) {
        return {
          success: true,
          output: `Updated ${packageNames.length} packages successfully`,
          packagesUpdated: packageNames.length
        };
      } else {
        return {
          success: false,
          output: updateResult.output,
          packagesUpdated: 0,
          error: updateResult.error
        };
      }
      
    } catch (error) {
      return {
        success: false,
        output: '',
        packagesUpdated: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Checks for dependency vulnerabilities
   */
  async checkVulnerabilities(
    projectPath: string = process.cwd(),
    packageManager?: PackageManager
  ): Promise<VulnerabilityInfo[]> {
    const pm = packageManager || await this.detectPackageManager(projectPath);
    const command = this.getAuditCommand(pm);

    const result = await this.runPackageManagerCommand(command, projectPath);

    if (!result.success) {
      console.warn('Vulnerability check failed:', result.error);
      return [];
    }

    // Parse vulnerabilities based on package manager
    return this.parseVulnerabilities(result.output, pm);
  }

  /**
   * Gets dependency information
   */
  async getDependencyInfo(
    packageName: string,
    projectPath: string = process.cwd()
  ): Promise<DependencyInfo | null> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
        ...packageJson.optionalDependencies
      };

      if (!(packageName in allDeps)) {
        return null;
      }

      const version = allDeps[packageName];
      let type = DependencyType.DEPENDENCY;

      if (packageJson.devDependencies && packageName in packageJson.devDependencies) {
        type = DependencyType.DEV_DEPENDENCY;
      } else if (packageJson.peerDependencies && packageName in packageJson.peerDependencies) {
        type = DependencyType.PEER_DEPENDENCY;
      } else if (packageJson.optionalDependencies && packageName in packageJson.optionalDependencies) {
        type = DependencyType.OPTIONAL_DEPENDENCY;
      }

      // Check if installed
      const nodeModulesPath = path.join(projectPath, 'node_modules', packageName);
      let isInstalled = false;
      try {
        await fs.access(nodeModulesPath);
        isInstalled = true;
      } catch {
        // Not installed
      }

      return {
        name: packageName,
        version,
        type,
        isInstalled
      };

    } catch (error) {
      console.warn(`Failed to get dependency info for ${packageName}:`, error);
      return null;
    }
  }

  private getInstallCommand(pm: PackageManager): string[] {
    switch (pm) {
      case PackageManager.YARN:
        return ['yarn', 'install'];
      case PackageManager.PNPM:
        return ['pnpm', 'install'];
      case PackageManager.BUN:
        return ['bun', 'install'];
      default:
        return ['npm', 'install'];
    }
  }

  private getAddCommand(
    pm: PackageManager,
    packageName: string,
    version?: string,
    type: DependencyType = DependencyType.DEPENDENCY
  ): string[] {
    const pkg = version ? `${packageName}@${version}` : packageName;

    switch (pm) {
      case PackageManager.YARN: {
        const yarnFlag = type === DependencyType.DEV_DEPENDENCY ? '--dev' : '';
        return ['yarn', 'add', pkg, yarnFlag].filter(Boolean);
      }
      case PackageManager.PNPM: {
        const pnpmFlag = type === DependencyType.DEV_DEPENDENCY ? '--save-dev' : '--save';
        return ['pnpm', 'add', pkg, pnpmFlag];
      }
      case PackageManager.BUN: {
        const bunFlag = type === DependencyType.DEV_DEPENDENCY ? '--dev' : '';
        return ['bun', 'add', pkg, bunFlag].filter(Boolean);
      }
      default: {
        const npmFlag = type === DependencyType.DEV_DEPENDENCY ? '--save-dev' : '--save';
        return ['npm', 'install', pkg, npmFlag];
      }
    }
  }

  private getRemoveCommand(pm: PackageManager, packageName: string): string[] {
    switch (pm) {
      case PackageManager.YARN:
        return ['yarn', 'remove', packageName];
      case PackageManager.PNPM:
        return ['pnpm', 'remove', packageName];
      case PackageManager.BUN:
        return ['bun', 'remove', packageName];
      default:
        return ['npm', 'uninstall', packageName];
    }
  }

  private getUpdateCommand(pm: PackageManager, packageNames?: string[]): string[] {
    const packages = packageNames || [];

    switch (pm) {
      case PackageManager.YARN:
        return ['yarn', 'upgrade', ...packages];
      case PackageManager.PNPM:
        return ['pnpm', 'update', ...packages];
      case PackageManager.BUN:
        return ['bun', 'update', ...packages];
      default:
        return ['npm', 'update', ...packages];
    }
  }

  private getAuditCommand(pm: PackageManager): string[] {
    switch (pm) {
      case PackageManager.YARN:
        return ['yarn', 'audit', '--json'];
      case PackageManager.PNPM:
        return ['pnpm', 'audit', '--json'];
      case PackageManager.BUN:
        return ['bun', 'pm', 'audit', '--json'];
      default:
        return ['npm', 'audit', '--json'];
    }
  }

  private async runPackageManagerCommand(
    command: string[],
    cwd: string
  ): Promise<{ success: boolean; output: string; error?: string }> {
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
        resolve({
          success: code === 0,
          output: stdout,
          error: stderr || (code !== 0 ? `Command failed with code ${code}` : undefined)
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          output: stdout,
          error: error.message
        });
      });
    });
  }

  private parseVulnerabilities(output: string, pm: PackageManager): VulnerabilityInfo[] {
    try {
      const data = JSON.parse(output);

      if (pm === PackageManager.NPM) {
        const vulnerabilities: VulnerabilityInfo[] = [];
        if (data.vulnerabilities) {
          Object.values(data.vulnerabilities).forEach((vuln: unknown) => {
            const v = vuln as {
              severity: 'low' | 'moderate' | 'high' | 'critical';
              title: string;
              name: string;
              overview?: string;
              recommendation?: string;
              patched_versions?: string[];
            };
            vulnerabilities.push({
              severity: v.severity,
              title: v.title,
              description: v.overview || v.recommendation || '',
              package: v.name,
              patched_versions: v.patched_versions || [],
              recommendation: v.recommendation || 'Update to patched version'
            });
          });
        }
        return vulnerabilities;
      }

      // Add parsing for other package managers as needed
      return [];

    } catch {
      return [];
    }
  }

  private generateRecommendations(analysis: DependencyAnalysis): string[] {
    const recommendations: string[] = [];

    if (analysis.outdatedDependencies > 0) {
      recommendations.push(`Update ${analysis.outdatedDependencies} outdated dependencies`);
    }

    if (analysis.vulnerableDependencies > 0) {
      recommendations.push(`Fix ${analysis.vulnerableDependencies} security vulnerabilities`);
    }

    if (analysis.missingDependencies.length > 0) {
      recommendations.push(`Install ${analysis.missingDependencies.length} missing dependencies`);
    }

    if (analysis.unusedDependencies.length > 0) {
      recommendations.push(`Remove ${analysis.unusedDependencies.length} unused dependencies`);
    }

    if (analysis.licenseIssues.length > 0) {
      recommendations.push(`Review ${analysis.licenseIssues.length} license compliance issues`);
    }

    return recommendations;
  }
}
