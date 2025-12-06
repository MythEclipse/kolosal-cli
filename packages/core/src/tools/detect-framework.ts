/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
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
import { ContextAnalysisService, ProjectType, Framework, TestingFramework } from '../services/contextAnalysisService.js';

/**
 * Parameters for the DetectFramework tool
 */
export interface DetectFrameworkToolParams {
  /**
   * The absolute path to the project directory
   */
  project_path?: string;
}

class DetectFrameworkToolInvocation extends BaseToolInvocation<
  DetectFrameworkToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: DetectFrameworkToolParams,
  ) {
    super(params);
  }

  override getDescription(): string {
    const projectPath = this.params.project_path || this.config.getTargetDir();
    const relativePath = path.relative(
      this.config.getTargetDir(),
      projectPath,
    );
    return `Detecting framework and tech stack at ${relativePath}`;
  }

  async execute(_abortSignal: AbortSignal): Promise<ToolResult> {
    try {
      const projectPath = this.params.project_path || this.config.getTargetDir();
      
      // Analyze the project context
      const contextAnalysisService = new ContextAnalysisService();
      const analysisResult = await contextAnalysisService.analyzeProjectContext(projectPath);
      
      const { projectContext, codePatterns, recommendations, confidence } = analysisResult;
      
      // Format the results
      const frameworkList = projectContext.frameworks
        .filter(f => f !== Framework.UNKNOWN)
        .map(f => f.toString())
        .join(', ') || 'None detected';
        
      const testingFrameworkList = projectContext.testingFrameworks
        .filter(f => f !== TestingFramework.UNKNOWN)
        .map(f => f.toString())
        .join(', ') || 'None detected';
        
      const projectType = projectContext.type !== ProjectType.UNKNOWN 
        ? projectContext.type.toString() 
        : 'Unknown';
        
      const language = projectContext.language.toString();
      
      const resultMessage = `Framework Detection Results:
- Project Type: ${projectType}
- Language: ${language}
- Frameworks: ${frameworkList}
- Testing Frameworks: ${testingFrameworkList}
- Package Manager: ${projectContext.packageManager}
- Has TypeScript: ${projectContext.hasTypeScript ? 'Yes' : 'No'}
- Has Tests: ${projectContext.hasTests ? 'Yes' : 'No'}
- Has Linting: ${projectContext.hasLinting ? 'Yes' : 'No'}
- Confidence: ${(confidence * 100).toFixed(1)}%

Detected Code Patterns:
${codePatterns.slice(0, 5).map(p => `- ${p.name}: ${p.description} (${Math.round(p.confidence * 100)}% confidence)`).join('\n') || 'None detected'}

Recommendations:
${recommendations.map(r => `- ${r}`).join('\n') || 'None'}`;

      return {
        llmContent: resultMessage,
        returnDisplay: resultMessage,
      };
    } catch (error) {
      const errorMsg = `Error detecting framework: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: errorMsg,
        returnDisplay: errorMsg,
        error: {
          message: errorMsg,
          type: ToolErrorType.FRAMEWORK_DETECTION_ERROR,
        },
      };
    }
  }
}

/**
 * Implementation of the DetectFramework tool logic
 */
export class DetectFrameworkTool extends BaseDeclarativeTool<DetectFrameworkToolParams, ToolResult> {
  static readonly Name: string = 'detect_framework';

  constructor(private readonly config: Config) {
    super(
      DetectFrameworkTool.Name,
      'DetectFramework',
      `Detects the technology stack, frameworks, and project structure of a codebase.
      
This tool analyzes package.json, directory structure, config files, and code patterns to identify:
- Project type (React, Node.js, etc.)
- Programming language (JavaScript, TypeScript)
- Frameworks (Express, React, Vue, etc.)
- Testing frameworks (Jest, Vitest, etc.)
- Package manager (npm, yarn, pnpm, bun)
- Code patterns and best practices
- Recommendations for improvement`,
      Kind.Read,
      {
        properties: {
          project_path: {
            description: "The absolute path to the project directory (defaults to current working directory)",
            type: 'string',
          },
        },
        required: [],
        type: 'object',
      },
    );
  }

  protected override validateToolParamValues(
    params: DetectFrameworkToolParams,
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
    params: DetectFrameworkToolParams,
  ): ToolInvocation<DetectFrameworkToolParams, ToolResult> {
    return new DetectFrameworkToolInvocation(this.config, params);
  }
}