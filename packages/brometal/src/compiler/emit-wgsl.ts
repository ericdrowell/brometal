import type { ShaderLayout } from '../dsl/types.js';
import { formatFloat } from './emit-glsl.js';
import type { HelperIr, IrExpr, IrStmt, IrType, ShaderIr } from './ir.js';
import { helperClosure } from './emit-glsl.js';

/**
 * WGSL backend. Emits one module containing both entry points (vs_main /
 * fs_main). Compiler-generated identifiers use the reserved bm_ prefix.
 * The vertex stage remaps clip-space z from GL's [-w, w] to WebGPU's [0, w]
 * so CPU-side matrices (mat4.perspective, createCamera) stay backend-agnostic.
 */

const WGSL_TYPES: Record<IrType, string> = {
  float: 'f32',
  vec2: 'vec2f',
  vec3: 'vec3f',
  vec4: 'vec4f',
  mat4: 'mat4x4f',
  sampler2D: '(sampler2D has no WGSL value type)',
  bool: 'bool',
};

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

const VEC_CONSTRUCTORS: Record<string, string> = { vec2: 'vec2f', vec3: 'vec3f', vec4: 'vec4f' };

interface EmitContext {
  stage: 'vertex' | 'fragment' | 'helper';
  attributes: Set<string>;
  uniforms: Set<string>;
  varyings: Set<string>;
}

export function emitWgsl(ir: ShaderIr, layout: ShaderLayout): string {
  const lines: string[] = [];

  const blockMembers = layout.uniforms.filter((entry) => entry.type !== 'sampler2D');
  if (blockMembers.length > 0) {
    lines.push('struct BmUniforms {');
    for (const entry of blockMembers) {
      lines.push(`  ${entry.name} : ${WGSL_TYPES[entry.type as IrType]},`);
    }
    lines.push('}');
    lines.push('@group(0) @binding(0) var<uniform> bm_u : BmUniforms;');
  }
  for (const entry of layout.uniforms) {
    if (entry.type === 'sampler2D') {
      lines.push(`@group(0) @binding(${entry.textureBinding}) var ${entry.name} : texture_2d<f32>;`);
      lines.push(`@group(0) @binding(${entry.samplerBinding}) var ${entry.name}_sampler : sampler;`);
    }
  }

  lines.push('struct BmVSIn {');
  for (const entry of layout.attributes) {
    lines.push(`  @location(${entry.location}) ${entry.name} : ${WGSL_TYPES[entry.type as IrType]},`);
  }
  lines.push('}');

  lines.push('struct BmVSOut {');
  lines.push('  @builtin(position) bm_position : vec4f,');
  Object.entries(ir.varyings).forEach(([name, type], index) => {
    lines.push(`  @location(${index}) ${name} : ${WGSL_TYPES[type as IrType]},`);
  });
  lines.push('}');

  const names = {
    attributes: new Set([...Object.keys(ir.attributes), ...Object.keys(ir.instanceAttributes)]),
    uniforms: new Set(
      Object.keys(ir.uniforms).filter((name) => ir.uniforms[name] !== 'sampler2D'),
    ),
    varyings: new Set(Object.keys(ir.varyings)),
  };

  emitHelpers(lines, ir, new Set([...ir.vertex.usedHelpers, ...ir.fragment.usedHelpers]), names);

  const vertexCtx: EmitContext = { stage: 'vertex', ...names };
  lines.push('@vertex');
  lines.push('fn vs_main(bm_in : BmVSIn) -> BmVSOut {');
  lines.push('  var bm_out : BmVSOut;');
  emitStatements(lines, ir.vertex.statements, vertexCtx, 1);
  lines.push('  bm_out.bm_position.z = (bm_out.bm_position.z + bm_out.bm_position.w) * 0.5;');
  lines.push('  return bm_out;');
  lines.push('}');

  const fragmentCtx: EmitContext = { stage: 'fragment', ...names };
  lines.push('@fragment');
  lines.push('fn fs_main(bm_in : BmVSOut) -> @location(0) vec4f {');
  emitStatements(lines, ir.fragment.statements, fragmentCtx, 1);
  lines.push('}');

  return lines.join('\n') + '\n';
}

function emitHelpers(
  lines: string[],
  ir: ShaderIr,
  roots: Set<string>,
  names: Omit<EmitContext, 'stage'>,
): void {
  const closure = helperClosure(ir, roots);
  const ctx: EmitContext = { stage: 'helper', ...names };
  for (const helper of ir.helpers) {
    if (!closure.has(helper.name)) continue;
    emitHelper(lines, helper, ctx);
  }
}

function emitHelper(lines: string[], helper: HelperIr, ctx: EmitContext): void {
  const params = helper.params.map((param) => `${param.name} : ${WGSL_TYPES[param.type]}`).join(', ');
  lines.push(`fn ${helper.name}(${params}) -> ${WGSL_TYPES[helper.returnType]} {`);
  emitStatements(lines, helper.statements, ctx, 1);
  lines.push('}');
}

function emitStatements(lines: string[], statements: IrStmt[], ctx: EmitContext, depth: number): void {
  const indent = '  '.repeat(depth);
  for (const statement of statements) {
    switch (statement.kind) {
      case 'decl': {
        const keyword = statement.mutable ? 'var' : 'let';
        lines.push(`${indent}${keyword} ${statement.name} = ${emitExpr(statement.expr, ctx, 0)};`);
        break;
      }
      case 'assign': {
        const target = ctx.varyings.has(statement.target)
          ? `bm_out.${statement.target}`
          : statement.target;
        lines.push(`${indent}${target} = ${emitExpr(statement.expr, ctx, 0)};`);
        break;
      }
      case 'return':
        if (ctx.stage === 'vertex') {
          lines.push(`${indent}bm_out.bm_position = ${emitExpr(statement.expr, ctx, 0)};`);
        } else {
          lines.push(`${indent}return ${emitExpr(statement.expr, ctx, 0)};`);
        }
        break;
      case 'if': {
        lines.push(`${indent}if (${emitExpr(statement.condition, ctx, 0)}) {`);
        emitStatements(lines, statement.then, ctx, depth + 1);
        if (statement.else !== undefined) {
          lines.push(`${indent}} else {`);
          emitStatements(lines, statement.else, ctx, depth + 1);
        }
        lines.push(`${indent}}`);
        break;
      }
      case 'for': {
        const init = `var ${statement.init.name} = ${emitExpr(statement.init.expr, ctx, 0)}`;
        const update =
          statement.update.kind === 'assign'
            ? `${statement.update.target} = ${emitExpr(statement.update.expr, ctx, 0)}`
            : '';
        lines.push(`${indent}for (${init}; ${emitExpr(statement.condition, ctx, 0)}; ${update}) {`);
        emitStatements(lines, statement.body, ctx, depth + 1);
        lines.push(`${indent}}`);
        break;
      }
    }
  }
}

function emitIdent(name: string, ctx: EmitContext): string {
  if (ctx.stage === 'helper') {
    return name;
  }
  if (ctx.attributes.has(name)) {
    return `bm_in.${name}`;
  }
  if (ctx.uniforms.has(name)) {
    return `bm_u.${name}`;
  }
  if (ctx.varyings.has(name)) {
    // Vertex reads its own writes from bm_out; fragment reads inputs.
    return ctx.stage === 'vertex' ? `bm_out.${name}` : `bm_in.${name}`;
  }
  return name;
}

function emitExpr(expr: IrExpr, ctx: EmitContext, parentPrecedence: number): string {
  switch (expr.kind) {
    case 'literal': {
      const rendered = formatFloat(expr.value);
      return expr.value < 0 && parentPrecedence >= UNARY_PRECEDENCE ? `(${rendered})` : rendered;
    }
    case 'ident':
      return emitIdent(expr.name, ctx);
    case 'swizzle':
      return `${emitExpr(expr.obj, ctx, PRIMARY_PRECEDENCE)}.${expr.components}`;
    case 'call':
      return emitCall(expr, ctx);
    case 'unary': {
      const rendered = `${expr.op}${emitExpr(expr.operand, ctx, UNARY_PRECEDENCE)}`;
      return parentPrecedence > UNARY_PRECEDENCE ? `(${rendered})` : rendered;
    }
    case 'binary': {
      const precedence = PRECEDENCE[expr.op]!;
      const left = emitExpr(expr.left, ctx, precedence);
      const right = emitExpr(expr.right, ctx, precedence + 1);
      const rendered = `${left} ${expr.op} ${right}`;
      return parentPrecedence > precedence ? `(${rendered})` : rendered;
    }
  }
}

function emitCall(expr: IrExpr & { kind: 'call' }, ctx: EmitContext): string {
  const args = expr.args;

  if (expr.callee === 'texture') {
    const sampler = args[0]!;
    if (sampler.kind !== 'ident') {
      return '/* unreachable: sampler args are always uniform idents */';
    }
    const uv = emitExpr(args[1]!, ctx, 0);
    // textureSample needs uniform control flow / implicit derivatives —
    // vertex stages must sample an explicit level instead.
    return ctx.stage === 'fragment'
      ? `textureSample(${sampler.name}, ${sampler.name}_sampler, ${uv})`
      : `textureSampleLevel(${sampler.name}, ${sampler.name}_sampler, ${uv}, 0.0)`;
  }

  if (expr.callee === 'clamp' && args[0]!.type !== 'float') {
    // GLSL allows clamp(vec, float, float); WGSL requires matching types —
    // splat the scalar bounds into vectors.
    const ctor = WGSL_TYPES[args[0]!.type];
    const x = emitExpr(args[0]!, ctx, 0);
    const lo = emitExpr(args[1]!, ctx, 0);
    const hi = emitExpr(args[2]!, ctx, 0);
    return `clamp(${x}, ${ctor}(${lo}), ${ctor}(${hi}))`;
  }

  if (expr.callee === 'mod') {
    // GLSL mod() is floor-based; WGSL % is trunc-based, so spell it out.
    // Operands must be parenthesized — they can be arbitrary expressions
    // (e.g. `x + y`) landing next to `*` and `/`.
    const a = emitExpr(args[0]!, ctx, 0);
    const b = emitExpr(args[1]!, ctx, 0);
    return `((${a}) - (${b}) * floor((${a}) / (${b})))`;
  }

  const rendered = args.map((arg) => emitExpr(arg, ctx, 0)).join(', ');
  if (expr.callee === 'atan' && args.length === 2) {
    return `atan2(${rendered})`;
  }
  const constructor = VEC_CONSTRUCTORS[expr.callee];
  if (constructor !== undefined) {
    return `${constructor}(${rendered})`;
  }
  return `${expr.callee}(${rendered})`;
}
