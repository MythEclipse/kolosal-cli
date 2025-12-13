/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
  type ToolResultDisplay,
} from './tools.js';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import { ToolErrorType } from './tool-error.js';

export interface DiagnosticsToolParams {
  command?: string;
  fix_errors?: boolean; // Reserved for future use (auto-fix)
}

class DiagnosticsToolInvocation extends BaseToolInvocation<
  DiagnosticsToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: DiagnosticsToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `Running diagnostics${
      this.params.command ? `: ${this.params.command}` : ''
    }`;
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: ToolResultDisplay) => void,
  ): Promise<ToolResult> {
    if (signal.aborted) {
      return {
        llmContent: 'Diagnostics cancelled by user.',
        returnDisplay: 'Diagnostics cancelled by user.',
      };
    }

    const commandToRun = this.params.command;

    // specific logic to detect command if not provided
    if (!commandToRun) {
      // Better: let the agent be explicit.
      return {
        llmContent:
          'Error: No command provided and auto-detection is not yet implemented. Please provide a `command` argument (e.g., "npm run typecheck")',
        returnDisplay: 'Error: No command provided.',
        error: {
          message: 'No command provided',
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    const cwd = this.config.getTargetDir();

    try {
      const { result } = await ShellExecutionService.execute(
        commandToRun,
        cwd,
        (event) => {
          if (updateOutput && event.type === 'data') {
            updateOutput(event.chunk);
          }
        },
        signal,
        false, // Don't use PTY for diagnostics usually, raw output is fine
      );

      const executionResult = await result;

      const output = executionResult.output;
      // In the future: Parse output here

      let returnDisplay = output;
      if (!output.trim()) {
        returnDisplay =
          executionResult.exitCode === 0
            ? 'Diagnostics passed (no output).'
            : `Diagnostics failed with exit code ${executionResult.exitCode} (no output).`;
      }

      return {
        llmContent: output || returnDisplay,
        returnDisplay,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error running diagnostics: ${errorMessage}`,
        returnDisplay: `Error running diagnostics: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

export class DiagnosticsTool extends BaseDeclarativeTool<
  DiagnosticsToolParams,
  ToolResult
> {
  static Name: string = ToolNames.DIAGNOSTICS;

  constructor(private readonly config: Config) {
    super(
      DiagnosticsTool.Name,
      'Diagnostics',
      'Runs a project-specific verification command (e.g., compiler, linter) to check for errors.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description:
              'The command to run for diagnostics (e.g., "npm run typecheck", "cargo check"). If omitted, the tool will attempt to use a configured default.',
          },
          fix_errors: {
            type: 'boolean',
            description:
              'If true, attempts to apply automatic fixes (not yet implemented).',
          },
        },
        required: ['command'],
      },
    );
  }

  protected createInvocation(
    params: DiagnosticsToolParams,
  ): ToolInvocation<DiagnosticsToolParams, ToolResult> {
    return new DiagnosticsToolInvocation(this.config, params);
  }
}
