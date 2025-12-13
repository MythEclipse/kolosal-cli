/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolConfirmationOutcome,
  type ToolResult,
  type ToolCallConfirmationDetails,
  type ToolLocation,
} from './tools.js';
import { ToolNames } from './tool-names.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { project, code } from '../mcp/codegen/dsl/index.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import path from 'path';

export interface GenerateCodeToolParams {
  /**
   * Root directory for the generated code.
   */
  outputDir: string;

  /**
   * Optional package.json configuration
   */
  package?: {
    name: string;
    version?: string;
    description?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  /**
   * Files to generate, keyed by relative path.
   */
  files: Record<string, FileDefinition>;
}

export interface FileDefinition {
  imports?: Array<{ from: string; items: string[] | '*'; typeOnly?: boolean }>;
  types?: Array<{
    name: string;
    generic?: string;
    fields: Record<string, string>;
    exported?: boolean;
    jsdoc?: string;
  }>;
  enums?: Array<{
    name: string;
    values: string[] | Record<string, string | number>;
    exported?: boolean;
    jsdoc?: string;
  }>;
  aliases?: Array<{
    name: string;
    value: string;
    generic?: string;
    exported?: boolean;
    jsdoc?: string;
  }>;
  functions?: Array<{
    name: string;
    params: Record<string, string>;
    returnType?: string;
    body: string;
    async?: boolean;
    exported?: boolean;
    jsdoc?: string;
  }>;
  classes?: Array<{
    name: string;
    extends?: string;
    implements?: string[];
    props?: Record<string, string>;
    staticProps?: Record<string, string>;
    constructor?: { params: Record<string, string>; body: string };
    methods?: Record<
      string,
      {
        params?: Record<string, string>;
        returns?: string;
        body: string;
        async?: boolean;
        static?: boolean;
        jsdoc?: string;
      }
    >;
    exported?: boolean;
    jsdoc?: string;
  }>;
  constants?: Array<{
    name: string;
    value: string;
    type?: string;
    exported?: boolean;
    jsdoc?: string;
  }>;
}

class GenerateCodeToolInvocation extends BaseToolInvocation<
  GenerateCodeToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: GenerateCodeToolParams,
  ) {
    super(params);
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: path.resolve(this.params.outputDir) }];
  }

  override getDescription(): string {
    const relativePath = makeRelative(
      this.params.outputDir,
      this.config.getTargetDir(),
    );
    const fileCount = Object.keys(this.params.files).length;
    return `Generating ${fileCount} files in ${shortenPath(relativePath)}`;
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const relativePath = makeRelative(
      this.params.outputDir,
      this.config.getTargetDir(),
    );
    const fileCount = Object.keys(this.params.files).length;

    return {
      type: 'info',
      title: `Generate Code`,
      prompt: `About to generate ${fileCount} files in ${shortenPath(relativePath)}.\nTarget: ${this.params.outputDir}`,
      onConfirm: async (_outcome: ToolConfirmationOutcome) => {
        // No special action needed on confirm
      },
    };
  }

  async execute(_abortSignal: AbortSignal): Promise<ToolResult> {
    try {
      const proj = project();

      if (this.params.package) {
        proj.package(this.params.package);
      }

      for (const [filePath, def] of Object.entries(this.params.files)) {
        const c = code();

        // Imports
        if (def.imports) {
          for (const imp of def.imports) {
            c.import(imp.from, imp.items, imp.typeOnly);
          }
        }

        // Enums
        if (def.enums) {
          for (const e of def.enums) {
            if (e.jsdoc) c.doc(e.jsdoc);
            if (e.exported) c.export();
            c.enum(e.name, e.values);
          }
        }

        // Type Aliases
        if (def.aliases) {
          for (const a of def.aliases) {
            if (a.jsdoc) c.doc(a.jsdoc);
            if (a.exported) c.export();
            c.alias(a.name, a.value);
          }
        }

        // Types (Interfaces)
        if (def.types) {
          for (const t of def.types) {
            if (t.jsdoc) c.doc(t.jsdoc);
            if (t.exported) c.export();
            // Handle generics in name if passed separately or joined
            let name = t.name;
            if (t.generic && !name.includes('<')) {
              name = `${name}<${t.generic}>`;
            }
            c.type(name, t.fields);
          }
        }

        // Constants
        if (def.constants) {
          for (const cn of def.constants) {
            if (cn.jsdoc) c.doc(cn.jsdoc);
            if (cn.exported) c.export();
            c.const(cn.name, cn.value, cn.type);
          }
        }

        // Functions
        if (def.functions) {
          for (const f of def.functions) {
            if (f.jsdoc) c.doc(f.jsdoc);
            if (f.exported) c.export();
            c.func(f.name, f.params, f.returnType, f.body, f.async);
          }
        }

        // Classes
        if (def.classes) {
          for (const cl of def.classes) {
            if (cl.jsdoc) c.doc(cl.jsdoc);
            if (cl.exported) c.export();
            c.class(cl.name, {
              extends: cl.extends,
              implements: cl.implements,
              props: cl.props,
              staticProps: cl.staticProps,
              constructor: cl.constructor,
              methods: cl.methods,
              jsdoc: cl.jsdoc, // also passing here as config
            });
          }
        }

        proj.file(filePath, c);
      }

      const absoluteOutputDir = path.resolve(this.params.outputDir);
      await proj.generate(absoluteOutputDir);

      const fileCount = Object.keys(this.params.files).length;
      const successMsg = `Successfully generated ${fileCount} files in ${absoluteOutputDir}`;

      return {
        llmContent: successMsg,
        returnDisplay: successMsg,
      };
    } catch (error) {
      const errorMsg = `Error generating code: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: errorMsg,
        returnDisplay: errorMsg,
        error: {
          message: errorMsg,
          type: ToolErrorType.CODE_GENERATION_FAILURE,
        },
      };
    }
  }
}

export class GenerateCodeTool extends BaseDeclarativeTool<
  GenerateCodeToolParams,
  ToolResult
> {
  static readonly Name = ToolNames.GENERATE_CODE;

  constructor(private readonly config: Config) {
    super(
      GenerateCodeTool.Name,
      'GenerateCode',
      'Generates TypeScript projects/files using the Kolosal Code DSL. Efficiently creates types, interfaces, classes, and complete project structures (package.json, tsconfig.json) based on a structured definition.',
      Kind.Edit,
      {
        properties: {
          outputDir: {
            type: 'string',
            description:
              'The root directory where the code should be generated.',
          },
          package: {
            type: 'object',
            description: 'Optional package.json configuration.',
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
              description: { type: 'string' },
              dependencies: { type: 'object' },
            },
            required: ['name'],
          },
          files: {
            type: 'object',
            description: 'Map of relative file paths to file definitions.',
            additionalProperties: {
              type: 'object',
              properties: {
                imports: { type: 'array' },
                types: { type: 'array' },
                enums: { type: 'array' },
                aliases: { type: 'array' },
                functions: { type: 'array' },
                classes: { type: 'array' },
                constants: { type: 'array' },
              },
            },
          },
        },
        required: ['outputDir', 'files'],
        type: 'object',
      },
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected createInvocation(
    params: GenerateCodeToolParams,
  ): BaseToolInvocation<GenerateCodeToolParams, ToolResult> {
    return new GenerateCodeToolInvocation(this.config, params);
  }
}
