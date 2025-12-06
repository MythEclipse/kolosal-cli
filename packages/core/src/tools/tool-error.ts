/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A type-safe enum for tool-related errors.
 */
export enum ToolErrorType {
  // General Errors
  INVALID_TOOL_PARAMS = 'invalid_tool_params',
  UNKNOWN = 'unknown',
  UNHANDLED_EXCEPTION = 'unhandled_exception',
  TOOL_NOT_REGISTERED = 'tool_not_registered',
  EXECUTION_FAILED = 'execution_failed',

  // File System Errors
  FILE_NOT_FOUND = 'file_not_found',
  FILE_WRITE_FAILURE = 'file_write_failure',
  READ_CONTENT_FAILURE = 'read_content_failure',
  ATTEMPT_TO_CREATE_EXISTING_FILE = 'attempt_to_create_existing_file',
  FILE_TOO_LARGE = 'file_too_large',
  PERMISSION_DENIED = 'permission_denied',
  NO_SPACE_LEFT = 'no_space_left',
  TARGET_IS_DIRECTORY = 'target_is_directory',
  PATH_NOT_IN_WORKSPACE = 'path_not_in_workspace',
  SEARCH_PATH_NOT_FOUND = 'search_path_not_found',
  SEARCH_PATH_NOT_A_DIRECTORY = 'search_path_not_a_directory',

  // Edit-specific Errors
  EDIT_PREPARATION_FAILURE = 'edit_preparation_failure',
  EDIT_NO_OCCURRENCE_FOUND = 'edit_no_occurrence_found',
  EDIT_EXPECTED_OCCURRENCE_MISMATCH = 'edit_expected_occurrence_mismatch',
  EDIT_NO_CHANGE = 'edit_no_change',

  // Glob-specific Errors
  GLOB_EXECUTION_ERROR = 'glob_execution_error',

  // Grep-specific Errors
  GREP_EXECUTION_ERROR = 'grep_execution_error',

  // Ls-specific Errors
  LS_EXECUTION_ERROR = 'ls_execution_error',
  PATH_IS_NOT_A_DIRECTORY = 'path_is_not_a_directory',

  // MCP-specific Errors
  MCP_TOOL_ERROR = 'mcp_tool_error',

  // Memory-specific Errors
  MEMORY_TOOL_EXECUTION_ERROR = 'memory_tool_execution_error',

  // ReadManyFiles-specific Errors
  READ_MANY_FILES_SEARCH_ERROR = 'read_many_files_search_error',

  // Shell errors
  SHELL_EXECUTE_ERROR = 'shell_execute_error',

  // DiscoveredTool-specific Errors
  DISCOVERED_TOOL_EXECUTION_ERROR = 'discovered_tool_execution_error',

  // WebFetch-specific Errors
  WEB_FETCH_NO_URL_IN_PROMPT = 'web_fetch_no_url_in_prompt',
  WEB_FETCH_FALLBACK_FAILED = 'web_fetch_fallback_failed',
  WEB_FETCH_PROCESSING_ERROR = 'web_fetch_processing_error',

  // WebSearch-specific Errors
  WEB_SEARCH_FAILED = 'web_search_failed',

  // Architecture Tool Errors
  ARCH_ERROR = 'arch_error',

  // Dependency Tools Errors
  DEPENDENCY_DETECTION_ERROR = 'dependency_detection_error',
  CONFLICT_RESOLUTION_ERROR = 'conflict_resolution_error',

  // Collaboration Tool Errors
  COLLAB_ERROR = 'collab_error',

  // Container Tool Errors
  CONTAINER_ERROR = 'container_error',

  // Deployment Tool Errors
  DEPLOYMENT_ERROR = 'deployment_error',

  // Framework Detection Errors
  FRAMEWORK_DETECTION_ERROR = 'framework_detection_error',

  // Documentation Tool Errors
  DOC_ERROR = 'doc_error',

  // Environment Tool Errors
  ENV_ERROR = 'env_error',

  // Git Tools Errors
  GIT_ERROR = 'git_error',

  // Optimization Tool Errors
  OPTIMIZATION_ERROR = 'optimization_error',

  // Build Tool Errors
  BUILD_ERROR = 'build_error',

  // Scaffold Project Tool Errors
  PROJECT_SCAFFOLD_ERROR = 'project_scaffold_error',
}
