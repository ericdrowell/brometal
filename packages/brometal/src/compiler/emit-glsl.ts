import type { ShaderLayout } from '../dsl/types.js';
import type { IrExpr, IrStmt, IrType, ShaderIr } from './ir.js';

export type GlslPrecision = 'highp' | 'mediump';

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

export interface EmitOptions {
  precision: GlslPrecision;
}

export function emitGlsl(ir: ShaderIr, layout: ShaderLayout, options: EmitOptions): GlslSources {
  return { vertexSrc: emitVertex(ir, layout), fragmentSrc: emitFragment(ir, options) };
}

/** Expands a stage's directly-called helpers to include everything they call. */
export function helperClosure(ir: ShaderIr, roots: Iterable<string>): Set<string> {
  const byName = new Map(ir.helpers.map((helper) => [helper.name, helper]));
  const result = new Set<string>();
  const visit = (name: string): void => {
    if (result.has(name)) return;
    result.add(name);
    for (const dependency of byName.get(name)?.usedHelpers ?? []) {
      visit(dependency);
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return result;
}

function emitHelperFunctions(lines: string[], ir: ShaderIr, roots: Set<string>): void {
  const closure = helperClosure(ir, roots);
  for (const helper of ir.helpers) {
    if (!closure.has(helper.name)) continue;
    const params = helper.params.map((param) => `${glslType(param.type)} ${param.name}`).join(', ');
    lines.push(`${glslType(helper.returnType)} ${helper.name}(${params}) {`);
    emitStatements(lines, helper.statements, null, 1);
    lines.push('}');
  }
}

function emitVertex(ir: ShaderIr, layout: ShaderLayout): string {
  const lines: string[] = ['#version 300 es'];
  for (const entry of layout.attributes) {
    lines.push(`layout(location = ${entry.location}) in ${entry.type} ${entry.name};`);
  }
  for (const [name, type] of Object.entries(ir.uniforms)) {
    if (ir.vertex.usedUniforms.has(name)) {
      lines.push(`uniform ${type} ${name};`);
    }
  }
  for (const [name, type] of Object.entries(ir.varyings)) {
    lines.push(`out ${type} ${name};`);
  }
  emitHelperFunctions(lines, ir, ir.vertex.usedHelpers);
  lines.push('void main() {');
  emitStatements(lines, ir.vertex.statements, 'gl_Position', 1);
  lines.push('}');
  return lines.join('\n') + '\n';
}

function emitFragment(ir: ShaderIr, options: EmitOptions): string {
  const lines: string[] = ['#version 300 es', `precision ${options.precision} float;`];
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
  emitHelperFunctions(lines, ir, ir.fragment.usedHelpers);
  lines.push('void main() {');
  emitStatements(lines, ir.fragment.statements, 'fragColor', 1);
  lines.push('}');
  return lines.join('\n') + '\n';
}

/** returnTarget null means emit real `return` statements (helper functions). */
function emitStatements(
  lines: string[],
  statements: IrStmt[],
  returnTarget: string | null,
  depth: number,
): void {
  const indent = '  '.repeat(depth);
  for (const statement of statements) {
    switch (statement.kind) {
      case 'decl':
        lines.push(`${indent}${glslType(statement.type)} ${statement.name} = ${emitExpr(statement.expr, 0)};`);
        break;
      case 'assign':
        lines.push(`${indent}${statement.target} = ${emitExpr(statement.expr, 0)};`);
        break;
      case 'return':
        if (returnTarget === null) {
          lines.push(`${indent}return ${emitExpr(statement.expr, 0)};`);
        } else {
          lines.push(`${indent}${returnTarget} = ${emitExpr(statement.expr, 0)};`);
        }
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
      case 'for': {
        const init = `float ${statement.init.name} = ${emitExpr(statement.init.expr, 0)}`;
        const update = `${statement.update.kind === 'assign' ? `${statement.update.target} = ${emitExpr(statement.update.expr, 0)}` : ''}`;
        lines.push(`${indent}for (${init}; ${emitExpr(statement.condition, 0)}; ${update}) {`);
        emitStatements(lines, statement.body, returnTarget, depth + 1);
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
