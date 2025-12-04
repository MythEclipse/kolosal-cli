/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  parseAndFormatApiError,
  FatalInputError,
  readTodosForSession,
  ContextState,
  SubagentTerminateMode,
  type Config,
  type TodoItem,
  QWEN_DIR,
} from '@kolosal-ai/kolosal-ai-core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as process from 'process';

import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';

const TODO_SUBDIR = 'todos';

function getTodoFilePath(sessionId?: string): string {
  const homeDir =
    process.env['HOME'] || process.env['USERPROFILE'] || process.cwd();
  const todoDir = path.join(homeDir, QWEN_DIR, TODO_SUBDIR);
  const filename = `${sessionId || 'default'}.json`;
  return path.join(todoDir, filename);
}

async function writeTodosToFile(
  todos: TodoItem[],
  sessionId?: string,
): Promise<void> {
  const todoFilePath = getTodoFilePath(sessionId);
  const todoDir = path.dirname(todoFilePath);
  await fs.mkdir(todoDir, { recursive: true });
  const data = { todos, sessionId: sessionId || 'default' };
  await fs.writeFile(todoFilePath, JSON.stringify(data, null, 2), 'utf-8');
}

function extractTextFromQuery(processedQuery: any): string {
  if (Array.isArray(processedQuery)) {
    return processedQuery.map((p: any) => p.text || '').join('\n');
  } else if (processedQuery && typeof processedQuery === 'object') {
    return (processedQuery as any).text || '';
  }
  return '';
}

export async function runNonInteractive(
  config: Config,
  input: string,
  prompt_id: string,
): Promise<void> {
  const consolePatcher = new ConsolePatcher({
    stderr: true,
    debugMode: config.getDebugMode(),
  });

  try {
    consolePatcher.patch();
    process.stdout.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        process.exit(0);
      }
    });

    const sessionId = config.getSessionId();
    const subagentManager = config.getSubagentManager();
    const abortController = new AbortController();

    // --- 1. PRE-PROCESSING (@ COMMANDS) ---
    const { processedQuery, shouldProceed } = await handleAtCommand({
      query: input,
      config,
      addItem: (_item, _timestamp) => 0,
      onDebugMessage: () => {},
      messageId: Date.now(),
      signal: abortController.signal,
    });

    if (!shouldProceed || !processedQuery) {
      throw new FatalInputError(
        'Exiting due to an error processing the @ command.',
      );
    }

    // --- 2. PLANNER PHASE ---
    let currentTodos = await readTodosForSession(sessionId);

    if (currentTodos.length === 0) {
      const plannerConfig = await subagentManager.loadSubagent('planner');
      if (plannerConfig) {
        if (config.getDebugMode()) {
          console.log('No existing plan found. Engaging Planner Agent...');
        }
        const plannerContext = new ContextState();
        
        const queryText = extractTextFromQuery(processedQuery);
        plannerContext.set('task_prompt', queryText);

        const plannerScope = await subagentManager.createSubagentScope(
          plannerConfig,
          config,
        );
        const plannerAbort = new AbortController();
        await plannerScope.runNonInteractive(
          plannerContext,
          plannerAbort.signal,
        );

        if (plannerScope.getTerminateMode() === SubagentTerminateMode.GOAL) {
          currentTodos = await readTodosForSession(sessionId);
          if (currentTodos.length > 0 && config.getDebugMode()) {
            console.log('Plan created successfully.');
          }
        }
      }
    }

    // --- 3. EXECUTION ORCHESTRATOR LOOP ---
    if (currentTodos.length === 0) {
       // Fallback: If no plan could be created, run as a single general-purpose task
       const gpConfig = await subagentManager.loadSubagent('general-purpose');
       if (!gpConfig) throw new Error("General purpose agent not found");
       
       const gpContext = new ContextState();
       const queryText = extractTextFromQuery(processedQuery);
       gpContext.set('task_prompt', queryText);
       
       const gpScope = await subagentManager.createSubagentScope(gpConfig, config);
       await gpScope.runNonInteractive(gpContext, abortController.signal);
       return;
    }

    console.log(`\nStarting execution of ${currentTodos.length} tasks...\n`);

    while (true) {
      // Re-read todos to get latest state
      const todos = await readTodosForSession(sessionId);
      const nextTask = todos.find(
        (t) => t.status === 'pending' || t.status === 'in_progress',
      );

      if (!nextTask) {
        console.log('All tasks completed successfully!');
        break;
      }

      console.log(`\n>>> Executing Task: ${nextTask.content} (${nextTask.status})`);

      // Update status to in_progress if pending
      if (nextTask.status === 'pending') {
        nextTask.status = 'in_progress';
        await writeTodosToFile(todos, sessionId);
      }

      // Prepare SubAgent for this specific task
      const workerConfig = await subagentManager.loadSubagent('general-purpose');
      if (!workerConfig) {
          throw new Error('Could not load general-purpose agent for execution');
      }

      const workerContext = new ContextState();
      const planContext = todos
        .map((t) => `- [${t.status === 'completed' ? 'x' : ' '}] ${t.content}`)
        .join('\n');
      
      const taskPrompt = `
You are the Execution Agent working on a larger project.
Your CURRENT GOAL is to complete this specific task:
"${nextTask.content}"

PROJECT CONTEXT (Plan):
${planContext}

INSTRUCTIONS:
1. Focus ONLY on the current task.
2. Use the available tools (edit, grep, ls, etc.) to execute the task.
3. Verify your work! (e.g., run a build or test if applicable).
4. When you are done, simply finish. Do NOT use the 'todo_write' tool; the system will update the status for you.
`.trim();

      workerContext.set('task_prompt', taskPrompt);

      const workerScope = await subagentManager.createSubagentScope(
        workerConfig,
        config,
      );
      
      const workerAbort = new AbortController();
      await workerScope.runNonInteractive(workerContext, workerAbort.signal);

      // Check result
      const result = workerScope.getTerminateMode();
      if (result === SubagentTerminateMode.GOAL) {
        console.log(`>>> Task Completed: ${nextTask.content}`);
        nextTask.status = 'completed';
        await writeTodosToFile(todos, sessionId);
      } else {
        console.error(`>>> Task Failed: ${nextTask.content}. Reason: ${result}`);
        console.error('Stopping execution due to task failure.');
        break; 
      }
    }

  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig()?.authType,
      ),
    );
    throw error;
  } finally {
    consolePatcher.cleanup();
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry(config);
    }
  }
}
