import type { IrExpr, IrStmt, IrType, ShaderIr, StageIr } from './ir.js';

const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '>': 4,
  '<=': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
};

const UNARY_PRECEDENCE = 7;
const PRIMARY_PRECEDENCE = 8;

export interface GlslSources {
  vertexSrc: string;
  fragmentSrc: string;
}

export function emitGlsl(ir: ShaderIr): GlslSources {
  return { vertexSrc: emitVertex(ir), fragmentSrc: emitFragment(ir) };
}

function emitVertex(ir: ShaderIr): string {
  const lines: string[] = ['#version 300 es'];
  for (const [name, type] of Object.entries(ir.attributes)) {
    lines.push(`in ${type} ${name};`);
  }
  for (const [name, type] of Object.entries(ir.instanceAttributes)) {
    lines.push(`in ${type} ${name};`);
  }
  for (const [name, type] of Object.entries(ir.uniforms)) {
    if (ir.vertex.usedUniforms.has(name)) {
      lines.push(`uniform ${type} ${name};`);
    }
  }
  for (const [name, type] of Object.entries(ir.varyings)) {
    lines.push(`out ${type} ${name};`);
  }
  lines.push('void main() {');
  emitStatements(lines, ir.vertex.statements, 'gl_Position', 1);
  lines.push('}');
  return lines.join('\n') + '\n';
}

function emitFragment(ir: ShaderIr): string {
  const lines: string[] = ['#version 300 es', 'precision highp float;'];
  for (const [name, type] of Object.entries(ir.uniforms)) {
    if (ir.fragment.usedUniforms.has(name)) {
      lines.push(`uniform ${type} ${name};`);
    }
  }
  for (const [name, type] of Object.entries(ir.varyings)) {
    if (ir.fragment.usedVaryings.has(name)) {
      lines.push(`in ${type} ${name};`);
    }
  }
  lines.push('out vec4 fragColor;');
  lines.push('void main() {');
  emitStatements(lines, ir.fragment.statements, 'fragColor', 1);
  lines.push('}');
  return lines.join('\n') + '\n';
}

function emitStatements(lines: string[], statements: IrStmt[], returnTarget: string, depth: number): void {
  const indent = '  '.repeat(depth);
  for (const statement of statements) {
    switch (statement.kind) {
      case 'const':
        lines.push(`${indent}${glslType(statement.type)} ${statement.name} = ${emitExpr(statement.expr, 0)};`);
        break;
      case 'assign':
        lines.push(`${indent}${statement.target} = ${emitExpr(statement.expr, 0)};`);
        break;
      case 'return':
        lines.push(`${indent}${returnTarget} = ${emitExpr(statement.expr, 0)};`);
        break;
      case 'if': {
        lines.push(`${indent}if (${emitExpr(statement.condition, 0)}) {`);
        emitStatements(lines, statement.then, returnTarget, depth + 1);
        if (statement.else !== undefined) {
          lines.push(`${indent}} else {`);
          emitStatements(lines, statement.else, returnTarget, depth + 1);
        }
        lines.push(`${indent}}`);
        break;
      }
    }
  }
}

function glslType(type: IrType): string {
  return type;
}

export function formatFloat(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e21) {
    return `${value}.0`;
  }
  return String(value);
}

function emitExpr(expr: IrExpr, parentPrecedence: number): string {
  switch (expr.kind) {
    case 'literal':
      return expr.value < 0 ? parenthesize(formatFloat(expr.value), parentPrecedence) : formatFloat(expr.value);
    case 'ident':
      return expr.name;
    case 'swizzle':
      return `${emitExpr(expr.obj, PRIMARY_PRECEDENCE)}.${expr.components}`;
    case 'call':
      return `${expr.callee}(${expr.args.map((arg) => emitExpr(arg, 0)).join(', ')})`;
    case 'unary': {
      const rendered = `${expr.op}${emitExpr(expr.operand, UNARY_PRECEDENCE)}`;
      return parentPrecedence > UNARY_PRECEDENCE ? `(${rendered})` : rendered;
    }
    case 'binary': {
      const precedence = PRECEDENCE[expr.op]!;
      const left = emitExpr(expr.left, precedence);
      const right = emitExpr(expr.right, precedence + 1);
      const rendered = `${left} ${expr.op} ${right}`;
      return parentPrecedence > precedence ? `(${rendered})` : rendered;
    }
  }
}

function parenthesize(rendered: string, parentPrecedence: number): string {
  return parentPrecedence >= UNARY_PRECEDENCE ? `(${rendered})` : rendered;
}
