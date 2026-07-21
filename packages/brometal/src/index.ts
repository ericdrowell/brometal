export { shader, GPU_TYPES } from './dsl/types.js';
export type {
  CompiledShader,
  GpuRecord,
  GpuType,
  GpuValue,
  Mat4,
  ShaderDefinition,
  Values,
  Vec2,
  Vec3,
  Vec4,
} from './dsl/types.js';
export {
  abs,
  clamp,
  cos,
  cross,
  dot,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  normalize,
  pow,
  sin,
  sqrt,
  vec2,
  vec3,
  vec4,
} from './dsl/builtins.js';
export { createRenderer } from './runtime/context.js';
export type { Renderer, RendererOptions } from './runtime/context.js';
export { createProgram } from './runtime/program.js';
export type { AttributeHandle, BroMetalProgram, UniformHandle } from './runtime/program.js';
export type { UniformValue } from './runtime/uniforms.js';
export { mat4 } from './math/mat4.js';
export type { Mat4Array } from './math/mat4.js';
