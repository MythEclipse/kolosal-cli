#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './src/gemini.js';
import { main } from './src/gemini.js';
import { FatalError } from '@kolosal-code/kolosal-code-core';
import { logger } from './src/utils/logger.js';
import { ENV_VARS, EXIT_CODES } from './src/constants/index.js';

// --- Global Entry Point ---
main().catch((error) => {
  if (error instanceof FatalError) {
    let errorMessage = error.message;
    if (!process.env[ENV_VARS.NO_COLOR]) {
      errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
    }
    logger.error(errorMessage);
    process.exit(error.exitCode);
  }
  logger.error('An unexpected critical error occurred');
  if (error instanceof Error) {
    logger.error(error.stack || error.message);
  } else {
    logger.error(String(error));
  }
  process.exit(EXIT_CODES.ERROR);
});
