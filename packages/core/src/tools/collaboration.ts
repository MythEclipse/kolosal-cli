/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolResult } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { getErrorMessage } from '../utils/errors.js';

interface CollaborationParams {
  action: 'export_session' | 'import_session' | 'create_handoff';
  filePath?: string;
  notes?: string;
}

export class CollaborationTool extends BaseDeclarativeTool<CollaborationParams, ToolResult> {
  static readonly Name = 'collaboration';

  constructor(private readonly config: Config) {
    super(
      CollaborationTool.Name,
      'Collaboration',
      'Tools for asynchronous collaboration: export/import sessions and create handoff notes.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['export_session', 'import_session', 'create_handoff'],
            description: 'The collaboration action to perform.'
          },
          filePath: { type: 'string', description: 'File path for export/import.' },
          notes: { type: 'string', description: 'Notes for handoff.' }
        },
        required: ['action']
      }
    );
  }

  protected createInvocation(params: CollaborationParams): BaseToolInvocation<CollaborationParams, ToolResult> {
    return new CollaborationInvocation(this.config, params);
  }
}

class CollaborationInvocation extends BaseToolInvocation<CollaborationParams, ToolResult> {
  constructor(private readonly config: Config, params: CollaborationParams) {
    super(params);
  }

  getDescription(): string {
    return `Collaboration action: ${this.params.action}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const targetDir = this.config.getTargetDir();

      switch (this.params.action) {
        case 'export_session': {
          // In a real implementation, this would grab the full chat history and context state
          // For this tool stub, we'll simulate exporting the "current state" (which is mostly empty here)
          const sessionData = {
            sessionId: this.config.getSessionId(),
            timestamp: new Date().toISOString(),
            // history: this.config.getHistory() // Needs method in config/client
            note: 'Session export placeholder'
          };
          
          const outFile = this.params.filePath || `session-${Date.now()}.json`;
          const outPath = path.resolve(targetDir, outFile);
          
          await fs.writeFile(outPath, JSON.stringify(sessionData, null, 2), 'utf-8');

          return {
            llmContent: `Session exported to ${outPath}`,
            returnDisplay: 'Session exported.'
          };
        }

        case 'import_session': {
          if (!this.params.filePath) throw new Error('filePath required for import');
          const inPath = path.resolve(targetDir, this.params.filePath);
          
          const content = await fs.readFile(inPath, 'utf-8');
          const data = JSON.parse(content);

          return {
            llmContent: `Session imported (simulated). ID: ${data.sessionId}, Time: ${data.timestamp}`,
            returnDisplay: 'Session imported.'
          };
        }

        case 'create_handoff': {
           const handoffFile = path.resolve(targetDir, 'HANDOFF.md');
           const content = `# Developer Handoff\n\nDate: ${new Date().toLocaleString()}\n\n## Notes\n${this.params.notes || 'No notes provided.'}\n\n## Current Status\n- Session ID: ${this.config.getSessionId()}\n`;
           
           await fs.writeFile(handoffFile, content, 'utf-8');
           
           return {
            llmContent: `Handoff notes created at ${handoffFile}`,
            returnDisplay: 'Handoff created.'
           };
        }

        default:
          return {
            llmContent: `Unknown action: ${this.params.action}`,
            returnDisplay: 'Error: Invalid action'
          };
      }
    } catch (error) {
      return {
        llmContent: `Collaboration error: ${getErrorMessage(error)}`,
        returnDisplay: `Error: ${getErrorMessage(error)}`,
        error: {
          message: getErrorMessage(error),
          type: ToolErrorType.COLLAB_ERROR
        }
      };
    }
  }
}
