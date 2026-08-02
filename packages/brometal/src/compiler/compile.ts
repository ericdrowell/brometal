import type { GpuRecord, ShaderLayout } from '../dsl/types.js';
import { analyzeShader } from './analyze.js';
import { emitWgsl } from './emit-wgsl.js';
import { helperClosure } from './ir.js';
import { buildLayout } from './layout.js';
import { foldConstants, pruneDeadVaryings } from './optimize.js';
import { parseShaderModule } from './parse.js';

export interface CompileOptions {
  optimize?: boolean;
}

export interface CompiledShaderModule {
  attributes: GpuRecord;
  instanceAttributes: GpuRecord;
  uniforms: GpuRecord;
  varyings: GpuRecord;
  layout: ShaderLayout;
  /** The WGSL module, carrying every entry point the shader declares. */
  wgslSrc: string;
  /** Buffers the compute stage writes — these bind as read_write. */
  storageWritten?: string[];
  /** True when the module has a cs_main entry point. */
  hasCompute?: boolean;
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
  const result: CompiledShaderModule = {
    attributes: ir.attributes,
    instanceAttributes: ir.instanceAttributes,
    uniforms: ir.uniforms,
    varyings: ir.varyings,
    layout,
    wgslSrc: emitWgsl(ir, layout),
    warnings,
  };
  if (ir.storageWritten.length > 0) {
    result.storageWritten = ir.storageWritten;
  }
  if (ir.compute !== undefined) {
    result.hasCompute = true;
  }
  return result;
}

function collectWarnings(fileName: string, ir: ReturnType<typeof analyzeShader>): string[] {
  const warnings: string[] = [];
  // Compute-only shaders have no attributes or varyings to be unused.
  if (ir.vertex === undefined || ir.fragment === undefined) {
    return warnings;
  }
  const vertex = ir.vertex;
  const fragment = ir.fragment;
  for (const name of Object.keys(ir.attributes)) {
    if (!vertex.usedAttributes.has(name)) {
      warnings.push(`${fileName} — attribute '${name}' is declared but never used`);
    }
  }
  for (const name of Object.keys(ir.instanceAttributes)) {
    if (!vertex.usedInstanceAttributes.has(name)) {
      warnings.push(`${fileName} — instance attribute '${name}' is declared but never used`);
    }
  }
  for (const name of Object.keys(ir.uniforms)) {
    if (!vertex.usedUniforms.has(name) && !fragment.usedUniforms.has(name)) {
      warnings.push(`${fileName} — uniform '${name}' is declared but never used`);
    }
  }
  for (const name of Object.keys(ir.varyings)) {
    if (!vertex.usedVaryings.has(name) && !fragment.usedVaryings.has(name)) {
      warnings.push(
        `${fileName} — varying '${name}' is never read — it will be removed from prod builds`,
      );
    }
  }
  const usedHelpers = helperClosure(ir, [...vertex.usedHelpers, ...fragment.usedHelpers]);
  for (const helper of ir.helpers) {
    if (!usedHelpers.has(helper.name)) {
      warnings.push(`${fileName} — helper '${helper.name}' is declared but never called`);
    }
  }
  return warnings;
}
