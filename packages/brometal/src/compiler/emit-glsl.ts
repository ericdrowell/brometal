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
  // WebGL2 is GLSL ES 3.00, which has no shader storage buffers at all — SSBOs
  // arrived in ES 3.10 and WebGL2 never exposed them. There is no fallback to
  // emit, so this has to fail loudly rather than produce a shader that links and
  // reads zeros.
  if (ir.vertex === undefined || ir.fragment === undefined) {
    throw new Error('BroMetal: a compute-only shader has no GLSL form — WebGL2 has no compute stage');
  }
  const storageNames = Object.keys(ir.storageElements);
  if (storageNames.length > 0) {
    throw new Error(
      `BroMetal: storage buffers (${storageNames.join(', ')}) are WebGPU-only — WebGL2 has no SSBOs`,
    );
  }
  return { vertexSrc: emitVertex(ir, layout, options), fragmentSrc: emitFragment(ir, options) };
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

/**
 * Whether the code currently being emitted lands in the vertex shader.
 *
 * GLSL ES 3.00 computes `texture()`'s mip level from screen-space derivatives,
 * which do not exist in a vertex shader — the level is undefined there, and
 * drivers are free to return whatever they like. In practice a vertex-stage
 * fetch comes back empty, which surfaces as geometry that simply never moves:
 * no error, no warning, just a flat mesh. Vertex-stage sampling therefore has
 * to name its level explicitly. `emit-wgsl` has the same split for a different
 * reason (uniformity rather than derivatives).
 *
 * Helpers are emitted once per stage, so the same helper correctly keeps
 * mipmapped sampling in the fragment shader and takes level 0 in the vertex one.
 */
let emittingVertex = false;

/**
 * Precision declarations, emitted for *both* stages.
 *
 * GLSL ES 3.00 defaults `sampler2D` to `lowp` unless told otherwise, in either
 * stage. A lowp sampler quantises everything it returns, which is invisible for
 * a colour texture and destroys a texture used as data — a displacement map read
 * through one comes back flattened, so a GPU-driven mesh renders nearly static
 * while the identical WGSL path (f32 throughout, no precision qualifiers) looks
 * correct. three.js declares `precision highp sampler2D` for exactly this reason.
 *
 * The vertex stage previously had no precision block at all; only fragment
 * declared `float`, and neither declared samplers.
 */
function precisionHeader(options: EmitOptions, usesSampler: boolean): string[] {
  const lines = [`precision ${options.precision} float;`, `precision ${options.precision} int;`];
  // Only when the stage actually samples — a shader with no textures has no
  // reason to name a sampler precision.
  if (usesSampler) {
    lines.push(`precision ${options.precision} sampler2D;`);
    lines.push(`precision ${options.precision} sampler3D;`);
  }
  return lines;
}

/** Whether any uniform this stage uses is a sampler. */
function stageUsesSampler(ir: ShaderIr, used: Set<string>): boolean {
  for (const [name, type] of Object.entries(ir.uniforms)) {
    if ((type === 'sampler2D' || type === 'sampler3D') && used.has(name)) return true;
  }
  return false;
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

function emitVertex(ir: ShaderIr, layout: ShaderLayout, options: EmitOptions): string {
  emittingVertex = true;
  const lines: string[] = [
    '#version 300 es',
    ...precisionHeader(options, stageUsesSampler(ir, ir.vertex!.usedUniforms)),
  ];
  for (const entry of layout.attributes) {
    lines.push(`layout(location = ${entry.location}) in ${entry.type} ${entry.name};`);
  }
  for (const [name, type] of Object.entries(ir.uniforms)) {
    if (ir.vertex!.usedUniforms.has(name)) {
      lines.push(`uniform ${type} ${name};`);
    }
  }
  for (const [name, type] of Object.entries(ir.varyings)) {
    lines.push(`out ${type} ${name};`);
  }
  emitHelperFunctions(lines, ir, ir.vertex!.usedHelpers);
  lines.push('void main() {');
  emitStatements(lines, ir.vertex!.statements, 'gl_Position', 1);
  lines.push('}');
  return lines.join('\n') + '\n';
}

function emitFragment(ir: ShaderIr, options: EmitOptions): string {
  emittingVertex = false;
  const lines: string[] = [
    '#version 300 es',
    ...precisionHeader(options, stageUsesSampler(ir, ir.fragment!.usedUniforms)),
  ];
  for (const [name, type] of Object.entries(ir.uniforms)) {
    if (ir.fragment!.usedUniforms.has(name)) {
      lines.push(`uniform ${type} ${name};`);
    }
  }
  for (const [name, type] of Object.entries(ir.varyings)) {
    if (ir.fragment!.usedVaryings.has(name)) {
      lines.push(`in ${type} ${name};`);
    }
  }
  lines.push('out vec4 fragColor;');
  emitHelperFunctions(lines, ir, ir.fragment!.usedHelpers);
  lines.push('void main() {');
  emitStatements(lines, ir.fragment!.statements, 'fragColor', 1);
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
    case 'call': {
      if (expr.callee === 'targetUv') {
        // WebGL2's NDC +y is the target's last row and texture v runs bottom-up,
        // so the two cancel and the mapping is the plain one. See emit-wgsl for
        // the other half of this.
        const clip = emitExpr(expr.args[0]!, 0);
        return `((${clip}).xy / (${clip}).w * 0.5 + 0.5)`;
      }
      const rendered = expr.args.map((arg) => emitExpr(arg, 0));
      if (expr.callee === 'texture' && emittingVertex) {
        // No derivatives in the vertex stage, so the level must be explicit.
        return `textureLod(${rendered.join(', ')}, 0.0)`;
      }
      return `${expr.callee}(${rendered.join(', ')})`;
    }
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
