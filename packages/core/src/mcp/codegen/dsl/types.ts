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
  jsdoc?: string;
}

export interface EnumDef {
  name: string;
  values: string[] | Record<string, string | number>;
  exported?: boolean;
  jsdoc?: string;
}

export interface TypeAliasDef {
  name: string;
  value: string;
  generic?: string;
  exported?: boolean;
  jsdoc?: string;
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
  jsdoc?: string;
}

export interface MethodDef {
  params?: FieldMap;
  returns?: TypeNotation;
  body: string;
  async?: boolean;
  static?: boolean;
  jsdoc?: string;
}

export interface ConstructorDef {
  params: FieldMap;
  body: string;
}

export interface ClassDef {
  name: string;
  extends?: string;
  implements?: string[];
  props?: FieldMap;
  staticProps?: FieldMap;
  constructor?: ConstructorDef;
  methods?: Record<string, MethodDef>;
  exported?: boolean;
  jsdoc?: string;
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
  jsdoc?: string;
}

export interface FileDef {
  path: string;
  imports: ImportDef[];
  types: TypeDef[];
  functions: FunctionDef[];
  classes: ClassDef[];
  constants: ConstDef[];
}

