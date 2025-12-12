/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized logging system for Kolosal CLI.
 *
 * This logger provides structured, level-based logging with support for:
 * - Different log levels (debug, info, warn, error)
 * - Environment-based level control
 * - Structured data logging
 * - Consistent output formatting
 *
 * @example
 * ```typescript
 * import { logger } from './utils/logger.js';
 *
 * logger.info('Application started', { version: '1.0.0' });
 * logger.debug('Processing request', { requestId: '123' });
 * logger.warn('Deprecated feature used', { feature: 'oldApi' });
 * logger.error('Failed to connect', { error: err.message });
 * ```
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

interface LoggerOptions {
  level: LogLevel;
  debugMode?: boolean;
}

class Logger {
  private level: LogLevel;
  private debugMode: boolean;

  constructor(options: LoggerOptions) {
    this.level = options.level;
    this.debugMode = options.debugMode ?? false;
  }

  /**
   * Set the minimum log level. Messages below this level will be suppressed.
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Enable or disable debug mode. When enabled, debug logs are shown.
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    if (enabled && this.level > LogLevel.DEBUG) {
      this.level = LogLevel.DEBUG;
    }
  }

  /**
   * Log a debug message. Only shown when debug mode is enabled.
   */
  debug(message: string, data?: Record<string, unknown>): void {
    if (this.debugMode && this.level <= LogLevel.DEBUG) {
      this.log('DEBUG', message, data);
    }
  }

  /**
   * Log an informational message.
   */
  info(message: string, data?: Record<string, unknown>): void {
    if (this.level <= LogLevel.INFO) {
      this.log('INFO', message, data);
    }
  }

  /**
   * Log a warning message.
   */
  warn(message: string, data?: Record<string, unknown>): void {
    if (this.level <= LogLevel.WARN) {
      this.log('WARN', message, data);
    }
  }

  /**
   * Log an error message.
   */
  error(message: string, data?: Record<string, unknown>): void {
    if (this.level <= LogLevel.ERROR) {
      this.log('ERROR', message, data);
    }
  }

  /**
   * Internal method to format and output log messages.
   */
  private log(
    level: string,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const timestamp = new Date().toISOString();
    let output = `[${timestamp}] [${level}] ${message}`;

    if (data && Object.keys(data).length > 0) {
      output += ` ${JSON.stringify(data)}`;
    }

    // Use stderr for all logs to avoid interfering with stdout
    // which may be used for actual CLI output
    if (level === 'ERROR' || level === 'WARN') {
      console.error(output);
    } else {
      console.error(output);
    }
  }
}

// Parse log level from environment variable
function getLogLevelFromEnv(): LogLevel {
  const envLevel = process.env['LOG_LEVEL']?.toUpperCase();
  switch (envLevel) {
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    case 'SILENT':
      return LogLevel.SILENT;
    default:
      return LogLevel.INFO;
  }
}

// Create and export the default logger instance
export const logger = new Logger({
  level: getLogLevelFromEnv(),
  debugMode:
    process.env['DEBUG'] === 'true' ||
    process.env['NODE_ENV'] === 'development',
});
