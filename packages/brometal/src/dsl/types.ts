export const GPU_TYPES = [
  'float',
  'vec2',
  'vec3',
  'vec4',
  'mat4',
  'sampler2D',
  'sampler3D',
  'storage',
] as const;

export type GpuType = (typeof GPU_TYPES)[number];

export type GpuRecord = Record<string, GpuType>;

export interface Vec2 {
  readonly x: number;
  readonly y: number;
  add(other: Vec2): Vec2;
  sub(other: Vec2): Vec2;
  mul(other: Vec2 | number): Vec2;
  div(other: Vec2 | number): Vec2;
  scale(factor: number): Vec2;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly xy: Vec2;
  readonly xz: Vec2;
  readonly yz: Vec2;
  add(other: Vec3): Vec3;
  sub(other: Vec3): Vec3;
  mul(other: Vec3 | number): Vec3;
  div(other: Vec3 | number): Vec3;
  scale(factor: number): Vec3;
}

export interface Vec4 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
  readonly xy: Vec2;
  readonly xyz: Vec3;
  add(other: Vec4): Vec4;
  sub(other: Vec4): Vec4;
  mul(other: Vec4 | number): Vec4;
  div(other: Vec4 | number): Vec4;
  scale(factor: number): Vec4;
}

export interface Mat4 {
  mul(other: Mat4): Mat4;
  mul(other: Vec4): Vec4;
}

/** Opaque texture handle inside shader code — only usable via texture(sampler, uv). */
export interface Sampler2D {
  readonly __brand: 'Sampler2D';
}

/**
 * A volume texture, sampled with a vec3. Volumetric work — cloud density,
 * precomputed scattering, any field that varies through space rather than
 * across a surface — needs a third axis; packing one into a 2D atlas costs a
 * manual filter between slices and still bleeds at the seams.
 */
export interface Sampler3D {
  readonly __brand: 'Sampler3D';
}

/**
 * A read-only storage buffer — an arbitrarily long array of one element type,
 * read with storageRead(buffer, index).
 *
 * Access is a function rather than `buffer[i]` because the DSL has no arrays and
 * no indexing; routing it through a call keeps storage inside the machinery
 * texture() already uses instead of adding an expression form to the language.
 */
export interface Storage<T = unknown> {
  readonly __brand: 'Storage';
  /** Phantom: carries the element type so storageRead returns the right thing. */
  readonly __element?: T;
}

export type GpuValue<T extends GpuType> = T extends 'float'
  ? number
  : T extends 'vec2'
    ? Vec2
    : T extends 'vec3'
      ? Vec3
      : T extends 'vec4'
        ? Vec4
        : T extends 'mat4'
          ? Mat4
          : T extends 'sampler2D'
            ? Sampler2D
            : T extends 'sampler3D'
              ? Sampler3D
              : Storage<unknown>;

export type Values<R extends GpuRecord> = { -readonly [K in keyof R]: GpuValue<R[K]> };

/**
 * Storage records are declared by ELEMENT type — `{ wave: 'vec2' }` is an
 * array of vec2 — so in shader code the name is a buffer handle, not a vec2.
 * Values<> would map it to the element type and reject storageRead().
 */
export type StorageValues<S extends GpuRecord> = {
  -readonly [K in keyof S]: Storage<GpuValue<S[K]>>;
};

export interface ShaderDefinition<
  A extends GpuRecord = GpuRecord,
  I extends GpuRecord = GpuRecord,
  U extends GpuRecord = GpuRecord,
  V extends GpuRecord = GpuRecord,
  S extends GpuRecord = GpuRecord,
> {
  /** Required for anything that draws; omit on a compute-only shader. */
  attributes?: A;
  /** Per-instance inputs (advance once per instance, not per vertex). */
  instanceAttributes?: I;
  uniforms?: U;
  /**
   * Read-only storage buffers, declared by ELEMENT type: `{ spectrum: 'vec2' }`
   * is an `array<vec2<f32>>`. The names arrive in the same `uniforms` parameter
   * the samplers do.
   */
  storage?: S;
  varyings?: V;
  vertex?(
    inputs: Readonly<Values<A & I>>,
    uniforms: Readonly<Values<U> & StorageValues<S>>,
    varyings: Values<V>,
  ): Vec4;
  fragment?(
    uniforms: Readonly<Values<U> & StorageValues<S>>,
    varyings: Readonly<Values<V>>,
  ): Vec4;
  /**
   * A compute stage. WebGPU only — WebGL2 has no compute shaders at all, so a
   * shader declaring one compiles to WGSL alone.
   *
   * `id` is the global invocation id as floats. Compute returns nothing; it
   * communicates by writing to storage buffers.
   */
  compute?(uniforms: Readonly<Values<U> & StorageValues<S>>, id: Vec3): void;
  /** Threads per workgroup. Defaults to [64, 1, 1]. */
  workgroupSize?: readonly [number, number, number];
}

/**
 * Declares a GPU shader program. The body is never executed on the CPU — the
 * BroMetal CLI (`npx brometal dev` / `npx brometal prod`) compiles it to GLSL.
 */
export function shader<
  const A extends GpuRecord = Record<string, never>,
  const I extends GpuRecord = Record<string, never>,
  const U extends GpuRecord = Record<string, never>,
  const V extends GpuRecord = Record<string, never>,
  const S extends GpuRecord = Record<string, never>,
>(definition: ShaderDefinition<A, I, U, V, S>): ShaderDefinition<A, I, U, V, S> {
  return definition;
}

/** GL upload routine chosen for a uniform at compile time. '1i' = sampler texture unit. */
export type UniformKind = '1f' | '2fv' | '3fv' | '4fv' | 'm4fv' | '1i';

export interface AttributeLayoutEntry {
  name: string;
  type: GpuType;
  /** GLSL location, assigned by the compiler via layout(location = N). */
  location: number;
  /** Components per element (floats). */
  size: number;
  /** 0 = advances per vertex, 1 = per instance. */
  divisor: 0 | 1;
}

export interface UniformLayoutEntry {
  name: string;
  type: GpuType;
  kind: UniformKind;
  /** Expected value length (1 for float scalars and samplers). */
  size: number;
  /** Texture unit (WebGL), assigned at compile time — present only for samplers. */
  unit?: number;
  /** Byte offset in the WebGPU uniform block — absent for samplers. */
  offset?: number;
  /** WebGPU bind group bindings — present only for samplers. */
  textureBinding?: number;
  samplerBinding?: number;
}

/** Precomputed wiring plan — everything the runtime needs, decided at compile time. */
export interface ShaderLayout {
  attributes: AttributeLayoutEntry[];
  uniforms: UniformLayoutEntry[];
  /** Total byte size of the WebGPU uniform block (0 = no non-sampler uniforms). */
  uniformBlockSize: number;
}

export interface CompiledShader<
  A extends GpuRecord = GpuRecord,
  I extends GpuRecord = GpuRecord,
  U extends GpuRecord = GpuRecord,
> {
  vertexSrc: string;
  fragmentSrc: string;
  /** WGSL module (both entry points) — present when compiled with the webgpu target. */
  wgslSrc?: string;
  attributes: A;
  instanceAttributes: I;
  uniforms: U;
  layout: ShaderLayout;
  /** Buffers the compute stage writes — these bind as read_write. */
  storageWritten?: string[];
  /** True when the module has a cs_main entry point. */
  hasCompute?: boolean;
}
