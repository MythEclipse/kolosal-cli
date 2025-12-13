/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { McpServerGenerator } from './McpServerGenerator.js';
import { McpToolDefinition } from './McpToolDefinition.js';
import type { McpServerConfig } from './types.js';

export type ShorthandType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'string?'
  | 'number?'
  | 'boolean?';

export type ShorthandSchema = Record<string, ShorthandType>;

export interface SimpleToolConfig {
  desc?: string;
  args?: ShorthandSchema;
  handler: (args: any) => Promise<any> | any;
}

export interface SimpleServerConfig extends McpServerConfig {
  tools: Record<string, SimpleToolConfig>;
}

export function fromShorthand(shorthand: ShorthandSchema): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, type] of Object.entries(shorthand)) {
    switch (type) {
      case 'string':
        shape[key] = z.string();
        break;
      case 'string?':
        shape[key] = z.string().optional();
        break;
      case 'number':
        shape[key] = z.number();
        break;
      case 'number?':
        shape[key] = z.number().optional();
        break;
      case 'boolean':
        shape[key] = z.boolean();
        break;
      case 'boolean?':
        shape[key] = z.boolean().optional();
        break;
      default:
        shape[key] = z.any();
    }
  }
  return z.object(shape);
}

export function createMcpServer(
  config: SimpleServerConfig,
): McpServerGenerator {
  const generator = new McpServerGenerator({
    name: config.name,
    version: config.version,
    description: config.description,
  });

  for (const [name, toolConfig] of Object.entries(config.tools)) {
    const schema = toolConfig.args
      ? fromShorthand(toolConfig.args)
      : z.object({});
    generator.addTool(
      new McpToolDefinition(name)
        .description(toolConfig.desc || name)
        .schema(schema)
        .handler(toolConfig.handler),
    );
  }

  return generator;
}
