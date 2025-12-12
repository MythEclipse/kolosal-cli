/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized constants for Kolosal CLI.
 *
 * This file contains all magic numbers and strings used throughout the application
 * to improve maintainability and reduce duplication.
 */

/**
 * Memory configuration constants for Node.js heap management.
 */
export const MEMORY_CONFIG = {
  /** Target heap size as percentage of total system memory (50%) */
  TARGET_HEAP_PERCENTAGE: 0.5,
  /** Minimum heap size in megabytes */
  MIN_HEAP_SIZE_MB: 512,
  /** Maximum heap size in megabytes */
  MAX_HEAP_SIZE_MB: 8192,
} as const;

/**
 * Default port numbers for various servers.
 */
export const DEFAULT_PORTS = {
  /** Default port for the API server */
  API_SERVER: 38080,
  /** Default port for the Kolosal server */
  KOLOSAL_SERVER: 8087,
} as const;

/**
 * Process exit codes following POSIX conventions.
 */
export const EXIT_CODES = {
  /** Successful execution */
  SUCCESS: 0,
  /** General error */
  ERROR: 1,
  /** Interrupted by SIGINT (Ctrl+C) */
  SIGINT: 130,
  /** Terminated by SIGTERM */
  SIGTERM: 143,
} as const;

/**
 * Environment variable names used throughout the application.
 */
export const ENV_VARS = {
  /** API server port environment variable */
  API_PORT: 'KOLOSAL_CLI_API_PORT',
  /** API server host environment variable */
  API_HOST: 'KOLOSAL_CLI_API_HOST',
  /** API enabled flag */
  API_ENABLED: 'KOLOSAL_CLI_API',
  /** API CORS enabled flag */
  API_CORS: 'KOLOSAL_CLI_API_CORS',
  /** Prevent CLI relaunch flag */
  NO_RELAUNCH: 'GEMINI_CLI_NO_RELAUNCH',
  /** Sandbox environment flag */
  SANDBOX: 'SANDBOX',
  /** Debug mode flag */
  DEBUG: 'DEBUG',
  /** Log level */
  LOG_LEVEL: 'LOG_LEVEL',
  /** No color output flag */
  NO_COLOR: 'NO_COLOR',
  /** OpenAI API key */
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  /** CLI title */
  CLI_TITLE: 'CLI_TITLE',
  /** Node environment */
  NODE_ENV: 'NODE_ENV',
} as const;

/**
 * Default host addresses.
 */
export const DEFAULT_HOSTS = {
  /** Localhost IPv4 address */
  LOCALHOST: '127.0.0.1',
  /** IPv6 localhost */
  LOCALHOST_V6: '::1',
} as const;

/**
 * DNS resolution order options.
 */
export const DNS_RESOLUTION_ORDERS = {
  /** IPv4 first (default) */
  IPV4_FIRST: 'ipv4first',
  /** Verbatim order */
  VERBATIM: 'verbatim',
} as const;

/**
 * Valid approval mode values.
 */
export const APPROVAL_MODES = {
  PLAN: 'plan',
  DEFAULT: 'default',
  AUTO_EDIT: 'auto-edit',
  YOLO: 'yolo',
} as const;

/**
 * Boolean-like string values that are considered "true".
 */
export const TRUTHY_VALUES = ['1', 'true', 'yes', 'on'] as const;

/**
 * Common file extensions.
 */
export const FILE_EXTENSIONS = {
  TYPESCRIPT: '.ts',
  TSX: '.tsx',
  JAVASCRIPT: '.js',
  JSON: '.json',
  MARKDOWN: '.md',
} as const;

/**
 * Terminal control sequences.
 */
export const TERMINAL_SEQUENCES = {
  /** Set window title prefix */
  WINDOW_TITLE_PREFIX: '\x1b]2;',
  /** Set window title suffix */
  WINDOW_TITLE_SUFFIX: '\x07',
  /** Reset window title */
  WINDOW_TITLE_RESET: '\x1b]2;\x07',
  /** Clear screen */
  CLEAR_SCREEN: '\x1b[2J\x1b[H',
} as const;

/**
 * Default application name.
 */
export const APP_NAME = 'Kolosal' as const;

/**
 * Timeout values in milliseconds.
 */
export const TIMEOUTS = {
  /** Default HTTP request timeout */
  HTTP_REQUEST: 30000,
  /** Server startup timeout */
  SERVER_STARTUP: 10000,
  /** Cleanup timeout */
  CLEANUP: 5000,
} as const;
