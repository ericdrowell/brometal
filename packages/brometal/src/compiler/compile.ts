import type { GpuRecord, ShaderLayout } from '../dsl/types.js';
import { analyzeShader } from './analyze.js';
import { emitGlsl, helperClosure, type GlslPrecision } from './emit-glsl.js';
import { emitWgsl } from './emit-wgsl.js';
import { buildLayout } from './layout.js';
import { foldConstants, minifyGlsl, pruneDeadVaryings } from './optimize.js';
import { parseShaderModule } from './parse.js';

export type CompileTarget = 'webgl2' | 'webgpu';

export interface CompileOptions {
  optimize?: boolean;
  precision?: GlslPrecision;
  /** Backends to emit. Default: both. */
  targets?: CompileTarget[];
}

export interface CompiledShaderModule {
  attributes: GpuRecord;
  instanceAttributes: GpuRecord;
  uniforms: GpuRecord;
  varyings: GpuRecord;
  layout: ShaderLayout;
  vertexSrc: string;
  fragmentSrc: string;
  wgslSrc?: string;
  /** Compile-time diagnostics that do not block compilation. */
  warnings: string[];
}

export function compileShaderSource(
  fileName: string,
  source: string,
  options: CompileOptions = {},
): CompiledShaderModule {
  const parsed = parseShaderModule(fileName, source);
  let ir = analyzeShader(parsed);
  const warnings = collectWarnings(fileName, ir);

  if (options.optimize === true) {
    ir = pruneDeadVaryings(foldConstants(ir));
  }

  const layout = buildLayout(ir);
  const targets = options.targets ?? ['webgl2', 'webgpu'];
  let { vertexSrc, fragmentSrc } = emitGlsl(ir, layout, {
    precision: options.precision ?? 'highp',
  });
  if (options.optimize === true) {
    vertexSrc = minifyGlsl(vertexSrc);
    fragmentSrc = minifyGlsl(fragmentSrc);
  }

  const result: CompiledShaderModule = {
    attributes: ir.attributes,
    instanceAttributes: ir.instanceAttributes,
    uniforms: ir.uniforms,
    varyings: ir.varyings,
    layout,
    vertexSrc,
    fragmentSrc,
    warnings,
  };
  if (!targets.includes('webgl2')) {
    result.vertexSrc = '';
    result.fragmentSrc = '';
  }
  if (targets.includes('webgpu')) {
    result.wgslSrc = emitWgsl(ir, layout);
  }
  return result;
}

function collectWarnings(fileName: string, ir: ReturnType<typeof analyzeShader>): string[] {
  const warnings: string[] = [];
  for (const name of Object.keys(ir.attributes)) {
    if (!ir.vertex.usedAttributes.has(name)) {
      warnings.push(`${fileName} — attribute '${name}' is declared but never used`);
    }
  }
  for (const name of Object.keys(ir.instanceAttributes)) {
    if (!ir.vertex.usedInstanceAttributes.has(name)) {
      warnings.push(`${fileName} — instance attribute '${name}' is declared but never used`);
    }
  }
  for (const name of Object.keys(ir.uniforms)) {
    if (!ir.vertex.usedUniforms.has(name) && !ir.fragment.usedUniforms.has(name)) {
      warnings.push(`${fileName} — uniform '${name}' is declared but never used`);
    }
  }
  for (const name of Object.keys(ir.varyings)) {
    if (!ir.vertex.usedVaryings.has(name) && !ir.fragment.usedVaryings.has(name)) {
      warnings.push(
        `${fileName} — varying '${name}' is never read — it will be removed from prod builds`,
      );
    }
  }
  const usedHelpers = helperClosure(ir, [...ir.vertex.usedHelpers, ...ir.fragment.usedHelpers]);
  for (const helper of ir.helpers) {
    if (!usedHelpers.has(helper.name)) {
      warnings.push(`${fileName} — helper '${helper.name}' is declared but never called`);
    }
  }
  return warnings;
}
