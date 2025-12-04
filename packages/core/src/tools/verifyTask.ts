/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolResult } from './tools.js';
import type { Config } from '../config/config.js';
import { spawn } from 'node:child_process';
import { readTodosForSession } from './todoWrite.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { QWEN_DIR } from '../utils/paths.js';

const TODO_SUBDIR = 'todos';

export interface VerifyTaskParams {
  taskId: string;
  command: string;
}

export class VerifyTaskTool extends BaseDeclarativeTool<VerifyTaskParams, ToolResult> {
  static readonly Name = 'verify_task';

  constructor(private readonly config: Config) {
    super(
      VerifyTaskTool.Name,
      'VerifyTask',
      'Executes a verification command (like tests or build) for a specific task. If the command succeeds (exit code 0), the task is automatically marked as completed in the todo list. If it fails, the output is returned for analysis.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The ID of the todo item to verify and complete.',
          },
          command: {
            type: 'string',
            description: 'The shell command to run for verification (e.g., "npm test" or "npm run build").',
          },
        },
        required: ['taskId', 'command'],
      }
    );
  }

  protected createInvocation(params: VerifyTaskParams): BaseToolInvocation<VerifyTaskParams, ToolResult> {
    return new VerifyTaskInvocation(this.config, params);
  }
}

class VerifyTaskInvocation extends BaseToolInvocation<VerifyTaskParams, ToolResult> {
  constructor(
    private readonly config: Config,
    params: VerifyTaskParams
  ) {
    super(params);
  }

  getDescription(): string {
    return `Verifying task ${this.params.taskId} with command: ${this.params.command}`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const { taskId, command } = this.params;
    const sessionId = this.config.getSessionId();

    // 1. Run the command
    try {
      const result = await this.runCommand(command, signal);
      
      if (result.exitCode === 0) {
        // 2. Success: Update todo status
        await this.completeTask(sessionId, taskId);
        
        return {
          llmContent: `Verification successful! Task '${taskId}' has been marked as completed.\nOutput:\n${result.stdout}`,
          returnDisplay: `Task ${taskId} verified and completed.`
        };
      } else {
        // 3. Failure: Return error
        return {
          llmContent: `Verification failed for task '${taskId}'.\nExit Code: ${result.exitCode}\nStderr:\n${result.stderr}\nStdout:\n${result.stdout}`,
          returnDisplay: `Verification failed for task ${taskId}`
        };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error executing verification command: ${msg}`,
        returnDisplay: `Error executing verification command: ${msg}`
      };
    }
  }

  private async completeTask(sessionId: string, taskId: string): Promise<void> {
    const todos = await readTodosForSession(sessionId);
    const taskIndex = todos.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      throw new Error(`Task with ID '${taskId}' not found.`);
    }

    todos[taskIndex].status = 'completed';
    
    // Write back (We manually reuse logic from todoWrite because TodoWriteTool is a class)
    // Ideally refactor todoWrite to export the write function.
    // Assuming we can duplicate the write logic here or import it if exported.
    // I previously saw 'writeTodosToFile' is NOT exported from todoWrite.ts. 
    // But 'readTodosForSession' IS exported.
    // I will re-implement simple write logic here for safety or try to use the tool if possible.
    
    // Re-implementation of write logic to be safe:
    const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || process.cwd();
    const todoDir = path.join(homeDir, QWEN_DIR, TODO_SUBDIR);
    const filename = `${sessionId || 'default'}.json`;
    const todoFilePath = path.join(todoDir, filename);
    
    const data = {
        todos,
        sessionId: sessionId || 'default',
    };
    await fs.writeFile(todoFilePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private runCommand(command: string, signal: AbortSignal): Promise<{ stdout: string, stderr: string, exitCode: number }> {
    return new Promise((resolve, reject) => {
      // Using shell: true to handle complex commands passed as string
      const child = spawn(command, { shell: true, stdio: 'pipe' });
      
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => stdout += data.toString());
      child.stderr?.on('data', (data) => stderr += data.toString());

      const abortHandler = () => {
        child.kill();
        reject(new Error('Command aborted'));
      };
      signal.addEventListener('abort', abortHandler);

      child.on('close', (code) => {
        signal.removeEventListener('abort', abortHandler);
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });

      child.on('error', (err) => {
        signal.removeEventListener('abort', abortHandler);
        reject(err);
      });
    });
  }
}
