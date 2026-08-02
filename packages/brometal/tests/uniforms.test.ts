import { describe, expect, it } from 'vitest';
import type { UniformLayoutEntry } from '../src/dsl/types.js';
import { checkUniformValue } from '../src/runtime/uniforms.js';

const FLOAT_ENTRY: UniformLayoutEntry = { name: 'uTime', type: 'float', kind: '1f', size: 1 };
const VEC2_ENTRY: UniformLayoutEntry = { name: 'uSize', type: 'vec2', kind: '2fv', size: 2 };
const VEC3_ENTRY: UniformLayoutEntry = { name: 'uLightDir', type: 'vec3', kind: '3fv', size: 3 };
const MAT4_ENTRY: UniformLayoutEntry = { name: 'uMvp', type: 'mat4', kind: 'm4fv', size: 16 };

describe('uniform values', () => {
  it('wraps a scalar so it writes as one component', () => {
    expect(Array.from(checkUniformValue(FLOAT_ENTRY, 1.5))).toEqual([1.5]);
  });

  it('passes arrays of the declared length straight through', () => {
    expect(checkUniformValue(VEC3_ENTRY, [0, 1, 0])).toEqual([0, 1, 0]);
    const matrix = new Float32Array(16);
    expect(checkUniformValue(MAT4_ENTRY, matrix)).toBe(matrix);
  });

  it('rejects wrong-length values using the compile-time size', () => {
    // Uniforms are packed end to end, so a short write does not fail — it shifts
    // every uniform after it, and the wrong value shows up somewhere unrelated.
    expect(() => checkUniformValue(VEC3_ENTRY, [0, 1])).toThrow(/expects 3 values, got 2/);
    expect(() => checkUniformValue(MAT4_ENTRY, new Float32Array(9))).toThrow(
      /expects 16 values, got 9/,
    );
  });

  it('rejects a scalar for a vector uniform', () => {
    expect(() => checkUniformValue(VEC2_ENTRY, 1)).toThrow(/expects an array/);
  });
});
