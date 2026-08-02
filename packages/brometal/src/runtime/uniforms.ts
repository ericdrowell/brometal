import type { GpuType, UniformLayoutEntry } from '../dsl/types.js';
import type { BroMetalTexture } from './texture.js';
import type { BroMetalStorageBuffer } from './storage.js';

export type UniformValue<T extends GpuType> = T extends 'float'
  ? number
  : T extends 'storage'
    ? BroMetalStorageBuffer
    : T extends 'sampler2D' | 'sampler3D'
      ? BroMetalTexture
    : Float32Array | readonly number[];

/**
 * Checks a value against the size the compiler recorded for its uniform, and
 * normalises it to something writable into the uniform buffer.
 *
 * Lives here rather than inline in the backend because a wrong-length uniform is
 * otherwise invisible: the value is written into a packed buffer, so three
 * components landing in a `mat4` slot shift every uniform after it and the
 * symptom shows up in an unrelated value.
 */
export function checkUniformValue(
  entry: UniformLayoutEntry,
  value: number | Float32Array | readonly number[],
): ArrayLike<number> {
  if (typeof value === 'number') {
    if (entry.size !== 1) {
      throw new Error(
        `BroMetal: uniform '${entry.name}' (${entry.type}) expects an array of numbers`,
      );
    }
    return [value];
  }
  if (value.length !== entry.size) {
    throw new Error(
      `BroMetal: uniform '${entry.name}' (${entry.type}) expects ${entry.size} values, got ${value.length}`,
    );
  }
  return value as ArrayLike<number>;
}
