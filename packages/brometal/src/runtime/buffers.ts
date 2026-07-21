import type { GpuType } from '../dsl/types.js';

export const ATTRIBUTE_COMPONENT_COUNTS: Partial<Record<GpuType, number>> = {
  float: 1,
  vec2: 2,
  vec3: 3,
  vec4: 4,
};

export interface AttributeState {
  buffer: WebGLBuffer;
  componentCount: number;
  /** Vertices for per-vertex attributes; instances for per-instance attributes. */
  elementCount: number;
}

export function uploadAttribute(
  gl: WebGL2RenderingContext,
  state: AttributeState,
  location: number,
  data: Float32Array,
  divisor: 0 | 1,
): void {
  if (data.length % state.componentCount !== 0) {
    throw new Error(
      `BroMetal: attribute data length ${data.length} is not a multiple of ${state.componentCount} components per element`,
    );
  }
  state.elementCount = data.length / state.componentCount;
  gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, state.componentCount, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(location, divisor);
}

export interface IndexState {
  buffer: WebGLBuffer;
  count: number;
  type: number;
}

export function uploadIndices(
  gl: WebGL2RenderingContext,
  state: IndexState,
  data: Uint16Array | Uint32Array,
): void {
  state.count = data.length;
  state.type = data instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
}
