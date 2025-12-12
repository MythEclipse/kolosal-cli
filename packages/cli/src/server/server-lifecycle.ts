/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@kolosal-code/kolosal-code-core';
import { logger } from '../utils/logger.js';
import { registerCleanup } from '../utils/cleanup.js';
import {
  startServerIfEnabled,
  stopGlobalServer,
} from './kolosal-server-manager.js';

/**
 * Options for initializing the Kolosal server.
 */
export interface KolosalServerOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** Auto-start the server */
  autoStart?: boolean;
  /** Server port */
  port?: number;
}

/**
 * Initialize and start the Kolosal server with proper cleanup registration.
 *
 * This function eliminates code duplication between main() and startServerOnly()
 * by providing a single, well-tested implementation of server lifecycle management.
 *
 * @param config - Application configuration
 * @param options - Server initialization options
 * @returns The server manager instance, or null if server is not started
 *
 * @example
 * ```typescript
 * const serverManager = await initializeKolosalServer(config, {
 *   debug: true,
 *   autoStart: true,
 *   port: 8087
 * });
 * ```
 */
export async function initializeKolosalServer(
  config: Config,
  options: KolosalServerOptions = {},
): Promise<ReturnType<typeof startServerIfEnabled>> {
  const {
    debug = config.getDebugMode(),
    autoStart = true,
    port = 8087,
  } = options;

  logger.debug('Initializing Kolosal server', { debug, autoStart, port });

  // Start the Kolosal server in the background if enabled
  const serverManager = await startServerIfEnabled({
    debug,
    autoStart,
    port,
  });

  // Register cleanup handler to stop the server when CLI exits
  if (serverManager) {
    registerCleanup(async () => {
      try {
        logger.debug('Stopping Kolosal server');
        await stopGlobalServer();
      } catch (error) {
        logger.error('Error stopping Kolosal server', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    logger.debug('Kolosal server initialized successfully');
  }

  return serverManager;
}

/**
 * Options for initializing the API server.
 */
export interface ApiServerOptions {
  /** Server port */
  port: number;
  /** Server host */
  host: string;
  /** Enable CORS */
  enableCors: boolean;
}

/**
 * Initialize and start the API server with proper cleanup registration.
 *
 * @param config - Application configuration
 * @param options - API server options
 * @returns The API server instance
 *
 * @throws Error if the API server fails to start
 *
 * @example
 * ```typescript
 * const apiServer = await initializeApiServer(config, {
 *   port: 38080,
 *   host: '127.0.0.1',
 *   enableCors: true
 * });
 * ```
 */
export async function initializeApiServer(
  config: Config,
  options: ApiServerOptions,
): Promise<{ close: () => Promise<void> }> {
  const { port, host, enableCors } = options;

  logger.debug('Initializing API server', { port, host, enableCors });

  try {
    const { startApiServer } = await import('@kolosal-ai/api-server');

    const apiServer = await startApiServer(config, {
      port,
      host,
      enableCors,
    });

    // Register cleanup handler
    registerCleanup(async () => {
      try {
        logger.debug('Stopping API server');
        await apiServer.close();
      } catch (error) {
        // Ignore cleanup errors
        logger.debug('Error during API server cleanup', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    logger.info('API server started', { url: `http://${host}:${port}` });

    return apiServer;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to start API server', { error: errorMessage });
    throw error;
  }
}
