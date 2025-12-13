/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { McpServerConfig, McpToolConfig } from './types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export function generatePackageJson(config: McpServerConfig): string {
  return JSON.stringify(
    {
      name: config.name,
      version: config.version,
      description: config.description || 'A generated MCP server',
      type: 'module',
      main: 'build/index.js',
      scripts: {
        build: 'tsc',
        start: 'node build/index.js',
        dev: 'tsx index.ts',
      },
      dependencies: {
        '@modelcontextprotocol/sdk': '^1.0.1',
        zod: '^3.22.4',
      },
      devDependencies: {
        tsx: '^4.7.1',
        typescript: '^5.3.3',
        '@types/node': '^20.11.24',
      },
    },
    null,
    2,
  );
}

export function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        outDir: './build',
        rootDir: '.',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ['index.ts'],
    },
    null,
    2,
  );
}

export function generateIndexTs(
  config: McpServerConfig,
  tools: McpToolConfig[],
): string {
  const toolDefinitions = tools
    .map((tool) => {
      const jsonSchema =
        zodToJsonSchema(tool.schema, 'schema').definitions?.schema || {};
      // We need to embed the handler logic.
      // Since the handler is a function in memory, we can't easily serialize it to source code unless we require it to be passed as string or we just reference a placeholder.
      // For a code generator intended to be used by an AI to write code, the AI *writes* the generator code.
      // However, if the `handler` is a JS function, we can try `Function.prototype.toString()`, but that misses closure context.
      //
      // Wait, the requirement is "agar ai tidak perlu menulis semua kode".
      // If we use this generator at *runtime* to generate files, the handler logic needs to be supplied.
      // If the handler is passed as a function, we must stringify it.

      return `
    server.tool(
  "${tool.name}",
  "${tool.description}",
  ${JSON.stringify(jsonSchema, null, 2)},
  async (args) => {
    // Generated handler wrapper
    const handler = ${tool.handler.toString()};
    return await handler(args);
  }
);
`;
    })
    .join('\n');

  return `
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create an MCP server instance
const server = new McpServer({
  name: "${config.name}",
  version: "${config.version}"
});

${toolDefinitions}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server ${config.name} running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
`;
}
