export { shader, GPU_TYPES } from './dsl/types.js';
export type {
  CompiledShader,
  GpuRecord,
  GpuType,
  GpuValue,
  Mat4,
  Sampler2D,
  ShaderDefinition,
  ShaderLayout,
  Values,
  Vec2,
  Vec3,
  Vec4,
} from './dsl/types.js';
export {
  abs,
  acos,
  asin,
  atan,
  clamp,
  cos,
  cross,
  distance,
  dot,
  exp,
  exp2,
  floor,
  fract,
  length,
  log,
  max,
  min,
  mix,
  mod,
  normalize,
  pow,
  reflect,
  sign,
  sin,
  smoothstep,
  sqrt,
  step,
  tan,
  texture,
  vec2,
  vec3,
  vec4,
} from './dsl/builtins.js';
export { createRenderer } from './runtime/context.js';
export type { Renderer, RendererBackend, RendererOptions } from './runtime/context.js';
export { createProgram } from './runtime/program.js';
export type { AttributeHandle, BroMetalProgram, UniformHandle } from './runtime/program.js';
export type { UniformValue } from './runtime/uniforms.js';
export { mat4 } from './math/mat4.js';
export type { Mat4Array } from './math/mat4.js';
export { createCamera } from './camera/camera.js';
export type { Camera, CameraLens, CameraOptions } from './camera/camera.js';
export { createTexture, loadTexture } from './runtime/texture.js';
export type { BroMetalTexture, TextureOptions } from './runtime/texture.js';
export * from './geometries/index.js';
