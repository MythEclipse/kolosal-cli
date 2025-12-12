/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@kolosal-code/kolosal-code-core';
import {
  ApprovalMode,
  AuthType,
  FatalConfigError,
  getOauthClient,
  IdeConnectionEvent,
  IdeConnectionType,
  logIdeConnection,
  logUserPrompt,
  sessionId,
} from '@kolosal-code/kolosal-code-core';
import { render } from 'ink';
import { spawn } from 'node:child_process';
import dns from 'node:dns';
import os from 'node:os';
import { basename } from 'node:path';
import v8 from 'node:v8';
import React from 'react';
import { validateAuthMethod } from './config/auth.js';
import type { SavedModelEntry } from './config/savedModels.js';
import { loadCliConfig, parseArguments } from './config/config.js';
import { loadExtensions } from './config/extension.js';
import type { DnsResolutionOrder, LoadedSettings } from './config/settings.js';
import { loadSettings } from './config/settings.js';
import { runNonInteractive } from './nonInteractiveCli.js';
import { AppWrapper } from './ui/App.js';
import { setMaxSizedBoxDebugging } from './ui/components/shared/MaxSizedBox.js';
import { SettingsContext } from './ui/contexts/SettingsContext.js';
import { themeManager } from './ui/themes/theme-manager.js';
import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { detectAndEnableKittyProtocol } from './ui/utils/kittyProtocolDetector.js';
import { checkForUpdates } from './ui/utils/updateCheck.js';
import {
  cleanupCheckpoints,
  registerCleanup,
  runExitCleanup,
} from './utils/cleanup.js';
import { AppEvent, appEvents } from './utils/events.js';
import { handleAutoUpdate } from './utils/handleAutoUpdate.js';
import { readStdin } from './utils/readStdin.js';
import { start_sandbox } from './utils/sandbox.js';
import { getStartupWarnings } from './utils/startupWarnings.js';
import { getUserStartupWarnings } from './utils/userStartupWarnings.js';
import { getCliVersion } from './utils/version.js';
import { validateNonInteractiveAuth } from './validateNonInterActiveAuth.js';
import { runZedIntegration } from './zed-integration/zedIntegration.js';
import { logger } from './utils/logger.js';
import {
  MEMORY_CONFIG,
  DEFAULT_PORTS,
  EXIT_CODES,
  ENV_VARS,
  DEFAULT_HOSTS,
  DNS_RESOLUTION_ORDERS,
  TRUTHY_VALUES,
} from './constants/index.js';
import {
  initializeKolosalServer,
  initializeApiServer,
} from './server/server-lifecycle.js';

export function validateDnsResolutionOrder(
  order: string | undefined,
): DnsResolutionOrder {
  const defaultValue: DnsResolutionOrder = DNS_RESOLUTION_ORDERS.IPV4_FIRST;
  if (order === undefined) {
    return defaultValue;
  }
  if (order === DNS_RESOLUTION_ORDERS.IPV4_FIRST || order === DNS_RESOLUTION_ORDERS.VERBATIM) {
    return order;
  }
  // We don't want to throw here, just warn and use the default.
  logger.warn('Invalid DNS resolution order in settings', { order, defaultValue });
  return defaultValue;
}

function getNodeMemoryArgs(_config: Config): string[] {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const heapStats = v8.getHeapStatistics();
  const currentMaxOldSpaceSizeMb = Math.floor(
    heapStats.heap_size_limit / 1024 / 1024,
  );

  // Set target to configured percentage of total memory
  const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * MEMORY_CONFIG.TARGET_HEAP_PERCENTAGE);
  logger.debug('Memory configuration', {
    currentHeapSizeMB: currentMaxOldSpaceSizeMb.toFixed(2),
    targetHeapSizeMB: targetMaxOldSpaceSizeInMB.toFixed(2),
  });

  if (process.env[ENV_VARS.NO_RELAUNCH]) {
    return [];
  }

  if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
    logger.debug('Need to relaunch with more memory', {
      targetMemoryMB: targetMaxOldSpaceSizeInMB.toFixed(2),
    });
    return [`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`];
  }

  return [];
}

async function relaunchWithAdditionalArgs(additionalArgs: string[]) {
  const nodeArgs = [...additionalArgs, ...process.argv.slice(1)];
  const newEnv = { ...process.env, [ENV_VARS.NO_RELAUNCH]: 'true' };

  logger.debug('Relaunching with additional arguments', { additionalArgs });

  const child = spawn(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: newEnv,
  });

  await new Promise((resolve) => child.on('close', resolve));
  process.exit(EXIT_CODES.SUCCESS);
}

export function setupUnhandledRejectionHandler() {
  let unhandledRejectionOccurred = false;
  process.on('unhandledRejection', (reason, _promise) => {
    const errorMessage = `=========================================
This is an unexpected error. Please file a bug report using the /bug tool.
CRITICAL: Unhandled Promise Rejection!
=========================================
Reason: ${reason}${reason instanceof Error && reason.stack
        ? `
Stack trace:
${reason.stack}`
        : ''
      }`;
    appEvents.emit(AppEvent.LogError, errorMessage);
    if (!unhandledRejectionOccurred) {
      unhandledRejectionOccurred = true;
      appEvents.emit(AppEvent.OpenDebugConsole);
    }
  });
}

function ensureDefaultAuthType(_settings: LoadedSettings) {
  // Note: authType is now per-model in savedModels, not a global setting
  // This function is kept for backward compatibility but does nothing
  return;
}

let cleanupHandlersInstalled = false;

function setupProcessExitHandlers(): void {
  if (cleanupHandlersInstalled) {
    return;
  }
  cleanupHandlersInstalled = true;

  const nativeExit = process.exit.bind(process);
  let cleanupInFlight = false;

  const triggerCleanup = (code?: number | string) => {
    if (cleanupInFlight) {
      const immediateCode =
        typeof code === 'number' ? code : process.exitCode ?? 0;
      nativeExit(immediateCode);
      return;
    }

    cleanupInFlight = true;
    const exitCode =
      typeof code === 'number' ? code : process.exitCode ?? 0;

    void runExitCleanup()
      .catch(() => {
        // Swallow cleanup errors; exiting regardless.
      })
      .finally(() => {
        nativeExit(exitCode);
      });
  };

  process.exit = ((code?: number | string) => {
    triggerCleanup(code);
    return undefined as never;
  }) as typeof process.exit;

  const handleSignal = (signal: NodeJS.Signals) => {
    const code = signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : process.exitCode ?? 0;
    triggerCleanup(code);
  };

  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));
  process.once('beforeExit', (code) => {
    triggerCleanup(code);
  });
}

export async function startInteractiveUI(
  config: Config,
  settings: LoadedSettings,
  startupWarnings: string[],
  workspaceRoot: string,
) {
  const version = await getCliVersion();
  // Detect and enable Kitty keyboard protocol once at startup
  await detectAndEnableKittyProtocol();
  setWindowTitle(basename(workspaceRoot), settings);
  const instance = render(
    <React.StrictMode>
      <SettingsContext.Provider value={settings}>
        <AppWrapper
          config={config}
          settings={settings}
          startupWarnings={startupWarnings}
          version={version}
        />
      </SettingsContext.Provider>
    </React.StrictMode>,
    { exitOnCtrlC: false, isScreenReaderEnabled: config.getScreenReader() },
  );

  checkForUpdates()
    .then((info) => {
      handleAutoUpdate(info, settings, config.getProjectRoot());
    })
    .catch((err) => {
      // Silently ignore update check errors.
      if (config.getDebugMode()) {
        console.error('Update check failed:', err);
      }
    });

  registerCleanup(() => instance.unmount());
}

export async function startServerOnly(
  config: Config,
  settings: LoadedSettings,
  _workspaceRoot: string,
): Promise<void> {
  // Server-only mode - no UI, no interactive elements
  // Skip UI initialization, theme loading, and desktop integration
  // But keep essential authentication and client initialization

  // CRITICAL: Initialize the config - this sets up contentGeneratorConfig
  await config.initialize();

  // Get authType from current model (needed for client initialization)
  const { getCurrentModelAuthType, getSavedModelEntry } = await import('./config/savedModels.js');
  const currentModelName = settings.merged.model?.name;
  const savedModels = (settings.merged.model?.savedModels ?? []) as SavedModelEntry[];
  const currentAuthType = getCurrentModelAuthType(currentModelName, savedModels);
  const currentModelEntry = getSavedModelEntry(currentModelName, savedModels);
  const hasStoredApiKey = Boolean(currentModelEntry?.apiKey?.trim());
  const hasPersistedKolosalToken = Boolean(
    typeof settings.merged.kolosalOAuthToken === 'string' &&
    settings.merged.kolosalOAuthToken.trim(),
  );
  const usesOpenAICompatibleProvider = currentModelEntry?.provider === 'openai-compatible';

  // Set approval mode to YOLO before creating the client to ensure all tools are available
  const originalApprovalMode = config.getApprovalMode();
  config.setApprovalMode(ApprovalMode.YOLO);

  // CRITICAL: Create the Gemini client by calling refreshAuth
  // This is what actually creates this.geminiClient
  try {
    await config.refreshAuth(currentAuthType || AuthType.NO_AUTH);
  } catch (err) {
    if (config.getDebugMode()) {
      console.error('[server-only] Client initialization failed:', err);
    }
    // Continue anyway - some operations might work without auth
  }

  // Restore original approval mode after client creation
  config.setApprovalMode(originalApprovalMode);

  // Handle additional authentication if needed
  const shouldPreAuthenticate =
    currentAuthType === AuthType.USE_OPENAI &&
    config.isBrowserLaunchSuppressed() &&
    !hasStoredApiKey &&
    !hasPersistedKolosalToken &&
    !usesOpenAICompatibleProvider;

  if (shouldPreAuthenticate) {
    try {
      await getOauthClient(currentAuthType, config);
    } catch (err) {
      logger.error('[server-only] Authentication failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue anyway - some operations might work without auth
    }
  }

  // Start kolosal-server in the background if enabled
  await initializeKolosalServer(config, {
    debug: config.getDebugMode(),
    autoStart: true,
    port: DEFAULT_PORTS.KOLOSAL_SERVER,
  });

  // Start API server with forced enabled state for server-only mode
  try {
    const port = Number(process.env[ENV_VARS.API_PORT] ?? settings.merged.api?.port ?? DEFAULT_PORTS.API_SERVER);
    const host = process.env[ENV_VARS.API_HOST] ?? settings.merged.api?.host ?? DEFAULT_HOSTS.LOCALHOST;

    await initializeApiServer(config, {
      port,
      host,
      enableCors: true,
    });

    // Always log debug info in server-only mode for troubleshooting
    logger.info('[server-only] API server listening', { url: `http://${host}:${port}` });
    logger.info('[server-only] Configuration', {
      model: currentModelName,
      auth: currentAuthType,
      excludedTools: config.getExcludeTools(),
    });
  } catch (e) {
    logger.error('Failed to start API server in server-only mode', {
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }

  // Keep the process alive and handle graceful shutdown
  const shutdown = async () => {
    logger.debug('[server-only] Shutting down...');
    await runExitCleanup();
    process.exit(EXIT_CODES.SUCCESS);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.once('SIGUSR2', shutdown); // For nodemon

  // Log startup completion only in debug mode
  if (config.getDebugMode()) {
    console.error(`[server-only] Kolosal CLI server ready on port ${process.env['KOLOSAL_CLI_API_PORT'] ?? 38080}`);
  }
}

export async function main() {
  setupProcessExitHandlers();
  setupUnhandledRejectionHandler();
  const workspaceRoot = process.cwd();
  const settings = loadSettings(workspaceRoot);

  ensureDefaultAuthType(settings);

  await cleanupCheckpoints();
  if (settings.errors.length > 0) {
    const errorMessages = settings.errors.map(
      (error) => `Error in ${error.path}: ${error.message}`,
    );
    throw new FatalConfigError(
      `${errorMessages.join('\n')}\nPlease fix the configuration file(s) and try again.`,
    );
  }

  const argv = await parseArguments(settings.merged);
  const extensions = loadExtensions(workspaceRoot);

  const config = await loadCliConfig(
    settings.merged,
    extensions,
    sessionId,
    argv,
  );

  const consolePatcher = new ConsolePatcher({
    stderr: true,
    debugMode: config.getDebugMode(),
  });
  consolePatcher.patch();
  registerCleanup(consolePatcher.cleanup);

  dns.setDefaultResultOrder(
    validateDnsResolutionOrder(settings.merged.advanced?.dnsResolutionOrder),
  );

  if (argv.promptInteractive && !process.stdin.isTTY) {
    logger.error('The --prompt-interactive flag is not supported when piping input from stdin');
    process.exit(EXIT_CODES.ERROR);
  }

  if (config.getListExtensions()) {
    logger.info('Installed extensions:');
    for (const extension of extensions) {
      logger.info(`- ${extension.config.name}`);
    }
    process.exit(EXIT_CODES.SUCCESS);
  }
  // Clean up empty API keys
  if (process.env[ENV_VARS.OPENAI_API_KEY]?.trim() === '') {
    delete process.env[ENV_VARS.OPENAI_API_KEY];
  }

  setMaxSizedBoxDebugging(config.getDebugMode());

  // Check for server-only mode first (before config.initialize())
  if (argv.serverOnly) {
    // Override API settings for server-only mode
    process.env[ENV_VARS.API_ENABLED] = 'true'; // Force API enabled
    if (argv.apiPort) {
      process.env[ENV_VARS.API_PORT] = argv.apiPort.toString();
    }
    if (argv.apiHost) {
      process.env[ENV_VARS.API_HOST] = argv.apiHost;
    }

    await startServerOnly(config, settings, workspaceRoot);
    return; // Exit early for server-only mode
  }

  await config.initialize();

  // Optionally start lightweight HTTP API server to expose generation endpoints
  const apiEnabledEnv = process.env[ENV_VARS.API_ENABLED];
  const apiEnabledSetting = settings.merged.api?.enabled ?? true;
  const apiEnabled = apiEnabledEnv != null
    ? (TRUTHY_VALUES as readonly string[]).includes(String(apiEnabledEnv).toLowerCase())
    : apiEnabledSetting;

  if (apiEnabled) {
    try {
      const port = Number(argv.apiPort ?? process.env[ENV_VARS.API_PORT] ?? settings.merged.api?.port ?? DEFAULT_PORTS.API_SERVER);
      const host = argv.apiHost ?? process.env[ENV_VARS.API_HOST] ?? settings.merged.api?.host ?? DEFAULT_HOSTS.LOCALHOST;
      const corsEnabledEnv = process.env[ENV_VARS.API_CORS] ?? '';
      const corsEnabled = corsEnabledEnv
        ? (TRUTHY_VALUES.slice(0, 3) as readonly string[]).includes(String(corsEnabledEnv).toLowerCase())
        : settings.merged.api?.corsEnabled ?? true;

      await initializeApiServer(config, {
        port,
        host,
        enableCors: corsEnabled,
      });
    } catch (e) {
      logger.error('Failed to start API server', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Start kolosal-server in the background if enabled
  await initializeKolosalServer(config, {
    debug: config.getDebugMode(),
    autoStart: true,
    port: DEFAULT_PORTS.KOLOSAL_SERVER,
  });

  if (config.getIdeMode()) {
    await config.getIdeClient().connect();
    logIdeConnection(config, new IdeConnectionEvent(IdeConnectionType.START));
  }

  // Load custom themes from settings
  themeManager.loadCustomThemes(settings.merged.ui?.customThemes);

  if (settings.merged.ui?.theme) {
    if (!themeManager.setActiveTheme(settings.merged.ui?.theme)) {
      // If the theme is not found during initial load, log a warning and continue.
      // The useThemeCommand hook in App.tsx will handle opening the dialog.
      logger.warn('Theme not found', { theme: settings.merged.ui?.theme });
    }
  }

  // Get authType from current model (used in multiple places below)
  const { getCurrentModelAuthType, getSavedModelEntry } = await import('./config/savedModels.js');
  const currentModelName = settings.merged.model?.name;
  const savedModels = (settings.merged.model?.savedModels ?? []) as SavedModelEntry[];
  const currentAuthType = getCurrentModelAuthType(currentModelName, savedModels);
  const currentModelEntry = getSavedModelEntry(currentModelName, savedModels);
  const hasStoredApiKey = Boolean(currentModelEntry?.apiKey?.trim());
  const hasPersistedKolosalToken = Boolean(
    typeof settings.merged.kolosalOAuthToken === 'string' &&
    settings.merged.kolosalOAuthToken.trim(),
  );
  const usesOpenAICompatibleProvider = currentModelEntry?.provider === 'openai-compatible';

  // hop into sandbox if we are outside and sandboxing is enabled
  if (!process.env['SANDBOX']) {
    const memoryArgs = settings.merged.advanced?.autoConfigureMemory
      ? getNodeMemoryArgs(config)
      : [];
    const sandboxConfig = config.getSandbox();
    if (sandboxConfig) {
      if (
        currentAuthType &&
        !settings.merged.security?.auth?.useExternal
      ) {
        // Validate authentication here because the sandbox will interfere with the Oauth2 web redirect.
        try {
          const err = validateAuthMethod(currentAuthType);
          if (err) {
            throw new Error(err);
          }
          await config.refreshAuth(currentAuthType);
        } catch (err) {
          logger.error('Error authenticating', {
            error: err instanceof Error ? err.message : String(err),
          });
          process.exit(EXIT_CODES.ERROR);
        }
      }
      let stdinData = '';
      if (!process.stdin.isTTY) {
        stdinData = await readStdin();
      }

      // This function is a copy of the one from sandbox.ts
      // It is moved here to decouple sandbox.ts from the CLI's argument structure.
      const injectStdinIntoArgs = (
        args: string[],
        stdinData?: string,
      ): string[] => {
        const finalArgs = [...args];
        if (stdinData) {
          const promptIndex = finalArgs.findIndex(
            (arg) => arg === '--prompt' || arg === '-p',
          );
          if (promptIndex > -1 && finalArgs.length > promptIndex + 1) {
            // If there's a prompt argument, prepend stdin to it
            finalArgs[promptIndex + 1] =
              `${stdinData}\n\n${finalArgs[promptIndex + 1]}`;
          } else {
            // If there's no prompt argument, add stdin as the prompt
            finalArgs.push('--prompt', stdinData);
          }
        }
        return finalArgs;
      };

      const sandboxArgs = injectStdinIntoArgs(process.argv, stdinData);

      await start_sandbox(sandboxConfig, memoryArgs, config, sandboxArgs);
      process.exit(0);
    } else {
      // Not in a sandbox and not entering one, so relaunch with additional
      // arguments to control memory usage if needed.
      if (memoryArgs.length > 0) {
        await relaunchWithAdditionalArgs(memoryArgs);
        process.exit(0);
      }
    }
  }

  const shouldPreAuthenticate =
    currentAuthType === AuthType.USE_OPENAI &&
    config.isBrowserLaunchSuppressed() &&
    !hasStoredApiKey &&
    !hasPersistedKolosalToken &&
    !usesOpenAICompatibleProvider;

  if (shouldPreAuthenticate) {
    // Legacy Google OAuth flow: keep existing behaviour when no compatible API key is available.
    await getOauthClient(currentAuthType, config);
  }

  if (config.getExperimentalZedIntegration()) {
    return runZedIntegration(config, settings, extensions, argv);
  }

  let input = config.getQuestion();
  const startupWarnings = [
    ...(await getStartupWarnings()),
    ...(await getUserStartupWarnings(workspaceRoot)),
  ];

  // Render UI, passing necessary config values. Check that there is no command line question.
  if (config.isInteractive()) {
    await startInteractiveUI(config, settings, startupWarnings, workspaceRoot);
    return;
  }
  // If not a TTY, read from stdin
  // This is for cases where the user pipes input directly into the command
  if (!process.stdin.isTTY) {
    const stdinData = await readStdin();
    if (stdinData) {
      input = `${stdinData}\n\n${input}`;
    }
  }
  if (!input) {
    console.error(
      `No input provided via stdin. Input can be provided by piping data into gemini or using the --prompt option.`,
    );
    process.exit(1);
  }

  const prompt_id = Math.random().toString(16).slice(2);
  logUserPrompt(config, {
    'event.name': 'user_prompt',
    'event.timestamp': new Date().toISOString(),
    prompt: input,
    prompt_id,
    auth_type: config.getContentGeneratorConfig()?.authType,
    prompt_length: input.length,
  });

  // Automatically use NO_AUTH for local models in non-interactive mode
  let effectiveAuthType = settings.merged.security?.auth?.selectedType;
  const currentProvider = settings.merged.contentGenerator?.provider;
  if (currentProvider === 'oss-local' && effectiveAuthType !== AuthType.NO_AUTH) {
    effectiveAuthType = AuthType.NO_AUTH;
  }

  const nonInteractiveConfig = await validateNonInteractiveAuth(
    effectiveAuthType,
    settings.merged.security?.auth?.useExternal,
    config,
  );

  logger.debug('Session ID', { sessionId });

  await runNonInteractive(nonInteractiveConfig, input, prompt_id);
  process.exit(EXIT_CODES.SUCCESS);
}

function setWindowTitle(title: string, settings: LoadedSettings) {
  if (!settings.merged.ui?.hideWindowTitle) {
    const windowTitle = (process.env['CLI_TITLE'] || `Kolosal - ${title}`).replace(
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1F\x7F]/g,
      '',
    );
    process.stdout.write(`\x1b]2;${windowTitle}\x07`);

    process.on('exit', () => {
      process.stdout.write(`\x1b]2;\x07`);
    });
  }
}
