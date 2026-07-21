import type { GpuRecord } from '../dsl/types.js';
import { analyzeShader } from './analyze.js';
import { emitGlsl } from './emit-glsl.js';
import { foldConstants, minifyGlsl } from './optimize.js';
import { parseShaderModule } from './parse.js';

export interface CompileOptions {
  optimize?: boolean;
}

export interface CompiledShaderModule {
  attributes: GpuRecord;
  instanceAttributes: GpuRecord;
  uniforms: GpuRecord;
  varyings: GpuRecord;
  vertexSrc: string;
  fragmentSrc: string;
}

export function compileShaderSource(
  fileName: string,
  source: string,
  options: CompileOptions = {},
): CompiledShaderModule {
  const parsed = parseShaderModule(fileName, source);
  let ir = analyzeShader(parsed);
  if (options.optimize === true) {
    ir = foldConstants(ir);
  }
  let { vertexSrc, fragmentSrc } = emitGlsl(ir);
  if (options.optimize === true) {
    vertexSrc = minifyGlsl(vertexSrc);
    fragmentSrc = minifyGlsl(fragmentSrc);
  }
  return {
    attributes: ir.attributes,
    instanceAttributes: ir.instanceAttributes,
    uniforms: ir.uniforms,
    varyings: ir.varyings,
    vertexSrc,
    fragmentSrc,
  };
}
