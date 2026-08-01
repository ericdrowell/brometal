export { shader, GPU_TYPES } from './dsl/types.js';
export type {
  CompiledShader,
  GpuRecord,
  GpuType,
  GpuValue,
  Mat4,
  Sampler2D,
  Sampler3D,
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
  targetUv,
  sign,
  sin,
  smoothstep,
  sqrt,
  step,
  tan,
  storageRead,
  storageLength,
  storageWrite,
  texture,
  vec2,
  vec3,
  vec4,
} from './dsl/builtins.js';
export { createRenderer } from './runtime/context.js';
export type { DrawToOptions, Renderer, RendererBackend, RendererOptions } from './runtime/context.js';
export { createProgram } from './runtime/program.js';
export type {
  AttributeHandle,
  BlendMode,
  BroMetalProgram,
  ProgramOptions,
  UniformHandle,
} from './runtime/program.js';
export type { UniformValue } from './runtime/uniforms.js';
export { mat4 } from './math/mat4.js';
export type { Mat4Array } from './math/mat4.js';
export { createCamera } from './camera/camera.js';
export type { Camera, CameraLens, CameraOptions } from './camera/camera.js';
export { createTexture, createTexture3D, loadTexture } from './runtime/texture.js';
export { createStorageBuffer } from './runtime/storage.js';
export type { BroMetalStorageBuffer } from './runtime/storage.js';
export { createRenderTarget } from './runtime/render-target.js';
export type { RenderTarget, RenderTargetOptions } from './runtime/render-target.js';
export type { BroMetalTexture, TextureOptions, VolumeSource } from './runtime/texture.js';
export { parseGlb, loadGlb } from './models/glb.js';
export type { Model, ModelMesh, ModelImage } from './models/glb.js';
export * from './geometries/index.js';
