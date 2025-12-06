/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface DocCoverageResult {
  filePath: string;
  totalItems: number;
  documentedItems: number;
  missingDocs: Array < {
    name: string;
    line: number;
    type: 'function' | 'class' | 'interface' | 'method';
  } > ;
  coverage: number;
}

export class DocumentationService {
  /**
   * Checks documentation coverage for a list of files or a directory.
   */
  async checkCoverage(targetPath: string): Promise<DocCoverageResult[]> {
    const results: DocCoverageResult[] = [];
    const files = await this.getFiles(targetPath);

    for (const file of files) {
      if (this.isSupportedFile(file)) {
        const coverage = await this.analyzeFile(file);
        results.push(coverage);
      }
    }

    return results;
  }

  /**
   * Generates a skeleton documentation string for a specific item type.
   * Note: This is a heuristic helper. Full generation should use an LLM.
   */
  generateSkeleton(type: 'function' | 'class' | 'interface' | 'method', name: string, params: string[] = []): string {
    if (type === 'function' || type === 'method') {
      return `/**
 * ${name}
 * 
 * @param ${params.map(p => p).join('\n * @param ')}
 * @returns 
 */`;
    } else if (type === 'class') {
      return `/**
 * Class ${name}
 * 
 * @class
 */`;
    } else {
      return `/**
 * Interface ${name}
 * 
 */`;
    }
  }

  private async getFiles(target: string): Promise<string[]> {
    const stat = await fs.stat(target);
    if (stat.isFile()) return [target];

    const files: string[] = [];
    const entries = await fs.readdir(target, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(target, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...(await this.getFiles(fullPath)));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private isSupportedFile(filePath: string): boolean {
    const ext = path.extname(filePath);
    return ['.ts', '.js', '.tsx', '.jsx', '.py', '.java'].includes(ext);
  }

  private async analyzeFile(filePath: string): Promise<DocCoverageResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath);
    const lines = content.split('\n');
    
    const missingDocs: DocCoverageResult['missingDocs'] = [];
    let totalItems = 0;
    let documentedItems = 0;

    if (['.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
      // Simple regex-based parser for JS/TS
      // This is naive and won't catch everything, but serves as a baseline
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check for function/class/interface definitions
        const functionMatch = line.match(/^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)/);
        const classMatch = line.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_]+)/);
        const interfaceMatch = line.match(/^(?:export\s+)?interface\s+([a-zA-Z0-9_]+)/);
        const methodMatch = line.match(/^\s*(?:private|public|protected|static)?\s*(?:async\s+)?([a-zA-Z0-9_]+)\s*\(/);

        let match: RegExpMatchArray | null = null;
        let type: 'function' | 'class' | 'interface' | 'method' = 'function';

        if (functionMatch) { match = functionMatch; type = 'function'; }
        else if (classMatch) { match = classMatch; type = 'class'; }
        else if (interfaceMatch) { match = interfaceMatch; type = 'interface'; }
        else if (methodMatch && !line.startsWith('if') && !line.startsWith('for') && !line.startsWith('while') && !line.startsWith('switch') && !line.startsWith('catch')) { 
           // Very naive check to exclude control flow
           match = methodMatch; type = 'method'; 
        }

        if (match) {
          totalItems++;
          const name = match[1];
          
          // Check previous lines for comments
          let hasDoc = false;
          for (let j = i - 1; j >= 0; j--) {
            const prevLine = lines[j].trim();
            if (prevLine === '' || prevLine.startsWith('@')) continue; // Skip decorators/empty lines
            if (prevLine.endsWith('*/') || prevLine.startsWith('//')) {
              hasDoc = true;
            }
            break;
          }

          if (hasDoc) {
            documentedItems++;
          } else {
            missingDocs.push({ name, line: i + 1, type });
          }
        }
      }
    } else if (ext === '.py') {
      // Simple python parser
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        const defMatch = line.match(/^def\s+([a-zA-Z0-9_]+)/);
        const classMatch = line.match(/^class\s+([a-zA-Z0-9_]+)/);

        if (defMatch || classMatch) {
          totalItems++;
          const name = (defMatch || classMatch)![1];
          const type = classMatch ? 'class' : 'function';
          
          // Check next line for docstring
          let hasDoc = false;
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            if (nextLine.startsWith('"""') || nextLine.startsWith("'''")) {
              hasDoc = true;
            }
          }

          if (hasDoc) {
            documentedItems++;
          } else {
            missingDocs.push({ name, line: i + 1, type });
          }
        }
      }
    }

    return {
      filePath,
      totalItems,
      documentedItems,
      missingDocs,
      coverage: totalItems > 0 ? documentedItems / totalItems : 1
    };
  }
}
