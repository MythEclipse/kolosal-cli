/* eslint-disable vitest/no-conditional-expect, vitest/no-disabled-tests */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CodingOrchestrator,
  WorkflowStage,
  createWorkflowContext,
  isValidTransition,
  getStageName,
  getGlobalOrchestrator,
  resetGlobalOrchestrator,
} from './index.js';

// Mock config
const mockConfig = {
  getDebugMode: vi.fn().mockReturnValue(false),
} as unknown as import('../config/config.js').Config;

describe('WorkflowContext', () => {
  describe('createWorkflowContext()', () => {
    it('should create context with unique ID', () => {
      const ctx1 = createWorkflowContext({ message: 'test1' });
      const ctx2 = createWorkflowContext({ message: 'test2' });

      expect(ctx1.id).toBeDefined();
      expect(ctx2.id).toBeDefined();
      expect(ctx1.id).not.toBe(ctx2.id);
    });

    it('should initialize with INTAKE stage', () => {
      const ctx = createWorkflowContext({ message: 'test' });
      expect(ctx.currentStage).toBe(WorkflowStage.INTAKE);
    });

    it('should store request', () => {
      const request = { message: 'Add authentication' };
      const ctx = createWorkflowContext(request);
      expect(ctx.request).toEqual(request);
    });
  });

  describe('isValidTransition()', () => {
    it('should allow valid transitions', () => {
      expect(
        isValidTransition(WorkflowStage.INTAKE, WorkflowStage.PLANNING),
      ).toBe(true);
      expect(
        isValidTransition(WorkflowStage.PLANNING, WorkflowStage.CODING),
      ).toBe(true);
      expect(
        isValidTransition(WorkflowStage.CODING, WorkflowStage.TESTING),
      ).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(
        isValidTransition(WorkflowStage.COMPLETED, WorkflowStage.INTAKE),
      ).toBe(false);
      expect(
        isValidTransition(WorkflowStage.INTAKE, WorkflowStage.COMPLETED),
      ).toBe(false);
    });
  });

  describe('getStageName()', () => {
    it('should return emoji prefixed names', () => {
      expect(getStageName(WorkflowStage.PLANNING)).toContain('Planning');
      expect(getStageName(WorkflowStage.CODING)).toContain('Coding');
    });
  });
});

describe('CodingOrchestrator', () => {
  let orchestrator: CodingOrchestrator;

  beforeEach(() => {
    orchestrator = new CodingOrchestrator(mockConfig, { debug: false });
    resetGlobalOrchestrator();
  });

  describe('startWorkflow()', () => {
    it('should create workflow context', async () => {
      const ctx = await orchestrator.startWorkflow({
        message: 'Add user authentication',
      });

      expect(ctx).toBeDefined();
      expect(ctx.id).toBeDefined();
      expect(ctx.currentStage).toBe(WorkflowStage.INTAKE);
    });

    it('should analyze request type', async () => {
      const bugfix = await orchestrator.startWorkflow({
        message: 'Fix the login bug',
      });
      expect(bugfix.request.type).toBe('bugfix');

      const feature = await orchestrator.startWorkflow({
        message: 'Add new feature for user profiles',
      });
      expect(feature.request.type).toBe('feature');
    });

    it('should estimate complexity', async () => {
      const simple = await orchestrator.startWorkflow({
        message: 'Fix simple typo',
      });

      const complex = await orchestrator.startWorkflow({
        message:
          'Implement complex authentication system with OAuth, JWT, and session management for large enterprise application',
      });

      expect(simple.request.complexity).toBeLessThan(
        complex.request.complexity!,
      );
    });
  });

  describe('executeStage()', () => {
    it('should return success for intake stage', async () => {
      const ctx = await orchestrator.startWorkflow({ message: 'test' });
      const result = await orchestrator.executeStage(ctx, WorkflowStage.INTAKE);

      expect(result.success).toBe(true);
      expect(result.stage).toBe(WorkflowStage.INTAKE);
    });

    it('should track duration', async () => {
      const ctx = await orchestrator.startWorkflow({ message: 'test' });
      const result = await orchestrator.executeStage(ctx, WorkflowStage.INTAKE);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('transitionTo()', () => {
    it('should allow valid transitions', async () => {
      const ctx = await orchestrator.startWorkflow({ message: 'test' });
      const success = await orchestrator.transitionTo(
        ctx,
        WorkflowStage.PLANNING,
      );

      expect(success).toBe(true);
      expect(ctx.currentStage).toBe(WorkflowStage.PLANNING);
    });

    it('should reject invalid transitions', async () => {
      const ctx = await orchestrator.startWorkflow({ message: 'test' });
      const success = await orchestrator.transitionTo(
        ctx,
        WorkflowStage.COMPLETED,
      );

      expect(success).toBe(false);
    });
  });

  describe('pause/resume', () => {
    it('should pause workflow', async () => {
      const ctx = await orchestrator.startWorkflow({ message: 'test' });
      orchestrator.pause(ctx);

      expect(ctx.paused).toBe(true);
    });

    it('should resume workflow', async () => {
      const ctx = await orchestrator.startWorkflow({ message: 'test' });
      orchestrator.pause(ctx);
      orchestrator.resume(ctx);

      expect(ctx.paused).toBe(false);
    });
  });

  describe('getAvailableAgents()', () => {
    it('should return all 7 agents', () => {
      const agents = orchestrator.getAvailableAgents();
      expect(agents).toHaveLength(7);
    });

    it('should include expected agents', () => {
      const agents = orchestrator.getAvailableAgents();
      const names = agents.map((a) => a.name);

      expect(names).toContain('planner');
      expect(names).toContain('architect');
      expect(names).toContain('coder');
      expect(names).toContain('tester');
      expect(names).toContain('debugger');
      expect(names).toContain('reviewer');
    });
  });

  describe('getAgentForStage()', () => {
    it('should return correct agent for each stage', () => {
      expect(orchestrator.getAgentForStage(WorkflowStage.PLANNING)?.name).toBe(
        'planner',
      );
      expect(orchestrator.getAgentForStage(WorkflowStage.CODING)?.name).toBe(
        'coder',
      );
      expect(orchestrator.getAgentForStage(WorkflowStage.DEBUGGING)?.name).toBe(
        'debugger',
      );
    });

    it('should return null for intake/completed', () => {
      expect(orchestrator.getAgentForStage(WorkflowStage.INTAKE)).toBeNull();
      expect(orchestrator.getAgentForStage(WorkflowStage.COMPLETED)).toBeNull();
    });
  });

  describe('global orchestrator', () => {
    it('should return singleton', () => {
      const o1 = getGlobalOrchestrator(mockConfig);
      const o2 = getGlobalOrchestrator(mockConfig);
      expect(o1).toBe(o2);
    });
  });
});
