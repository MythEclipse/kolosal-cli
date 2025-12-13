/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { McpToolConfig } from './types.js';
import type { ShorthandSchema } from './simplified.js';
import { fromShorthand } from './simplified.js';

export class McpToolDefinition {
  private config: Partial<McpToolConfig> = {};

  constructor(name: string) {
    this.config.name = name;
  }

  description(desc: string): this {
    this.config.description = desc;
    return this;
  }

  schema(schema: z.ZodType<any>): this {
    this.config.schema = schema;
    return this;
  }

  args(args: ShorthandSchema): this {
    this.config.schema = fromShorthand(args);
    return this;
  }

  handler(handler: (args: any) => Promise<any> | any): this {
    this.config.handler = handler;
    return this;
  }

  build(): McpToolConfig {
    if (
      !this.config.name ||
      !this.config.description ||
      !this.config.schema ||
      !this.config.handler
    ) {
      throw new Error(
        `Tool definition for '${this.config.name}' is incomplete.`,
      );
    }
    return this.config as McpToolConfig;
  }
}
