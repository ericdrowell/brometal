import type { CompiledShader, GpuRecord, GpuType } from '../dsl/types.js';
import {
  ATTRIBUTE_COMPONENT_COUNTS,
  uploadAttribute,
  uploadIndices,
  type AttributeState,
  type IndexState,
} from './buffers.js';
import { createUniformSetter, type UniformValue } from './uniforms.js';

export interface AttributeHandle {
  set(data: Float32Array): void;
}

export interface UniformHandle<T extends GpuType> {
  set(value: UniformValue<T>): void;
}

export interface BroMetalProgram<
  A extends GpuRecord = GpuRecord,
  I extends GpuRecord = GpuRecord,
  U extends GpuRecord = GpuRecord,
> {
  readonly attributes: { [K in keyof A]: AttributeHandle };
  readonly instanceAttributes: { [K in keyof I]: AttributeHandle };
  readonly uniforms: { [K in keyof U]: UniformHandle<U[K]> };
  setIndices(data: Uint16Array | Uint32Array): void;
  draw(): void;
  dispose(): void;
}

export function createProgram<A extends GpuRecord, I extends GpuRecord, U extends GpuRecord>(
  gl: WebGL2RenderingContext,
  compiled: CompiledShader<A, I, U>,
): BroMetalProgram<A, I, U> {
  const program = linkProgram(gl, compiled.vertexSrc, compiled.fragmentSrc);
  const vao = gl.createVertexArray();
  if (vao === null) {
    throw new Error('BroMetal: failed to create a vertex array object');
  }

  const vertexStates = new Map<string, AttributeState>();
  const instanceStates = new Map<string, AttributeState>();
  const attributes = buildAttributeHandles<A>(gl, program, vao, compiled.attributes, vertexStates, 0);
  const instanceAttributes = buildAttributeHandles<I>(
    gl,
    program,
    vao,
    compiled.instanceAttributes,
    instanceStates,
    1,
  );
  const isInstanced = Object.keys(compiled.instanceAttributes).length > 0;

  const uniforms = {} as { [K in keyof U]: UniformHandle<U[K]> };
  for (const [name, type] of Object.entries(compiled.uniforms) as [keyof U & string, GpuType][]) {
    const location = gl.getUniformLocation(program, name);
    const setter = location === null ? null : createUniformSetter(gl, type, name, location);
    uniforms[name] = {
      set(value: UniformValue<U[keyof U]>): void {
        if (setter === null) {
          warnOnce(`uniform '${name}' is unused in the compiled shader; ignoring set()`);
          return;
        }
        gl.useProgram(program);
        setter(value);
      },
    } as UniformHandle<U[keyof U & string]>;
  }

  let indexState: IndexState | null = null;

  return {
    attributes,
    instanceAttributes,
    uniforms,
    setIndices(data: Uint16Array | Uint32Array): void {
      if (indexState === null) {
        const buffer = gl.createBuffer();
        if (buffer === null) {
          throw new Error('BroMetal: failed to create an index buffer');
        }
        indexState = { buffer, count: 0, type: gl.UNSIGNED_SHORT };
      }
      gl.bindVertexArray(vao);
      uploadIndices(gl, indexState, data);
      gl.bindVertexArray(null);
    },
    draw(): void {
      const vertexCount = resolveCount(
        vertexStates,
        'no vertex data — call program.attributes.<name>.set(...) before draw()',
        'vertices',
      );
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      if (isInstanced) {
        const instanceCount = resolveCount(
          instanceStates,
          'no instance data — call program.instanceAttributes.<name>.set(...) before draw()',
          'instances',
        );
        if (indexState !== null) {
          gl.drawElementsInstanced(gl.TRIANGLES, indexState.count, indexState.type, 0, instanceCount);
        } else {
          gl.drawArraysInstanced(gl.TRIANGLES, 0, vertexCount, instanceCount);
        }
      } else if (indexState !== null) {
        gl.drawElements(gl.TRIANGLES, indexState.count, indexState.type, 0);
      } else {
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
      }
      gl.bindVertexArray(null);
    },
    dispose(): void {
      for (const state of vertexStates.values()) {
        gl.deleteBuffer(state.buffer);
      }
      for (const state of instanceStates.values()) {
        gl.deleteBuffer(state.buffer);
      }
      vertexStates.clear();
      instanceStates.clear();
      if (indexState !== null) {
        gl.deleteBuffer(indexState.buffer);
        indexState = null;
      }
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}

function buildAttributeHandles<R extends GpuRecord>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  vao: WebGLVertexArrayObject,
  record: R,
  states: Map<string, AttributeState>,
  divisor: 0 | 1,
): { [K in keyof R]: AttributeHandle } {
  const handles = {} as { [K in keyof R]: AttributeHandle };
  for (const [name, type] of Object.entries(record) as [keyof R & string, GpuType][]) {
    const componentCount = ATTRIBUTE_COMPONENT_COUNTS[type];
    if (componentCount === undefined) {
      throw new Error(`BroMetal: attribute '${name}' has unsupported type '${type}'`);
    }
    const location = gl.getAttribLocation(program, name);
    handles[name] = {
      set(data: Float32Array): void {
        if (location === -1) {
          warnOnce(`attribute '${name}' was optimized out of the compiled shader; ignoring set()`);
          return;
        }
        let state = states.get(name);
        if (state === undefined) {
          const buffer = gl.createBuffer();
          if (buffer === null) {
            throw new Error(`BroMetal: failed to create a buffer for attribute '${name}'`);
          }
          state = { buffer, componentCount, elementCount: 0 };
          states.set(name, state);
        }
        gl.bindVertexArray(vao);
        uploadAttribute(gl, state, location, data, divisor);
        gl.bindVertexArray(null);
      },
    };
  }
  return handles;
}

function resolveCount(states: Map<string, AttributeState>, emptyMessage: string, unit: string): number {
  let count: number | null = null;
  let firstName = '';
  for (const [name, state] of states) {
    if (count === null) {
      count = state.elementCount;
      firstName = name;
    } else if (state.elementCount !== count) {
      throw new Error(
        `BroMetal: attribute counts disagree — '${firstName}' has ${count} ${unit} but '${name}' has ${state.elementCount}`,
      );
    }
  }
  if (count === null || count === 0) {
    throw new Error(`BroMetal: ${emptyMessage}`);
  }
  return count;
}

function linkProgram(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string): WebGLProgram {
  const vertexShader = compileStage(gl, gl.VERTEX_SHADER, 'vertex', vertexSrc);
  const fragmentShader = compileStage(gl, gl.FRAGMENT_SHADER, 'fragment', fragmentSrc);
  const program = gl.createProgram();
  if (program === null) {
    throw new Error('BroMetal: failed to create a WebGL program');
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    const info = gl.getProgramInfoLog(program) ?? 'unknown link error';
    gl.deleteProgram(program);
    throw new Error(`BroMetal: shader program failed to link:\n${info}`);
  }
  return program;
}

function compileStage(
  gl: WebGL2RenderingContext,
  kind: number,
  label: string,
  source: string,
): WebGLShader {
  const shader = gl.createShader(kind);
  if (shader === null) {
    throw new Error(`BroMetal: failed to create a ${label} shader`);
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const info = gl.getShaderInfoLog(shader) ?? 'unknown compile error';
    gl.deleteShader(shader);
    const numbered = source
      .trimEnd()
      .split('\n')
      .map((line, index) => `${String(index + 1).padStart(3)} | ${line}`)
      .join('\n');
    throw new Error(`BroMetal: ${label} shader failed to compile:\n${info}\n${numbered}`);
  }
  return shader;
}

const warned = new Set<string>();

function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`BroMetal: ${message}`);
}
