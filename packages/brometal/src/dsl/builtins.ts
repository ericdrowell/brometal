import type { Sampler2D, Vec2, Vec3, Vec4 } from './types.js';

function gpuOnly(name: string): never {
  throw new Error(
    `BroMetal: ${name}() is GPU shader code and cannot run on the CPU. ` +
      `Shader modules are compiled by \`npx brometal dev\` — apps should import the generated .gen.ts module, not the shader source.`,
  );
}

export function vec2(x: number, y: number): Vec2;
export function vec2(splat: number): Vec2;
export function vec2(): Vec2 {
  return gpuOnly('vec2');
}

export function vec3(x: number, y: number, z: number): Vec3;
export function vec3(xy: Vec2, z: number): Vec3;
export function vec3(splat: number): Vec3;
export function vec3(): Vec3 {
  return gpuOnly('vec3');
}

export function vec4(x: number, y: number, z: number, w: number): Vec4;
export function vec4(xyz: Vec3, w: number): Vec4;
export function vec4(xy: Vec2, z: number, w: number): Vec4;
export function vec4(xy: Vec2, zw: Vec2): Vec4;
export function vec4(splat: number): Vec4;
export function vec4(): Vec4 {
  return gpuOnly('vec4');
}

export function texture(sampler: Sampler2D, uv: Vec2): Vec4;
export function texture(): Vec4 {
  return gpuOnly('texture');
}

export function reflect<T extends Vec2 | Vec3 | Vec4>(incident: T, normal: T): T;
export function reflect(): never {
  return gpuOnly('reflect');
}

export function normalize<T extends Vec2 | Vec3 | Vec4>(v: T): T;
export function normalize(): never {
  return gpuOnly('normalize');
}

export function dot(a: Vec2, b: Vec2): number;
export function dot(a: Vec3, b: Vec3): number;
export function dot(a: Vec4, b: Vec4): number;
export function dot(): number {
  return gpuOnly('dot');
}

export function cross(a: Vec3, b: Vec3): Vec3;
export function cross(): Vec3 {
  return gpuOnly('cross');
}

export function mix(a: number, b: number, t: number): number;
export function mix<T extends Vec2 | Vec3 | Vec4>(a: T, b: T, t: number): T;
export function mix(): never {
  return gpuOnly('mix');
}

export function clamp(x: number, min: number, max: number): number;
export function clamp<T extends Vec2 | Vec3 | Vec4>(x: T, min: number, max: number): T;
export function clamp(): never {
  return gpuOnly('clamp');
}

export function length(v: Vec2 | Vec3 | Vec4): number;
export function length(): number {
  return gpuOnly('length');
}

export function sin(x: number): number;
export function sin(): number {
  return gpuOnly('sin');
}

export function cos(x: number): number;
export function cos(): number {
  return gpuOnly('cos');
}

export function abs(x: number): number;
export function abs(): number {
  return gpuOnly('abs');
}

export function fract(x: number): number;
export function fract(): number {
  return gpuOnly('fract');
}

export function floor(x: number): number;
export function floor(): number {
  return gpuOnly('floor');
}

export function sqrt(x: number): number;
export function sqrt(): number {
  return gpuOnly('sqrt');
}

export function pow(base: number, exponent: number): number;
export function pow(): number {
  return gpuOnly('pow');
}

export function tan(x: number): number;
export function tan(): number {
  return gpuOnly('tan');
}

export function asin(x: number): number;
export function asin(): number {
  return gpuOnly('asin');
}

export function acos(x: number): number;
export function acos(): number {
  return gpuOnly('acos');
}

export function atan(y: number, x: number): number;
export function atan(x: number): number;
export function atan(): number {
  return gpuOnly('atan');
}

export function exp(x: number): number;
export function exp(): number {
  return gpuOnly('exp');
}

export function exp2(x: number): number;
export function exp2(): number {
  return gpuOnly('exp2');
}

export function log(x: number): number;
export function log(): number {
  return gpuOnly('log');
}

export function sign(x: number): number;
export function sign(): number {
  return gpuOnly('sign');
}

export function mod(a: number, b: number): number;
export function mod(): number {
  return gpuOnly('mod');
}

export function step(edge: number, x: number): number;
export function step(): number {
  return gpuOnly('step');
}

export function smoothstep(edge0: number, edge1: number, x: number): number;
export function smoothstep(): number {
  return gpuOnly('smoothstep');
}

export function distance(a: Vec2, b: Vec2): number;
export function distance(a: Vec3, b: Vec3): number;
export function distance(a: Vec4, b: Vec4): number;
export function distance(): number {
  return gpuOnly('distance');
}

export function min(a: number, b: number): number;
export function min(): number {
  return gpuOnly('min');
}

export function max(a: number, b: number): number;
export function max(): number {
  return gpuOnly('max');
}
