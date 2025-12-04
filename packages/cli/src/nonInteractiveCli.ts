/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  executeToolCall,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  GeminiEventType,
  parseAndFormatApiError,
  FatalInputError,
  FatalTurnLimitedError,
  readTodosForSession,
  ContextState,
  SubagentTerminateMode,
  type Config,
  type ToolCallRequestInfo,
  type TodoItem,
} from '@kolosal-ai/kolosal-ai-core';
import type { Content, Part } from '@google/genai';

import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';

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
    // Handle EPIPE errors when the output is piped to a command that closes early.
    process.stdout.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        // Exit gracefully if the pipe is closed.
        process.exit(0);
      }
    });

    const geminiClient = config.getGeminiClient();

    // --- PLANNER INTEGRATION START ---
    // Check if we already have a plan (todos) for this session
    const sessionId = config.getSessionId();
    let currentTodos = await readTodosForSession(sessionId);
    let planContextString = '';

    // If no plan exists, try to run the planner agent
    if (currentTodos.length === 0) {
      const subagentManager = config.getSubagentManager();
      const plannerConfig = await subagentManager.loadSubagent('planner');

      if (plannerConfig) {
        if (config.getDebugMode()) {
          console.log('No existing plan found. engaging Planner Agent...');
        }
        
        // Create context for planner
        const plannerContext = new ContextState();
        plannerContext.set('task_prompt', input);

        // Create scope
        const plannerScope = await subagentManager.createSubagentScope(
          plannerConfig,
          config
        );

        // Run planner
        // We use a separate abort controller for the planner to isolate it
        const plannerAbortController = new AbortController();
        await plannerScope.runNonInteractive(plannerContext, plannerAbortController.signal);

        // Check if plan was created
        if (plannerScope.getTerminateMode() === SubagentTerminateMode.GOAL) {
           currentTodos = await readTodosForSession(sessionId);
           if (currentTodos.length > 0) {
             if (config.getDebugMode()) {
               console.log('Plan created successfully.');
             }
           }
        }
      }
    }

    // If we have a plan (either pre-existing or just created), inject it into context
    if (currentTodos.length > 0) {
      const todoListString = currentTodos
        .map((t: TodoItem) => `- [${t.status === 'completed' ? 'x' : ' '}] ${t.content} (${t.status})`)
        .join('\n');
      
      planContextString = `\n\nCURRENT PROJECT PLAN (Follow this strictly):\n${todoListString}\n\nTo update the plan, use the 'todo_write' tool.`;
    }
    // --- PLANNER INTEGRATION END ---

    const abortController = new AbortController();

    const { processedQuery, shouldProceed } = await handleAtCommand({
      query: input + planContextString, // Inject plan into the query
      config,
      addItem: (_item, _timestamp) => 0,
      onDebugMessage: () => {},
      messageId: Date.now(),
      signal: abortController.signal,
    });

    if (!shouldProceed || !processedQuery) {
      // An error occurred during @include processing (e.g., file not found).
      // The error message is already logged by handleAtCommand.
      throw new FatalInputError(
        'Exiting due to an error processing the @ command.',
      );
    }

    let currentMessages: Content[] = [
      { role: 'user', parts: processedQuery as Part[] },
    ];

    let turnCount = 0;
    while (true) {
      turnCount++;
      if (
        config.getMaxSessionTurns() >= 0 &&
        turnCount > config.getMaxSessionTurns()
      ) {
        throw new FatalTurnLimitedError(
          'Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
        );
      }
      const toolCallRequests: ToolCallRequestInfo[] = [];

      const responseStream = geminiClient.sendMessageStream(
        currentMessages[0]?.parts || [],
        abortController.signal,
        prompt_id,
      );

      for await (const event of responseStream) {
        if (abortController.signal.aborted) {
          console.error('Operation cancelled.');
          return;
        }

        if (event.type === GeminiEventType.Content) {
          process.stdout.write(event.value);
        } else if (event.type === GeminiEventType.ToolCallRequest) {
          toolCallRequests.push(event.value);
        }
      }

      if (toolCallRequests.length > 0) {
        const toolResponseParts: Part[] = [];
        for (const requestInfo of toolCallRequests) {
          const toolResponse = await executeToolCall(
            config,
            requestInfo,
            abortController.signal,
          );

          if (toolResponse.error) {
            console.error(
              `Error executing tool ${requestInfo.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
            );
          }

          if (toolResponse.responseParts) {
            toolResponseParts.push(...toolResponse.responseParts);
          }
        }
        currentMessages = [{ role: 'user', parts: toolResponseParts }];
      } else {
        process.stdout.write('\n'); // Ensure a final newline
        return;
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
