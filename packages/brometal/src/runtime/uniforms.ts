import type { GpuType } from '../dsl/types.js';

export type UniformValue<T extends GpuType> = T extends 'float'
  ? number
  : T extends 'mat4'
    ? Float32Array | readonly number[]
    : Float32Array | readonly number[];

const EXPECTED_LENGTHS: Record<Exclude<GpuType, 'float'>, number> = {
  vec2: 2,
  vec3: 3,
  vec4: 4,
  mat4: 16,
};

export function createUniformSetter(
  gl: WebGL2RenderingContext,
  type: GpuType,
  name: string,
  location: WebGLUniformLocation,
): (value: number | Float32Array | readonly number[]) => void {
  // The GL calls read but never mutate the value, so accepting readonly
  // arrays is safe despite Float32List being typed as mutable.
  const checkLength = (value: Float32Array | readonly number[]): Float32List => {
    const expected = EXPECTED_LENGTHS[type as Exclude<GpuType, 'float'>];
    if (value.length !== expected) {
      throw new Error(
        `BroMetal: uniform '${name}' (${type}) expects ${expected} values, got ${value.length}`,
      );
    }
    return value as Float32List;
  };

  switch (type) {
    case 'float':
      return (value) => {
        if (typeof value !== 'number') {
          throw new Error(`BroMetal: uniform '${name}' (float) expects a number`);
        }
        gl.uniform1f(location, value);
      };
    case 'vec2':
      return (value) => {
        assertArray(name, type, value);
        gl.uniform2fv(location, checkLength(value));
      };
    case 'vec3':
      return (value) => {
        assertArray(name, type, value);
        gl.uniform3fv(location, checkLength(value));
      };
    case 'vec4':
      return (value) => {
        assertArray(name, type, value);
        gl.uniform4fv(location, checkLength(value));
      };
    case 'mat4':
      return (value) => {
        assertArray(name, type, value);
        gl.uniformMatrix4fv(location, false, checkLength(value));
      };
  }
}

function assertArray(
  name: string,
  type: GpuType,
  value: number | Float32Array | readonly number[],
): asserts value is Float32Array | readonly number[] {
  if (typeof value === 'number') {
    throw new Error(`BroMetal: uniform '${name}' (${type}) expects an array of numbers`);
  }
}
