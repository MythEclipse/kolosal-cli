/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Shorthand type notation: "string", "number?", "User[]", "Map<string, User>"
export type TypeNotation = string;

export type FieldMap = Record<string, TypeNotation>;

export interface TypeDef {
  name: string;
  generic?: string; // e.g., "T" or "T, K"
  fields: FieldMap;
  exported?: boolean;
}

export interface ParamDef {
  name: string;
  type: TypeNotation;
  optional?: boolean;
}

export interface FunctionDef {
  name: string;
  params: FieldMap;
  returnType?: TypeNotation;
  body: string;
  async?: boolean;
  exported?: boolean;
}

export interface MethodDef {
  params?: FieldMap;
  returns?: TypeNotation;
  body: string;
  async?: boolean;
}

export interface ClassDef {
  name: string;
  extends?: string;
  implements?: string[];
  props?: FieldMap;
  methods?: Record<string, MethodDef>;
  exported?: boolean;
}

export interface ImportDef {
  from: string;
  items: string[] | '*';
  typeOnly?: boolean;
}

export interface ConstDef {
  name: string;
  type?: TypeNotation;
  value: string;
  exported?: boolean;
}

export interface FileDef {
  path: string;
  imports: ImportDef[];
  types: TypeDef[];
  functions: FunctionDef[];
  classes: ClassDef[];
  constants: ConstDef[];
}
