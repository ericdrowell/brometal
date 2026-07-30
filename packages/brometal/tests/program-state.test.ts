import { describe, expect, it } from 'vitest';
import { createProgram } from '../src/runtime/program.js';
import { compileShaderSource } from '../src/compiler/compile.js';
import type { Renderer } from '../src/runtime/context.js';
import type { CompiledShader, GpuRecord } from '../src/dsl/types.js';

interface RecordedCall {
  method: string;
  args: unknown[];
}

const GL_TRIANGLES = 0x0004;
const GL_UNSIGNED_SHORT = 0x1403;
const GL_UNSIGNED_INT = 0x1405;
const GL_DEPTH_TEST = 0x0b71;
const GL_BLEND = 0x0be2;
const GL_SRC_ALPHA = 0x0302;
const GL_ONE_MINUS_SRC_ALPHA = 0x0303;
const GL_ONE = 1;

/** A WebGL2 stub that records the draw-time state calls we care about. */
function stubRenderer(): { renderer: Renderer; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const gl = {
    TRIANGLES: GL_TRIANGLES,
    UNSIGNED_SHORT: GL_UNSIGNED_SHORT,
    UNSIGNED_INT: GL_UNSIGNED_INT,
    DEPTH_TEST: GL_DEPTH_TEST,
    BLEND: GL_BLEND,
    SRC_ALPHA: GL_SRC_ALPHA,
    ONE_MINUS_SRC_ALPHA: GL_ONE_MINUS_SRC_ALPHA,
    ONE: GL_ONE,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    LINK_STATUS: 0x8b82,
    COMPILE_STATUS: 0x8b81,
    createShader: () => ({}) as WebGLShader,
    shaderSource: () => undefined,
    compileShader: () => undefined,
    getShaderParameter: () => true,
    createProgram: () => ({}) as WebGLProgram,
    attachShader: () => undefined,
    linkProgram: () => undefined,
    deleteShader: () => undefined,
    getProgramParameter: () => true,
    getUniformLocation: () => ({}) as WebGLUniformLocation,
    uniform1i: () => undefined,
    uniformMatrix4fv: () => undefined,
    uniform1f: () => undefined,
    createVertexArray: () => ({}) as WebGLVertexArrayObject,
    bindVertexArray: () => undefined,
    createBuffer: () => ({}) as WebGLBuffer,
    bindBuffer: () => undefined,
    bufferData: () => undefined,
    enableVertexAttribArray: () => undefined,
    vertexAttribPointer: () => undefined,
    vertexAttribDivisor: () => undefined,
    useProgram: () => undefined,
    enable: record('enable'),
    disable: record('disable'),
    depthMask: record('depthMask'),
    blendFunc: record('blendFunc'),
    blendFuncSeparate: record('blendFuncSeparate'),
    drawArrays: record('drawArrays'),
    drawElements: record('drawElements'),
    drawArraysInstanced: record('drawArraysInstanced'),
    drawElementsInstanced: record('drawElementsInstanced'),
  } as unknown as WebGL2RenderingContext;
  return { renderer: { backend: 'webgl2', gl } as Renderer, calls };
}

const PLAIN_SHADER = `
import { shader, vec4 } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3' },
  varyings: { vFade: 'float' },
  vertex({ aPosition }, _u, v) { v.vFade = 1; return vec4(aPosition, 1); },
  fragment(_u, { vFade }) { return vec4(vFade, 0, 0, 1); },
});
`;

const INSTANCED_SHADER = `
import { shader, vec4 } from 'brometal';
export default shader({
  attributes: { aPosition: 'vec3' },
  instanceAttributes: { iOffset: 'vec3' },
  varyings: { vFade: 'float' },
  vertex({ aPosition, iOffset }, _u, v) { v.vFade = 1; return vec4(aPosition.add(iOffset), 1); },
  fragment(_u, { vFade }) { return vec4(vFade, 0, 0, 1); },
});
`;

function compiled(source: string): CompiledShader<GpuRecord, GpuRecord, GpuRecord> {
  const module = compileShaderSource('test.shader.ts', source);
  return module as unknown as CompiledShader<GpuRecord, GpuRecord, GpuRecord>;
}

function lastCall(calls: RecordedCall[], method: string): RecordedCall | undefined {
  return [...calls].reverse().find((call) => call.method === method);
}

describe('depthWrite / depthTest', () => {
  it('writes depth by default for an unblended program', () => {
    const { renderer, calls } = stubRenderer();
    const program = createProgram(renderer, compiled(PLAIN_SHADER));
    program.attributes.aPosition!.set(new Float32Array(9));
    program.draw();
    expect(lastCall(calls, 'depthMask')?.args).toEqual([true]);
  });

  it('does not write depth by default for a blended program', () => {
    const { renderer, calls } = stubRenderer();
    const program = createProgram(renderer, compiled(PLAIN_SHADER), { blend: 'alpha' });
    program.attributes.aPosition!.set(new Float32Array(9));
    program.draw();
    expect(lastCall(calls, 'depthMask')?.args).toEqual([false]);
  });

  it('lets a blended program opt back into depth writes (the cut-out case)', () => {
    const { renderer, calls } = stubRenderer();
    const program = createProgram(renderer, compiled(PLAIN_SHADER), {
      blend: 'alpha',
      depthWrite: true,
    });
    program.attributes.aPosition!.set(new Float32Array(9));
    program.draw();
    expect(lastCall(calls, 'depthMask')?.args).toEqual([true]);
  });

  it('lets an opaque program opt out of depth writes', () => {
    const { renderer, calls } = stubRenderer();
    const program = createProgram(renderer, compiled(PLAIN_SHADER), { depthWrite: false });
    program.attributes.aPosition!.set(new Float32Array(9));
    program.draw();
    expect(lastCall(calls, 'depthMask')?.args).toEqual([false]);
  });

  it('enables the depth test by default and disables it on request', () => {
    const on = stubRenderer();
    const a = createProgram(on.renderer, compiled(PLAIN_SHADER));
    a.attributes.aPosition!.set(new Float32Array(9));
    a.draw();
    expect(on.calls.some((c) => c.method === 'enable' && c.args[0] === GL_DEPTH_TEST)).toBe(true);

    const off = stubRenderer();
    const b = createProgram(off.renderer, compiled(PLAIN_SHADER), { depthTest: false });
    b.attributes.aPosition!.set(new Float32Array(9));
    b.draw();
    expect(off.calls.some((c) => c.method === 'disable' && c.args[0] === GL_DEPTH_TEST)).toBe(true);
  });
});

describe('blend factors', () => {
  it('uses separate alpha factors so destination alpha matches WebGPU', () => {
    const { renderer, calls } = stubRenderer();
    const program = createProgram(renderer, compiled(PLAIN_SHADER), { blend: 'alpha' });
    program.attributes.aPosition!.set(new Float32Array(9));
    program.draw();
    // Colour: SRC_ALPHA / ONE_MINUS_SRC_ALPHA. Alpha: ONE / ONE_MINUS_SRC_ALPHA.
    expect(lastCall(calls, 'blendFuncSeparate')?.args).toEqual([
      GL_SRC_ALPHA,
      GL_ONE_MINUS_SRC_ALPHA,
      GL_ONE,
      GL_ONE_MINUS_SRC_ALPHA,
    ]);
    expect(lastCall(calls, 'blendFunc')).toBeUndefined();
  });

  it('accumulates with ONE on both channels in additive mode', () => {
    const { renderer, calls } = stubRenderer();
    const program = createProgram(renderer, compiled(PLAIN_SHADER), { blend: 'additive' });
    program.attributes.aPosition!.set(new Float32Array(9));
    program.draw();
    expect(lastCall(calls, 'blendFuncSeparate')?.args).toEqual([
      GL_SRC_ALPHA,
      GL_ONE,
      GL_ONE,
      GL_ONE,
    ]);
  });
});

describe('draw() ranges', () => {
  it('draws every uploaded instance by default', () => {
    const { renderer, calls } = stubRenderer();
    const program = createProgram(renderer, compiled(INSTANCED_SHADER));
    program.attributes.aPosition!.set(new Float32Array(9));
    program.instanceAttributes.iOffset!.set(new Float32Array(30)); // 10 instances
    program.draw();
    expect(lastCall(calls, 'drawArraysInstanced')?.args).toEqual([GL_TRIANGLES, 0, 3, 10]);
  });

  it('draws only the live prefix of an over-allocated pool', () => {
    const { renderer, calls } = stubRenderer();
    const program = createProgram(renderer, compiled(INSTANCED_SHADER));
    program.attributes.aPosition!.set(new Float32Array(9));
    program.instanceAttributes.iOffset!.set(new Float32Array(300)); // capacity 100
    program.draw({ instanceCount: 7 });
    expect(lastCall(calls, 'drawArraysInstanced')?.args).toEqual([GL_TRIANGLES, 0, 3, 7]);
  });

  it('skips the draw call entirely for an empty pool', () => {
    const { renderer, calls } = stubRenderer();
    const program = createProgram(renderer, compiled(INSTANCED_SHADER));
    program.attributes.aPosition!.set(new Float32Array(9));
    program.instanceAttributes.iOffset!.set(new Float32Array(300));
    program.draw({ instanceCount: 0 });
    expect(lastCall(calls, 'drawArraysInstanced')).toBeUndefined();
  });

  it('throws when the requested instance count exceeds what was uploaded', () => {
    const { renderer } = stubRenderer();
    const program = createProgram(renderer, compiled(INSTANCED_SHADER));
    program.attributes.aPosition!.set(new Float32Array(9));
    program.instanceAttributes.iOffset!.set(new Float32Array(30)); // 10 instances
    expect(() => program.draw({ instanceCount: 5000 })).toThrow(
      /instanceCount: 5000 \}\) exceeds the 10 uploaded/,
    );
  });

  it('rejects a negative count', () => {
    const { renderer } = stubRenderer();
    const program = createProgram(renderer, compiled(INSTANCED_SHADER));
    program.attributes.aPosition!.set(new Float32Array(9));
    program.instanceAttributes.iOffset!.set(new Float32Array(30));
    expect(() => program.draw({ instanceCount: -1 })).toThrow(/must be a non-negative number/);
  });

  it('honours vertexCount and first on a non-indexed draw', () => {
    const { renderer, calls } = stubRenderer();
    const program = createProgram(renderer, compiled(PLAIN_SHADER));
    program.attributes.aPosition!.set(new Float32Array(30)); // 10 vertices
    program.draw({ first: 3, vertexCount: 6 });
    expect(lastCall(calls, 'drawArrays')?.args).toEqual([GL_TRIANGLES, 3, 6]);
  });

  it('converts first to a byte offset on an indexed draw', () => {
    const { renderer, calls } = stubRenderer();
    const program = createProgram(renderer, compiled(PLAIN_SHADER));
    program.attributes.aPosition!.set(new Float32Array(30));
    program.setIndices(new Uint16Array([0, 1, 2, 0, 2, 3]));
    program.draw({ first: 3, vertexCount: 3 });
    // 3 indices in at 2 bytes each = byte offset 6.
    expect(lastCall(calls, 'drawElements')?.args).toEqual([GL_TRIANGLES, 3, GL_UNSIGNED_SHORT, 6]);
  });

  it('draws every index by default', () => {
    const { renderer, calls } = stubRenderer();
    const program = createProgram(renderer, compiled(PLAIN_SHADER));
    program.attributes.aPosition!.set(new Float32Array(30));
    program.setIndices(new Uint16Array([0, 1, 2, 0, 2, 3]));
    program.draw();
    expect(lastCall(calls, 'drawElements')?.args).toEqual([GL_TRIANGLES, 6, GL_UNSIGNED_SHORT, 0]);
  });
});
