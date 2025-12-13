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
} from './types.js';

export class CodeBuilder {
  private imports: ImportDef[] = [];
  private types: TypeDef[] = [];
  private functions: FunctionDef[] = [];
  private classes: ClassDef[] = [];
  private constants: ConstDef[] = [];
  private pendingExport = false;

  /**
   * Mark the next item as exported
   */
  export(): this {
    this.pendingExport = true;
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
   * @param name Type name, can include generic: "ApiResponse<T>"
   * @param fields Field definitions using shorthand notation
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
    });
    this.pendingExport = false;
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
    });
    this.pendingExport = false;
    return this;
  }

  /**
   * Define a class
   */
  class(
    name: string,
    config: {
      extends?: string;
      implements?: string[];
      props?: FieldMap;
      methods?: Record<string, MethodDef>;
    },
  ): this {
    this.classes.push({
      name,
      ...config,
      exported: this.pendingExport,
    });
    this.pendingExport = false;
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
    });
    this.pendingExport = false;
    return this;
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

    // Types
    for (const t of this.types) {
      const exportPrefix = t.exported ? 'export ' : '';
      const generic = t.generic ? `<${t.generic}>` : '';
      const fields = Object.entries(t.fields)
        .map(([k, v]) => {
          const optional = v.endsWith('?');
          const type = optional ? v.slice(0, -1) : v;
          return `  ${k}${optional ? '?' : ''}: ${type};`;
        })
        .join('\n');
      lines.push(
        `${exportPrefix}interface ${t.name}${generic} {\n${fields}\n}`,
      );
      lines.push('');
    }

    // Constants
    for (const c of this.constants) {
      const exportPrefix = c.exported ? 'export ' : '';
      const typeAnnotation = c.type ? `: ${c.type}` : '';
      lines.push(
        `${exportPrefix}const ${c.name}${typeAnnotation} = ${c.value};`,
      );
    }

    if (this.constants.length > 0) lines.push('');

    // Functions
    for (const f of this.functions) {
      const exportPrefix = f.exported ? 'export ' : '';
      const asyncPrefix = f.async ? 'async ' : '';
      const params = Object.entries(f.params)
        .map(([k, v]) => {
          const optional = v.endsWith('?');
          const type = optional ? v.slice(0, -1) : v;
          return `${k}${optional ? '?' : ''}: ${type}`;
        })
        .join(', ');
      const returnType = f.returnType ? `: ${f.returnType}` : '';
      lines.push(
        `${exportPrefix}${asyncPrefix}function ${f.name}(${params})${returnType} {\n  ${f.body}\n}`,
      );
      lines.push('');
    }

    // Classes
    for (const c of this.classes) {
      const exportPrefix = c.exported ? 'export ' : '';
      const extendsClause = c.extends ? ` extends ${c.extends}` : '';
      const implementsClause =
        c.implements && c.implements.length > 0
          ? ` implements ${c.implements.join(', ')}`
          : '';

      const classLines: string[] = [];

      // Properties
      if (c.props) {
        for (const [k, v] of Object.entries(c.props)) {
          const optional = v.endsWith('?');
          const type = optional ? v.slice(0, -1) : v;
          classLines.push(`  ${k}${optional ? '?' : ''}: ${type};`);
        }
      }

      // Methods
      if (c.methods) {
        for (const [methodName, m] of Object.entries(c.methods)) {
          const asyncPrefix = m.async ? 'async ' : '';
          const params = m.params
            ? Object.entries(m.params)
                .map(([k, v]) => {
                  const optional = v.endsWith('?');
                  const type = optional ? v.slice(0, -1) : v;
                  return `${k}${optional ? '?' : ''}: ${type}`;
                })
                .join(', ')
            : '';
          const returnType = m.returns ? `: ${m.returns}` : '';
          classLines.push(
            `  ${asyncPrefix}${methodName}(${params})${returnType} {\n    ${m.body}\n  }`,
          );
        }
      }

      lines.push(
        `${exportPrefix}class ${c.name}${extendsClause}${implementsClause} {\n${classLines.join('\n\n')}\n}`,
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
