/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileNode {
  path: string;
  imports: string[]; // Absolute paths or relative to project root
  importedBy: string[];
}

export interface ArchitectureReport {
  files: number;
  relationships: number;
  patterns: string[];
  circularDependencies: string[][];
  orphans: string[];
}

export class ArchitectureService {
  
  async analyzeStructure(projectPath: string): Promise<{ graph: Map<string, FileNode>; report: ArchitectureReport }> {
    const graph = new Map<string, FileNode>();
    const files = await this.getFiles(projectPath);

    // Initialize nodes
    for (const file of files) {
      if (this.isSourceFile(file)) {
        graph.set(file, { path: file, imports: [], importedBy: [] });
      }
    }

    // Build edges
    for (const file of files) {
      if (!this.isSourceFile(file)) continue;
      
      const content = await fs.readFile(file, 'utf-8');
      const imports = this.parseImports(content, file, projectPath);

      const node = graph.get(file)!;
      
      for (const imp of imports) {
        // Resolve import to absolute path
        const resolved = await this.resolveImport(imp, file);
        if (resolved && graph.has(resolved)) {
          node.imports.push(resolved);
          graph.get(resolved)!.importedBy.push(file);
        }
      }
    }

    // Analyze graph
    const report: ArchitectureReport = {
      files: graph.size,
      relationships: 0,
      patterns: this.detectPatterns(projectPath, files),
      circularDependencies: this.findCircularDependencies(graph),
      orphans: []
    };

    let relCount = 0;
    for (const [_, node] of graph) {
      relCount += node.imports.length;
      if (node.importedBy.length === 0 && !this.isEntryPoint(node.path)) {
        report.orphans.push(path.relative(projectPath, node.path));
      }
    }
    report.relationships = relCount;

    return { graph, report };
  }

  async analyzeImpact(filePath: string, graph: Map<string, FileNode>): Promise<string[]> {
    const impacted = new Set<string>();
    const queue = [filePath];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (graph.has(current)) {
        const node = graph.get(current)!;
        for (const consumer of node.importedBy) {
          if (!impacted.has(consumer)) {
            impacted.add(consumer);
            queue.push(consumer);
          }
        }
      }
    }

    return Array.from(impacted);
  }

  private isSourceFile(f: string): boolean {
    const ext = path.extname(f);
    return ['.ts', '.js', '.tsx', '.jsx'].includes(ext);
  }

  private async getFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
            files.push(...(await this.getFiles(full)));
          }
        } else {
          files.push(full);
        }
      }
    } catch {
      // ignore
    }
    return files;
  }

  private parseImports(content: string, filePath: string, projectPath: string): string[] {
    const imports: string[] = [];
    const regex = /import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    // Also support require
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    return imports;
  }

  private async resolveImport(importPath: string, sourceFile: string): Promise<string | null> {
    if (!importPath.startsWith('.')) return null; // Ignore external packages for now

    const dir = path.dirname(sourceFile);
    let resolved = path.resolve(dir, importPath);
    
    // Check extensions
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
    for (const ext of extensions) {
      const p = resolved + ext;
      try {
        await fs.access(p);
        return p;
      } catch {}
    }
    return null;
  }

  private detectPatterns(projectPath: string, files: string[]): string[] {
    const patterns = new Set<string>();
    const relFiles = files.map(f => path.relative(projectPath, f));

    if (relFiles.some(f => f.includes('controllers/') && f.includes('models/') && f.includes('views/'))) {
      patterns.add('MVC');
    }
    if (relFiles.some(f => f.includes('components/') && f.includes('hooks/') && f.includes('context/'))) {
      patterns.add('React Component/Hook Architecture');
    }
    if (relFiles.some(f => f.includes('services/') && f.includes('repositories/') && f.includes('entities/'))) {
      patterns.add('Domain-Driven Design (DDD) Layers');
    }
    if (relFiles.some(f => f.includes('routes/') && f.includes('handlers/'))) {
      patterns.add('Route-Handler Pattern');
    }

    return Array.from(patterns);
  }

  private findCircularDependencies(graph: Map<string, FileNode>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodePath: string, pathStack: string[]) => {
      visited.add(nodePath);
      recursionStack.add(nodePath);
      pathStack.push(nodePath);

      const node = graph.get(nodePath);
      if (node) {
        for (const imp of node.imports) {
          if (!visited.has(imp)) {
            dfs(imp, pathStack);
          } else if (recursionStack.has(imp)) {
            // Cycle detected
            const cycle = pathStack.slice(pathStack.indexOf(imp));
            cycles.push(cycle);
          }
        }
      }

      recursionStack.delete(nodePath);
      pathStack.pop();
    };

    for (const [path, _] of graph) {
      if (!visited.has(path)) {
        dfs(path, []);
      }
    }

    return cycles;
  }

  private isEntryPoint(f: string): boolean {
    return f.endsWith('index.ts') || f.endsWith('index.js') || f.endsWith('main.ts') || f.endsWith('App.tsx');
  }
}
