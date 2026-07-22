import { describe, expect, it } from 'vitest';
import type { UniformLayoutEntry } from '../src/dsl/types.js';
import { createUniformSetter } from '../src/runtime/uniforms.js';

interface RecordedCall {
  method: string;
  args: unknown[];
}

function stubGl(): { gl: WebGL2RenderingContext; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const gl = {
    uniform1f: record('uniform1f'),
    uniform2fv: record('uniform2fv'),
    uniform3fv: record('uniform3fv'),
    uniform4fv: record('uniform4fv'),
    uniformMatrix4fv: record('uniformMatrix4fv'),
  } as unknown as WebGL2RenderingContext;
  return { gl, calls };
}

const LOCATION = {} as WebGLUniformLocation;

const FLOAT_ENTRY: UniformLayoutEntry = { name: 'uTime', type: 'float', kind: '1f', size: 1 };
const VEC2_ENTRY: UniformLayoutEntry = { name: 'uSize', type: 'vec2', kind: '2fv', size: 2 };
const VEC3_ENTRY: UniformLayoutEntry = { name: 'uLightDir', type: 'vec3', kind: '3fv', size: 3 };
const MAT4_ENTRY: UniformLayoutEntry = { name: 'uMvp', type: 'mat4', kind: 'm4fv', size: 16 };

describe('uniform setters', () => {
  it('routes float uniforms to uniform1f', () => {
    const { gl, calls } = stubGl();
    createUniformSetter(gl, FLOAT_ENTRY, LOCATION)(1.5);
    expect(calls).toEqual([{ method: 'uniform1f', args: [LOCATION, 1.5] }]);
  });

  it('routes vec3 uniforms to uniform3fv', () => {
    const { gl, calls } = stubGl();
    createUniformSetter(gl, VEC3_ENTRY, LOCATION)([0, 1, 0]);
    expect(calls).toEqual([{ method: 'uniform3fv', args: [LOCATION, [0, 1, 0]] }]);
  });

  it('routes mat4 uniforms to uniformMatrix4fv without transpose', () => {
    const { gl, calls } = stubGl();
    const matrix = new Float32Array(16);
    createUniformSetter(gl, MAT4_ENTRY, LOCATION)(matrix);
    expect(calls).toEqual([{ method: 'uniformMatrix4fv', args: [LOCATION, false, matrix] }]);
  });

  it('rejects wrong-length values using the compile-time size', () => {
    const { gl } = stubGl();
    expect(() => createUniformSetter(gl, VEC3_ENTRY, LOCATION)([0, 1])).toThrow(
      /expects 3 values, got 2/,
    );
    expect(() => createUniformSetter(gl, MAT4_ENTRY, LOCATION)(new Float32Array(9))).toThrow(
      /expects 16 values, got 9/,
    );
  });

  it('rejects scalars for vector uniforms and arrays for float uniforms', () => {
    const { gl } = stubGl();
    expect(() => createUniformSetter(gl, VEC2_ENTRY, LOCATION)(1)).toThrow(/expects an array/);
    expect(() => createUniformSetter(gl, FLOAT_ENTRY, LOCATION)([1])).toThrow(/expects a number/);
  });
});
