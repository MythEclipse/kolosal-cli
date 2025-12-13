/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tool name constants to avoid circular dependencies.
 * These constants are used across multiple files and should be kept in sync
 * with the actual tool class names.
 */
export enum ToolNames {
  READ_FILE = 'read_file',
  READ_MANY_FILES = 'read_many_files',
  WRITE_FILE = 'write_file',
  EDIT = 'replace',
  BATCH_EDIT = 'batch_replace',
  RUN_SHELL_COMMAND = 'run_shell_command',
  SHELL = 'shell',
  TODO_WRITE = 'todo_write',
  GREP = 'grep',
  GLOB = 'glob',
  TASK = 'task',
  MEMORY = 'save_memory',
  EXIT_PLAN_MODE = 'exit_plan_mode',
  DIAGNOSTICS = 'diagnostics',
  GENERATE_CODE = 'generate_code',
}
