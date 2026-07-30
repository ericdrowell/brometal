import type { AttributeLayoutEntry, CompiledShader, GpuRecord, GpuType } from '../dsl/types.js';
import {
  clampDrawCount,
  uploadAttribute,
  uploadIndices,
  type AttributeState,
  type IndexState,
} from './buffers.js';
import type { Renderer } from './context.js';
import { bindVaoCached, forgetProgram, forgetVao, useProgramCached } from './state.js';
import { createUniformSetter, type UniformValue } from './uniforms.js';
import { createWebgpuProgram } from './webgpu.js';

export type BlendMode = 'none' | 'alpha' | 'additive';

export interface ProgramOptions {
  /**
   * Sets the blend mode. 'alpha' gives normal transparency. 'additive' adds
   * light, for glows and particles.
   *
   * A blended program tests depth. By default it does not write depth.
   */
  blend?: BlendMode;
  /**
   * Controls whether the program writes to the depth buffer. The default is true
   * when `blend` is 'none'.
   *
   * Set this to true together with `discard()` in the fragment stage. Each
   * fragment that remains is then opaque, and the depth buffer puts the sprites in
   * the correct order. The CPU does not sort them.
   *
   * Set it to false on an opaque program to make a second pass that only tests
   * depth.
   */
  depthWrite?: boolean;
  /**
   * Controls whether the program tests the depth buffer. The default is true.
   *
   * Set it to false for a pass that must ignore the depth of the scene. A
   * screen-space HUD and a full-screen background are two examples.
   */
  depthTest?: boolean;
}

export interface AttributeHandle {
  set(data: Float32Array): void;
}

export interface DrawOptions {
  /**
   * Sets the number of instances to draw. The default is the number that was
   * uploaded.
   *
   * This lets one large buffer hold a pool that grows and becomes smaller. Upload
   * the full capacity one time. Then draw only the instances that are in use.
   */
  instanceCount?: number;
  /**
   * Sets the number of vertices to draw. If you called `setIndices`, this is a
   * number of indices. The default is the number that was uploaded.
   */
  vertexCount?: number;
  /** Sets the first vertex or index to draw. The default is 0. */
  first?: number;
  /**
   * Sets the first instance to draw. The default is 0.
   *
   * Use this to hold static instances and dynamic instances in one buffer, and to
   * draw each group with different uniforms. Without it, the two groups need two
   * buffers. The static group is then uploaded again each time the dynamic group
   * changes size.
   */
  firstInstance?: number;
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
  draw(options?: DrawOptions): void;
  dispose(): void;
}

export function createProgram<A extends GpuRecord, I extends GpuRecord, U extends GpuRecord>(
  renderer: Renderer,
  compiled: CompiledShader<A, I, U>,
  options: ProgramOptions = {},
): BroMetalProgram<A, I, U> {
  const blend = options.blend ?? 'none';
  // Sorted transparency wants writes off; a cut-out program turns them back on.
  const depthWrite = options.depthWrite ?? blend === 'none';
  const depthTest = options.depthTest ?? true;
  if (renderer.backend === 'webgpu') {
    return createWebgpuProgram(renderer, compiled, { blend, depthWrite, depthTest });
  }
  const gl = renderer.gl;
  if (gl === undefined) {
    throw new Error('BroMetal: renderer has no WebGL2 context');
  }
  if (compiled.vertexSrc === '') {
    throw new Error(
      'BroMetal: this shader was compiled without the webgl2 target — recompile with --targets=webgl2,webgpu',
    );
  }
  const program = linkProgram(gl, compiled.vertexSrc, compiled.fragmentSrc);
  const vao = gl.createVertexArray();
  if (vao === null) {
    throw new Error('BroMetal: failed to create a vertex array object');
  }

  // All wiring below is driven by the compile-time layout: locations, sizes,
  // and divisors were decided by the compiler — no getAttribLocation calls.
  const vertexStates = new Map<string, AttributeState>();
  const instanceStates = new Map<string, AttributeState>();
  const attributes = {} as { [K in keyof A]: AttributeHandle };
  const instanceAttributes = {} as { [K in keyof I]: AttributeHandle };
  let isInstanced = false;

  for (const entry of compiled.layout.attributes) {
    const handle = buildAttributeHandle(gl, vao, entry, entry.divisor === 0 ? vertexStates : instanceStates);
    if (entry.divisor === 0) {
      attributes[entry.name as keyof A] = handle;
    } else {
      instanceAttributes[entry.name as keyof I] = handle;
      isInstanced = true;
    }
  }

  const uniforms = {} as { [K in keyof U]: UniformHandle<U[K]> };
  for (const entry of compiled.layout.uniforms) {
    const location = gl.getUniformLocation(program, entry.name);

    if (entry.kind === '1i') {
      // Samplers: the texture unit was assigned at compile time, so the
      // uniform itself is set exactly once here; set() only binds the texture.
      const unit = entry.unit ?? 0;
      if (location !== null) {
        useProgramCached(gl, program);
        gl.uniform1i(location, unit);
      }
      uniforms[entry.name as keyof U] = {
        set(value: UniformValue<U[keyof U]>): void {
          if (location === null) {
            warnOnce(`uniform '${entry.name}' is unused in the compiled shader; ignoring set()`);
            return;
          }
          const texture = value as unknown as { glTexture?: WebGLTexture };
          if (texture === null || typeof texture !== 'object' || texture.glTexture === undefined) {
            throw new Error(
              `BroMetal: uniform '${entry.name}' (sampler2D) expects a texture from createTexture()/loadTexture()`,
            );
          }
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, texture.glTexture);
        },
      } as UniformHandle<U[keyof U & string]>;
      continue;
    }

    const setter = location === null ? null : createUniformSetter(gl, entry, location);
    uniforms[entry.name as keyof U] = {
      set(value: UniformValue<U[keyof U]>): void {
        if (setter === null) {
          warnOnce(`uniform '${entry.name}' is unused in the compiled shader; ignoring set()`);
          return;
        }
        useProgramCached(gl, program);
        setter(value as number | Float32Array | readonly number[]);
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
      bindVaoCached(gl, vao);
      uploadIndices(gl, indexState, data);
    },
    draw(drawOptions: DrawOptions = {}): void {
      const uploadedVertices = resolveCount(
        vertexStates,
        'no vertex data — call program.attributes.<name>.set(...) before draw()',
        'vertices',
      );
      useProgramCached(gl, program);
      bindVaoCached(gl, vao);
      if (blend === 'none') {
        gl.disable(gl.BLEND);
      } else {
        gl.enable(gl.BLEND);
        // Set the alpha factors separately from the colour factors. The
        // destination alpha is then equal to the value that the WebGPU backend
        // writes.
        //
        // With SRC_ALPHA on the alpha channel, a blended pass writes aSrc squared.
        // The two backends then disagree wherever the application reads that
        // alpha. A canvas that the page composites is one example. A render target
        // that a later pass samples is another.
        gl.blendFuncSeparate(
          gl.SRC_ALPHA,
          blend === 'alpha' ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE,
          gl.ONE,
          blend === 'alpha' ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE,
        );
      }
      gl.depthMask(depthWrite);
      if (depthTest) {
        gl.enable(gl.DEPTH_TEST);
      } else {
        gl.disable(gl.DEPTH_TEST);
      }

      const first = drawOptions.first ?? 0;
      const available = indexState !== null ? indexState.count : uploadedVertices;
      const vertexCount = clampDrawCount(
        drawOptions.vertexCount,
        available - first,
        indexState !== null ? 'vertexCount (indices)' : 'vertexCount',
      );

      if (isInstanced) {
        const uploadedInstances = resolveCount(
          instanceStates,
          'no instance data — call program.instanceAttributes.<name>.set(...) before draw()',
          'instances',
        );
        const firstInstance = drawOptions.firstInstance ?? 0;
        const instanceCount = clampDrawCount(
          drawOptions.instanceCount,
          uploadedInstances - firstInstance,
          'instanceCount',
        );
        if (instanceCount === 0) return;
        // WebGL2 has no baseInstance parameter. To apply the offset, point each
        // instanced attribute at the correct element.
        //
        // The VAO keeps this offset. The next set() call replaces it, and so does
        // a draw that uses a different offset.
        if (firstInstance !== 0) {
          bindVaoCached(gl, vao);
          for (const entry of compiled.layout.attributes) {
            if (entry.divisor !== 1) continue;
            const state = instanceStates.get(entry.name);
            if (state === undefined) continue;
            gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
            gl.vertexAttribPointer(
              entry.location,
              entry.size,
              gl.FLOAT,
              false,
              0,
              firstInstance * entry.size * 4,
            );
          }
        }
        if (indexState !== null) {
          gl.drawElementsInstanced(
            gl.TRIANGLES,
            vertexCount,
            indexState.type,
            first * indexByteSize(indexState.type),
            instanceCount,
          );
        } else {
          gl.drawArraysInstanced(gl.TRIANGLES, first, vertexCount, instanceCount);
        }
        // Restore the base pointers. If they stay, a later draw on this program
        // that uses no offset reads from the wrong element.
        if (firstInstance !== 0) {
          for (const entry of compiled.layout.attributes) {
            if (entry.divisor !== 1) continue;
            const state = instanceStates.get(entry.name);
            if (state === undefined) continue;
            gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
            gl.vertexAttribPointer(entry.location, entry.size, gl.FLOAT, false, 0, 0);
          }
        }
      } else if (indexState !== null) {
        gl.drawElements(gl.TRIANGLES, vertexCount, indexState.type, first * indexByteSize(indexState.type));
      } else {
        gl.drawArrays(gl.TRIANGLES, first, vertexCount);
      }
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
      forgetVao(gl, vao);
      forgetProgram(gl, program);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}

function buildAttributeHandle(
  gl: WebGL2RenderingContext,
  vao: WebGLVertexArrayObject,
  entry: AttributeLayoutEntry,
  states: Map<string, AttributeState>,
): AttributeHandle {
  return {
    set(data: Float32Array): void {
      let state = states.get(entry.name);
      if (state === undefined) {
        const buffer = gl.createBuffer();
        if (buffer === null) {
          throw new Error(`BroMetal: failed to create a buffer for attribute '${entry.name}'`);
        }
        state = { buffer, componentCount: entry.size, elementCount: 0 };
        states.set(entry.name, state);
      }
      bindVaoCached(gl, vao);
      uploadAttribute(gl, state, entry.location, data, entry.divisor);
    },
  };
}

/** UNSIGNED_SHORT is 0x1403; UNSIGNED_INT is 0x1405. */
function indexByteSize(type: number): number {
  return type === 0x1403 ? 2 : 4;
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
