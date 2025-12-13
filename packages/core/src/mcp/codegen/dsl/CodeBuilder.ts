/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  TypeDef,
  FunctionDef,
  ClassDef,
  ImportDef,
  ConstDef,
  FieldMap,
  MethodDef,
  EnumDef,
  TypeAliasDef,
  ConstructorDef,
} from './types.js';

interface ClassConfig {
  extends?: string;
  implements?: string[];
  props?: FieldMap;
  staticProps?: FieldMap;
  constructor?: ConstructorDef;
  methods?: Record<string, MethodDef>;
  jsdoc?: string;
}

export class CodeBuilder {
  private imports: ImportDef[] = [];
  private types: TypeDef[] = [];
  private enums: EnumDef[] = [];
  private typeAliases: TypeAliasDef[] = [];
  private functions: FunctionDef[] = [];
  private classes: ClassDef[] = [];
  private constants: ConstDef[] = [];
  private pendingExport = false;
  private pendingJsdoc?: string;

  /**
   * Mark the next item as exported
   */
  export(): this {
    this.pendingExport = true;
    return this;
  }

  /**
   * Add JSDoc comment to the next item
   */
  doc(comment: string): this {
    this.pendingJsdoc = comment;
    return this;
  }

  /**
   * Add an import statement
   */
  import(from: string, items: string[] | '*', typeOnly = false): this {
    this.imports.push({ from, items, typeOnly });
    return this;
  }

  /**
   * Define a TypeScript interface/type
   */
  type(name: string, fields: FieldMap): this {
    let generic: string | undefined;
    const match = name.match(/^(\w+)<(.+)>$/);
    if (match) {
      name = match[1];
      generic = match[2];
    }
    this.types.push({
      name,
      generic,
      fields,
      exported: this.pendingExport,
      jsdoc: this.pendingJsdoc,
    });
    this.pendingExport = false;
    this.pendingJsdoc = undefined;
    return this;
  }

  /**
   * Define a TypeScript enum
   */
  enum(name: string, values: string[] | Record<string, string | number>): this {
    this.enums.push({
      name,
      values,
      exported: this.pendingExport,
      jsdoc: this.pendingJsdoc,
    });
    this.pendingExport = false;
    this.pendingJsdoc = undefined;
    return this;
  }

  /**
   * Define a type alias (e.g., type UserId = string)
   */
  alias(name: string, value: string): this {
    let generic: string | undefined;
    const match = name.match(/^(\w+)<(.+)>$/);
    if (match) {
      name = match[1];
      generic = match[2];
    }
    this.typeAliases.push({
      name,
      value,
      generic,
      exported: this.pendingExport,
      jsdoc: this.pendingJsdoc,
    });
    this.pendingExport = false;
    this.pendingJsdoc = undefined;
    return this;
  }

  /**
   * Define a function
   */
  func(
    name: string,
    params: FieldMap,
    returnType: string | undefined,
    body: string,
    async = false,
  ): this {
    this.functions.push({
      name,
      params,
      returnType,
      body,
      async,
      exported: this.pendingExport,
      jsdoc: this.pendingJsdoc,
    });
    this.pendingExport = false;
    this.pendingJsdoc = undefined;
    return this;
  }

  /**
   * Define a class
   */
  class(name: string, config: ClassConfig): this {
    this.classes.push({
      name,
      ...config,
      exported: this.pendingExport,
      jsdoc: config.jsdoc || this.pendingJsdoc,
    });
    this.pendingExport = false;
    this.pendingJsdoc = undefined;
    return this;
  }

  /**
   * Define a constant
   */
  const(name: string, value: string, type?: string): this {
    this.constants.push({
      name,
      value,
      type,
      exported: this.pendingExport,
      jsdoc: this.pendingJsdoc,
    });
    this.pendingExport = false;
    this.pendingJsdoc = undefined;
    return this;
  }

  private formatJsdoc(jsdoc?: string): string {
    if (!jsdoc) return '';
    return `/**\n * ${jsdoc.split('\n').join('\n * ')}\n */\n`;
  }

  private formatParams(params: FieldMap): string {
    return Object.entries(params)
      .map(([k, v]) => {
        const optional = v.endsWith('?');
        const type = optional ? v.slice(0, -1) : v;
        return `${k}${optional ? '?' : ''}: ${type}`;
      })
      .join(', ');
  }

  private formatFields(fields: FieldMap, indent = '  '): string {
    return Object.entries(fields)
      .map(([k, v]) => {
        const optional = v.endsWith('?');
        const type = optional ? v.slice(0, -1) : v;
        return `${indent}${k}${optional ? '?' : ''}: ${type};`;
      })
      .join('\n');
  }

  /**
   * Build the final code string
   */
  build(): string {
    const lines: string[] = [];

    // Imports
    for (const imp of this.imports) {
      const typePrefix = imp.typeOnly ? 'type ' : '';
      if (imp.items === '*') {
        lines.push(`import ${typePrefix}* from '${imp.from}';`);
      } else {
        lines.push(
          `import ${typePrefix}{ ${imp.items.join(', ')} } from '${imp.from}';`,
        );
      }
    }

    if (this.imports.length > 0) lines.push('');

    // Enums
    for (const e of this.enums) {
      const exportPrefix = e.exported ? 'export ' : '';
      let enumBody: string;
      if (Array.isArray(e.values)) {
        enumBody = e.values.map((v) => `  ${v}`).join(',\n');
      } else {
        enumBody = Object.entries(e.values)
          .map(([k, v]) => `  ${k} = ${typeof v === 'string' ? `'${v}'` : v}`)
          .join(',\n');
      }
      lines.push(
        `${this.formatJsdoc(e.jsdoc)}${exportPrefix}enum ${e.name} {\n${enumBody}\n}`,
      );
      lines.push('');
    }

    // Type Aliases
    for (const t of this.typeAliases) {
      const exportPrefix = t.exported ? 'export ' : '';
      const generic = t.generic ? `<${t.generic}>` : '';
      lines.push(
        `${this.formatJsdoc(t.jsdoc)}${exportPrefix}type ${t.name}${generic} = ${t.value};`,
      );
      lines.push('');
    }

    // Types (Interfaces)
    for (const t of this.types) {
      const exportPrefix = t.exported ? 'export ' : '';
      const generic = t.generic ? `<${t.generic}>` : '';
      const fields = this.formatFields(t.fields);
      lines.push(
        `${this.formatJsdoc(t.jsdoc)}${exportPrefix}interface ${t.name}${generic} {\n${fields}\n}`,
      );
      lines.push('');
    }

    // Constants
    for (const c of this.constants) {
      const exportPrefix = c.exported ? 'export ' : '';
      const typeAnnotation = c.type ? `: ${c.type}` : '';
      lines.push(
        `${this.formatJsdoc(c.jsdoc)}${exportPrefix}const ${c.name}${typeAnnotation} = ${c.value};`,
      );
    }

    if (this.constants.length > 0) lines.push('');

    // Functions
    for (const f of this.functions) {
      const exportPrefix = f.exported ? 'export ' : '';
      const asyncPrefix = f.async ? 'async ' : '';
      const params = this.formatParams(f.params);
      const returnType = f.returnType ? `: ${f.returnType}` : '';
      lines.push(
        `${this.formatJsdoc(f.jsdoc)}${exportPrefix}${asyncPrefix}function ${f.name}(${params})${returnType} {\n  ${f.body}\n}`,
      );
      lines.push('');
    }

    // Classes
    for (const c of this.classes) {
      const exportPrefix = c.exported ? 'export ' : '';
      const extendsClause = c.extends ? ` extends ${c.extends}` : '';
      const implementsClause = c.implements?.length
        ? ` implements ${c.implements.join(', ')}`
        : '';

      const classLines: string[] = [];

      // Static Properties
      if (c.staticProps) {
        for (const [k, v] of Object.entries(c.staticProps)) {
          const optional = v.endsWith('?');
          const type = optional ? v.slice(0, -1) : v;
          classLines.push(`  static ${k}${optional ? '?' : ''}: ${type};`);
        }
      }

      // Instance Properties
      if (c.props) {
        for (const [k, v] of Object.entries(c.props)) {
          const optional = v.endsWith('?');
          const type = optional ? v.slice(0, -1) : v;
          classLines.push(`  ${k}${optional ? '?' : ''}: ${type};`);
        }
      }

      // Constructor
      if (c.constructor) {
        const params = this.formatParams(c.constructor.params);
        classLines.push(
          `\n  constructor(${params}) {\n    ${c.constructor.body}\n  }`,
        );
      }

      // Methods
      if (c.methods) {
        for (const [methodName, m] of Object.entries(c.methods)) {
          const staticPrefix = m.static ? 'static ' : '';
          const asyncPrefix = m.async ? 'async ' : '';
          const params = m.params ? this.formatParams(m.params) : '';
          const returnType = m.returns ? `: ${m.returns}` : '';
          const jsdoc = m.jsdoc
            ? `\n  ${this.formatJsdoc(m.jsdoc).trim().replace(/\n/g, '\n  ')}`
            : '';
          classLines.push(
            `${jsdoc}\n  ${staticPrefix}${asyncPrefix}${methodName}(${params})${returnType} {\n    ${m.body}\n  }`,
          );
        }
      }

      lines.push(
        `${this.formatJsdoc(c.jsdoc)}${exportPrefix}class ${c.name}${extendsClause}${implementsClause} {${classLines.join('\n')}\n}`,
      );
      lines.push('');
    }

    return lines.join('\n').trim() + '\n';
  }
}

/**
 * Factory function to create a new CodeBuilder
 */
export function code(): CodeBuilder {
  return new CodeBuilder();
}
