import type { GpuRecord } from '../dsl/types.js';

export type IrType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat4' | 'bool';

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
  | { kind: 'const'; name: string; type: IrType; expr: IrExpr }
  | { kind: 'assign'; target: string; expr: IrExpr }
  | { kind: 'if'; condition: IrExpr; then: IrStmt[]; else?: IrStmt[] }
  | { kind: 'return'; expr: IrExpr };

export interface StageIr {
  statements: IrStmt[];
  usedUniforms: Set<string>;
  usedVaryings: Set<string>;
}

export interface ShaderIr {
  attributes: GpuRecord;
  instanceAttributes: GpuRecord;
  uniforms: GpuRecord;
  varyings: GpuRecord;
  vertex: StageIr;
  fragment: StageIr;
}
