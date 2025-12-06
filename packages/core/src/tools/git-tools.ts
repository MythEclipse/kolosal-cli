/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolResult } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { getErrorMessage } from '../utils/errors.js';

// --- Git Status Tool ---

interface GitStatusParams {}

export class GitStatusTool extends BaseDeclarativeTool<GitStatusParams, ToolResult> {
  static readonly Name = 'git_status';

  constructor(private readonly config: Config) {
    super(
      GitStatusTool.Name,
      'GitStatus',
      'Get the current status of the git repository (staged, modified, untracked files).',
      Kind.Read,
      {
        type: 'object',
        properties: {},
      }
    );
  }

  protected createInvocation(params: GitStatusParams): BaseToolInvocation<GitStatusParams, ToolResult> {
    return new GitStatusInvocation(this.config, params);
  }
}

class GitStatusInvocation extends BaseToolInvocation<GitStatusParams, ToolResult> {
  constructor(private readonly config: Config, params: GitStatusParams) {
    super(params);
  }

  getDescription(): string {
    return 'Checking git status';
  }

  async execute(): Promise<ToolResult> {
    try {
      const gitService = await this.config.getGitService();
      const status = await gitService.status();
      
      const clean = status.isClean() ? 'Working tree clean' : 'Working tree has changes';
      const staged = status.staged.length > 0 ? `Staged: ${status.staged.join(', ')}` : '';
      const modified = status.modified.length > 0 ? `Modified: ${status.modified.join(', ')}` : '';
      const not_added = status.not_added.length > 0 ? `Untracked: ${status.not_added.join(', ')}` : '';
      
      const output = [
        `Branch: ${status.current}`,
        clean,
        staged,
        modified,
        not_added
      ].filter(Boolean).join('\n');

      return {
        llmContent: output,
        returnDisplay: output
      };
    } catch (error) {
      return {
        llmContent: `Error checking git status: ${getErrorMessage(error)}`,
        returnDisplay: `Error checking git status: ${getErrorMessage(error)}`,
        error: {
          message: getErrorMessage(error),
          type: ToolErrorType.GIT_ERROR
        }
      };
    }
  }
}

// --- Git Commit Tool ---

interface GitCommitParams {
  message: string;
  files?: string[]; // If provided, only add and commit these files. If empty, commit staged.
  addAll?: boolean; // If true, add all changes before committing.
}

export class GitCommitTool extends BaseDeclarativeTool<GitCommitParams, ToolResult> {
  static readonly Name = 'git_commit';

  constructor(private readonly config: Config) {
    super(
      GitCommitTool.Name,
      'GitCommit',
      'Commit changes to the git repository.',
      Kind.Create,
      {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' },
          files: { type: 'array', items: { type: 'string' }, description: 'Specific files to add and commit' },
          addAll: { type: 'boolean', description: 'Add all changes (git add .) before committing' }
        },
        required: ['message']
      }
    );
  }

  protected createInvocation(params: GitCommitParams): BaseToolInvocation<GitCommitParams, ToolResult> {
    return new GitCommitInvocation(this.config, params);
  }
}

class GitCommitInvocation extends BaseToolInvocation<GitCommitParams, ToolResult> {
  constructor(private readonly config: Config, params: GitCommitParams) {
    super(params);
  }

  getDescription(): string {
    return `Committing changes: ${this.params.message}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const gitService = await this.config.getGitService();
      
      if (this.params.addAll) {
        await gitService.add(['.']);
      } else if (this.params.files && this.params.files.length > 0) {
        await gitService.add(this.params.files);
      }

      const result = await gitService.commit(this.params.message);
      
      const output = `Commit successful: ${result.commit}
Branch: ${result.branch}
Summary: ${result.summary.changes} changes, ${result.summary.insertions} insertions(+), ${result.summary.deletions} deletions(-)
`;

      return {
        llmContent: output,
        returnDisplay: output
      };
    } catch (error) {
      return {
        llmContent: `Error committing changes: ${getErrorMessage(error)}`,
        returnDisplay: `Error committing changes: ${getErrorMessage(error)}`,
        error: {
          message: getErrorMessage(error),
          type: ToolErrorType.GIT_ERROR
        }
      };
    }
  }
}

// --- Git Branch Tool ---

interface GitBranchParams {
  action: 'list' | 'create' | 'checkout' | 'merge';
  branchName?: string;
  createIfNeeded?: boolean; // For checkout
}

export class GitBranchTool extends BaseDeclarativeTool<GitBranchParams, ToolResult> {
  static readonly Name = 'git_branch';

  constructor(private readonly config: Config) {
    super(
      GitBranchTool.Name,
      'GitBranch',
      'Manage git branches (list, create, checkout, merge).',
      Kind.Other,
      {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create', 'checkout', 'merge'], description: 'Action to perform' },
          branchName: { type: 'string', description: 'Branch name (required for create, checkout, merge)' },
          createIfNeeded: { type: 'boolean', description: 'Create branch if it does not exist (only for checkout)' }
        },
        required: ['action']
      }
    );
  }

  protected createInvocation(params: GitBranchParams): BaseToolInvocation<GitBranchParams, ToolResult> {
    return new GitBranchInvocation(this.config, params);
  }
}

class GitBranchInvocation extends BaseToolInvocation<GitBranchParams, ToolResult> {
  constructor(private readonly config: Config, params: GitBranchParams) {
    super(params);
  }

  getDescription(): string {
    return `Git branch operation: ${this.params.action} ${this.params.branchName || ''}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const gitService = await this.config.getGitService();
      const { action, branchName, createIfNeeded } = this.params;

      let output = '';

      switch (action) {
        case 'list': {
          const summary = await gitService.branch();
          output = `Current branch: ${summary.current}
Branches:
${summary.all.map(b => `- ${b}`).join('\n')}`;
          break;
        }
        case 'create': {
          if (!branchName) throw new Error('Branch name is required for create action');
          await gitService.branch(branchName);
          output = `Branch '${branchName}' created.`;
          break;
        }
        case 'checkout': {
          if (!branchName) throw new Error('Branch name is required for checkout action');
          await gitService.checkout(branchName, createIfNeeded);
          output = `Checked out branch '${branchName}'.`;
          break;
        }
        case 'merge': {
          if (!branchName) throw new Error('Branch name is required for merge action');
          const result = await gitService.merge(branchName);
          output = `Merged branch '${branchName}'. ${result.result}`;
          break;
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return {
        llmContent: output,
        returnDisplay: output
      };
    } catch (error) {
      return {
        llmContent: `Error with git branch operation: ${getErrorMessage(error)}`,
        returnDisplay: `Error with git branch operation: ${getErrorMessage(error)}`,
        error: {
          message: getErrorMessage(error),
          type: ToolErrorType.GIT_ERROR
        }
      };
    }
  }
}

// --- Git Log Tool ---

interface GitLogParams {
  maxCount?: number;
}

export class GitLogTool extends BaseDeclarativeTool<GitLogParams, ToolResult> {
  static readonly Name = 'git_log';

  constructor(private readonly config: Config) {
    super(
      GitLogTool.Name,
      'GitLog',
      'View git commit history.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          maxCount: { type: 'number', description: 'Maximum number of commits to show (default: 10)' }
        }
      }
    );
  }

  protected createInvocation(params: GitLogParams): BaseToolInvocation<GitLogParams, ToolResult> {
    return new GitLogInvocation(this.config, params);
  }
}

class GitLogInvocation extends BaseToolInvocation<GitLogParams, ToolResult> {
  constructor(private readonly config: Config, params: GitLogParams) {
    super(params);
  }

  getDescription(): string {
    return 'Reading git log';
  }

  async execute(): Promise<ToolResult> {
    try {
      const gitService = await this.config.getGitService();
      const log = await gitService.log(this.params.maxCount);
      
      const output = log.all.map(commit => 
        `[${commit.hash.substring(0, 7)}] ${commit.date} - ${commit.message} (${commit.author_name})`
      ).join('\n');

      return {
        llmContent: output || 'No commits found.',
        returnDisplay: output || 'No commits found.'
      };
    } catch (error) {
      return {
        llmContent: `Error reading git log: ${getErrorMessage(error)}`,
        returnDisplay: `Error reading git log: ${getErrorMessage(error)}`,
        error: {
          message: getErrorMessage(error),
          type: ToolErrorType.GIT_ERROR
        }
      };
    }
  }
}
