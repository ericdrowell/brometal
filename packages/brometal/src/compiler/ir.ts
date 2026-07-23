import type { GpuRecord } from '../dsl/types.js';

export type IrType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat4' | 'sampler2D' | 'bool';

export type IrBinaryOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '<'
  | '>'
  | '<='
  | '>='
  | '=='
  | '!='
  | '&&'
  | '||';

export type IrExpr =
  | { kind: 'literal'; value: number; type: 'float' }
  | { kind: 'ident'; name: string; type: IrType }
  | { kind: 'unary'; op: '-' | '!'; operand: IrExpr; type: IrType }
  | { kind: 'binary'; op: IrBinaryOp; left: IrExpr; right: IrExpr; type: IrType }
  | { kind: 'call'; callee: string; args: IrExpr[]; type: IrType }
  | { kind: 'swizzle'; obj: IrExpr; components: string; type: IrType };

export type IrStmt =
  | { kind: 'decl'; name: string; type: IrType; mutable: boolean; expr: IrExpr }
  | { kind: 'assign'; target: string; expr: IrExpr }
  | { kind: 'if'; condition: IrExpr; then: IrStmt[]; else?: IrStmt[] }
  | {
      kind: 'for';
      init: { name: string; expr: IrExpr };
      condition: IrExpr;
      update: IrStmt;
      body: IrStmt[];
    }
  | { kind: 'return'; expr: IrExpr };

export interface HelperParam {
  name: string;
  type: IrType;
}

export interface HelperIr {
  name: string;
  params: HelperParam[];
  returnType: IrType;
  statements: IrStmt[];
  /** Names of earlier-declared helpers this one calls. */
  usedHelpers: string[];
}

export interface StageIr {
  statements: IrStmt[];
  usedAttributes: Set<string>;
  usedInstanceAttributes: Set<string>;
  usedUniforms: Set<string>;
  usedVaryings: Set<string>;
  usedHelpers: Set<string>;
}

export interface ShaderIr {
  attributes: GpuRecord;
  instanceAttributes: GpuRecord;
  uniforms: GpuRecord;
  varyings: GpuRecord;
  helpers: HelperIr[];
  vertex: StageIr;
  fragment: StageIr;
}
