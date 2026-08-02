import type { CompiledShader, GpuRecord, GpuType } from '../dsl/types.js';
import type { Renderer } from './context.js';
import type { UniformValue } from './uniforms.js';
import { createWebgpuProgram } from './webgpu.js';

export type BlendMode = 'none' | 'alpha' | 'additive';

export interface ProgramOptions {
  /**
   * 'alpha' = classic transparency, 'additive' = light accumulation (glows,
   * particles). Blended programs test depth but do not write it.
   */
  blend?: BlendMode;
}

export interface AttributeHandle {
  set(data: Float32Array): void;
}

export interface UniformHandle<T extends GpuType> {
  set(value: UniformValue<T>): void;
}

export interface BroMetalProgram<
  A extends GpuRecord = GpuRecord,
  I extends GpuRecord = GpuRecord,
  U extends GpuRecord = GpuRecord,
> {
  readonly attributes: { [K in keyof A]: AttributeHandle };
  readonly instanceAttributes: { [K in keyof I]: AttributeHandle };
  readonly uniforms: { [K in keyof U]: UniformHandle<U[K]> };
  setIndices(data: Uint16Array | Uint32Array): void;
  draw(): void;
  /** Run the compute stage. Only for shaders declaring compute(); counts are workgroups. */
  dispatch(x: number, y?: number, z?: number): void;
  dispose(): void;
}

/**
 * Links a compiled shader against the renderer.
 *
 * A thin entry point: WebGPU is the only backend, so everything real lives in
 * `webgpu.ts`. This stays a separate module because the program types above are
 * public API and `webgpu.ts` imports them — merging the two would make that
 * circular.
 */
export function createProgram<A extends GpuRecord, I extends GpuRecord, U extends GpuRecord>(
  renderer: Renderer,
  compiled: CompiledShader<A, I, U>,
  options: ProgramOptions = {},
): BroMetalProgram<A, I, U> {
  return createWebgpuProgram(renderer, compiled, options.blend ?? 'none');
}
