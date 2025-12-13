/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export interface McpToolConfig {
  name: string;
  description: string;
  schema: z.ZodType<any>;
  handler: (args: any) => Promise<any> | any;
}

export interface McpServerConfig {
  name: string;
  version: string;
  description?: string;
}

export interface GeneratorOptions {
  outputDir: string;
  force?: boolean;
}
