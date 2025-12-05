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
  type Config,
} from '@kolosal-ai/kolosal-ai-core';
import { Orchestrator } from '../../core/src/planning/orchestrator.js'; // Corrected path
import * as process from 'process';

import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';



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
  _prompt_id: string,
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

    // --- 2. ORCHESTRATOR PHASE ---
    const orchestrator = new Orchestrator(config);
    const finalResult = await orchestrator.executeTask(extractTextFromQuery(processedQuery));
    console.log('\n=========================================');
    console.log('Orchestrator Final Result:');
    console.log(finalResult);
    console.log('=========================================');


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
