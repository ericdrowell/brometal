import type { GpuType, UniformLayoutEntry } from '../dsl/types.js';

export type UniformValue<T extends GpuType> = T extends 'float'
  ? number
  : Float32Array | readonly number[];

/**
 * Builds the upload routine for one uniform from its compile-time layout
 * entry — the GL call and expected length were decided by the compiler.
 */
export function createUniformSetter(
  gl: WebGL2RenderingContext,
  entry: UniformLayoutEntry,
  location: WebGLUniformLocation,
): (value: number | Float32Array | readonly number[]) => void {
  // The GL calls read but never mutate the value, so accepting readonly
  // arrays is safe despite Float32List being typed as mutable.
  const checkLength = (value: Float32Array | readonly number[]): Float32List => {
    if (value.length !== entry.size) {
      throw new Error(
        `BroMetal: uniform '${entry.name}' (${entry.type}) expects ${entry.size} values, got ${value.length}`,
      );
    }
    return value as Float32List;
  };

  switch (entry.kind) {
    case '1f':
      return (value) => {
        if (typeof value !== 'number') {
          throw new Error(`BroMetal: uniform '${entry.name}' (float) expects a number`);
        }
        gl.uniform1f(location, value);
      };
    case '2fv':
      return (value) => {
        assertArray(entry, value);
        gl.uniform2fv(location, checkLength(value));
      };
    case '3fv':
      return (value) => {
        assertArray(entry, value);
        gl.uniform3fv(location, checkLength(value));
      };
    case '4fv':
      return (value) => {
        assertArray(entry, value);
        gl.uniform4fv(location, checkLength(value));
      };
    case 'm4fv':
      return (value) => {
        assertArray(entry, value);
        gl.uniformMatrix4fv(location, false, checkLength(value));
      };
  }
}

function assertArray(
  entry: UniformLayoutEntry,
  value: number | Float32Array | readonly number[],
): asserts value is Float32Array | readonly number[] {
  if (typeof value === 'number') {
    throw new Error(`BroMetal: uniform '${entry.name}' (${entry.type}) expects an array of numbers`);
  }
}
