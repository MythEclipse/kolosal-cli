/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import type { McpServerConfig, McpToolConfig } from './types.js';
import { McpToolDefinition } from './McpToolDefinition.js';
import {
  generateIndexTs,
  generatePackageJson,
  generateTsConfig,
} from './templates.js';

export class McpServerGenerator {
  private config: McpServerConfig;
  private tools: McpToolConfig[] = [];

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  addTool(tool: McpToolDefinition | McpToolConfig): this {
    if (tool instanceof McpToolDefinition) {
      this.tools.push(tool.build());
    } else {
      this.tools.push(tool);
    }
    return this;
  }

  async generate(outputDir: string): Promise<void> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate package.json
    fs.writeFileSync(
      path.join(outputDir, 'package.json'),
      generatePackageJson(this.config),
    );

    // Generate tsconfig.json
    fs.writeFileSync(path.join(outputDir, 'tsconfig.json'), generateTsConfig());

    // Generate index.ts
    fs.writeFileSync(
      path.join(outputDir, 'index.ts'),
      generateIndexTs(this.config, this.tools),
    );
  }
}
