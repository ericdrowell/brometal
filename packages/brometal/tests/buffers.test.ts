import { describe, expect, it } from 'vitest';
import { uploadAttribute, type AttributeState } from '../src/runtime/buffers.js';

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
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    bindBuffer: record('bindBuffer'),
    bufferData: record('bufferData'),
    enableVertexAttribArray: record('enableVertexAttribArray'),
    vertexAttribPointer: record('vertexAttribPointer'),
    vertexAttribDivisor: record('vertexAttribDivisor'),
  } as unknown as WebGL2RenderingContext;
  return { gl, calls };
}

function freshState(componentCount: number): AttributeState {
  return { buffer: {} as WebGLBuffer, componentCount, elementCount: 0 };
}

describe('attribute uploads', () => {
  it('uploads per-vertex attributes with divisor 0', () => {
    const { gl, calls } = stubGl();
    const state = freshState(3);
    uploadAttribute(gl, state, 2, new Float32Array(9), 0);
    expect(state.elementCount).toBe(3);
    expect(calls.find((c) => c.method === 'vertexAttribPointer')?.args).toEqual([2, 3, 0x1406, false, 0, 0]);
    expect(calls.find((c) => c.method === 'vertexAttribDivisor')?.args).toEqual([2, 0]);
  });

  it('uploads per-instance attributes with divisor 1', () => {
    const { gl, calls } = stubGl();
    const state = freshState(3);
    uploadAttribute(gl, state, 5, new Float32Array(3000), 1);
    expect(state.elementCount).toBe(1000);
    expect(calls.find((c) => c.method === 'vertexAttribDivisor')?.args).toEqual([5, 1]);
  });

  it('rejects data that does not divide evenly into components', () => {
    const { gl } = stubGl();
    expect(() => uploadAttribute(gl, freshState(3), 0, new Float32Array(10), 0)).toThrow(
      /not a multiple of 3 components/,
    );
  });
});
