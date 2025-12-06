/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitStatusTool, GitCommitTool, GitBranchTool, GitLogTool } from './git-tools.js';
import type { Config } from '../config/config.js';

describe('GitTools', () => {
  let mockConfig: Config;
  let mockGitService: any;

  beforeEach(() => {
    mockGitService = {
      status: vi.fn(),
      add: vi.fn(),
      commit: vi.fn(),
      branch: vi.fn(),
      checkout: vi.fn(),
      merge: vi.fn(),
      log: vi.fn(),
    };

    mockConfig = {
      getGitService: vi.fn().mockResolvedValue(mockGitService),
      getTargetDir: vi.fn().mockReturnValue('/mock/target/dir'),
    } as unknown as Config;
  });

  describe('GitStatusTool', () => {
    it('should be instantiated correctly', () => {
      const tool = new GitStatusTool(mockConfig);
      expect(tool).toBeDefined();
      expect(tool.name).toBe('git_status');
    });
  });

  describe('GitCommitTool', () => {
    it('should be instantiated correctly', () => {
      const tool = new GitCommitTool(mockConfig);
      expect(tool).toBeDefined();
      expect(tool.name).toBe('git_commit');
    });
  });

  describe('GitBranchTool', () => {
    it('should be instantiated correctly', () => {
      const tool = new GitBranchTool(mockConfig);
      expect(tool).toBeDefined();
      expect(tool.name).toBe('git_branch');
    });
  });

  describe('GitLogTool', () => {
    it('should be instantiated correctly', () => {
      const tool = new GitLogTool(mockConfig);
      expect(tool).toBeDefined();
      expect(tool.name).toBe('git_log');
    });
  });
});
