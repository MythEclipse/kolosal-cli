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

interface EnvironmentParams {
  action: 'list' | 'set' | 'sync_template' | 'create_template';
  key?: string;
  value?: string;
  envFile?: string; // default .env
  templateFile?: string; // default .env.example
}

export class EnvironmentTool extends BaseDeclarativeTool<EnvironmentParams, ToolResult> {
  static readonly Name = 'environment';

  constructor(private readonly config: Config) {
    super(
      EnvironmentTool.Name,
      'Environment',
      'Manage environment variables and configuration files (.env).',
      Kind.Other,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'set', 'sync_template', 'create_template'],
            description: 'The environment action to perform.'
          },
          key: { type: 'string', description: 'Key for set action' },
          value: { type: 'string', description: 'Value for set action' },
          envFile: { type: 'string', description: 'Path to .env file (default: .env)' },
          templateFile: { type: 'string', description: 'Path to template file (default: .env.example)' }
        },
        required: ['action']
      }
    );
  }

  protected createInvocation(params: EnvironmentParams): BaseToolInvocation<EnvironmentParams, ToolResult> {
    return new EnvironmentInvocation(this.config, params);
  }
}

class EnvironmentInvocation extends BaseToolInvocation<EnvironmentParams, ToolResult> {
  constructor(private readonly config: Config, params: EnvironmentParams) {
    super(params);
  }

  getDescription(): string {
    return `Environment action: ${this.params.action}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const envPath = path.resolve(this.config.getTargetDir(), this.params.envFile || '.env');
      const templatePath = path.resolve(this.config.getTargetDir(), this.params.templateFile || '.env.example');

      switch (this.params.action) {
        case 'list': {
          const content = await this.readFileSafe(envPath);
          if (!content) return { llmContent: 'No .env file found.', returnDisplay: 'No .env file.' };
          
          // Parse and mask
          const lines = content.split('\n');
          const masked = lines.map(line => {
            if (line.trim() === '' || line.startsWith('#')) return line;
            const [key, val] = line.split('=');
            if (key && val) return `${key}=********`;
            return line;
          });

          return {
            llmContent: `Environment keys (values masked):\n${masked.join('\n')}`,
            returnDisplay: 'Environment variables listed.'
          };
        }

        case 'set': {
          if (!this.params.key || this.params.value === undefined) {
            throw new Error('Key and value are required for set action');
          }
          
          let content = await this.readFileSafe(envPath) || '';
          const lines = content.split('\n');
          let found = false;
          const newLines = lines.map(line => {
            if (line.startsWith(`${this.params.key}=`)) {
              found = true;
              return `${this.params.key}=${this.params.value}`;
            }
            return line;
          });
          
          if (!found) {
            if (newLines.length > 0 && newLines[newLines.length - 1] !== '') {
              newLines.push('');
            }
            newLines.push(`${this.params.key}=${this.params.value}`);
          }

          await fs.writeFile(envPath, newLines.join('\n'), 'utf-8');
          return {
            llmContent: `Set ${this.params.key} in ${path.basename(envPath)}`,
            returnDisplay: `Set ${this.params.key}`
          };
        }

        case 'create_template':
        case 'sync_template': {
          const envContent = await this.readFileSafe(envPath);
          if (!envContent) throw new Error('.env file not found to sync from.');

          const envKeys = this.parseKeys(envContent);
          const templateContent = (await this.readFileSafe(templatePath)) || '';
          const templateKeys = this.parseKeys(templateContent);

          const missingInTemplate = envKeys.filter(k => !templateKeys.includes(k));
          
          if (missingInTemplate.length === 0) {
            return { llmContent: 'Template is already in sync.', returnDisplay: 'Synced.' };
          }

          let newTemplate = templateContent;
          if (!newTemplate.endsWith('\n') && newTemplate !== '') newTemplate += '\n';
          
          for (const key of missingInTemplate) {
            newTemplate += `${key}=\n`;
          }

          await fs.writeFile(templatePath, newTemplate, 'utf-8');
          return {
            llmContent: `Added ${missingInTemplate.length} keys to ${path.basename(templatePath)}: ${missingInTemplate.join(', ')}`,
            returnDisplay: `Synced ${path.basename(templatePath)}`
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
        llmContent: `Environment error: ${getErrorMessage(error)}`,
        returnDisplay: `Error: ${getErrorMessage(error)}`,
        error: {
          message: getErrorMessage(error),
          type: ToolErrorType.ENV_ERROR
        }
      };
    }
  }

  private async readFileSafe(p: string): Promise<string | null> {
    try {
      return await fs.readFile(p, 'utf-8');
    } catch {
      return null;
    }
  }

  private parseKeys(content: string): string[] {
    return content
      .split('\n')
      .filter(l => l.trim() !== '' && !l.startsWith('#'))
      .map(l => l.split('=')[0].trim());
  }
}
