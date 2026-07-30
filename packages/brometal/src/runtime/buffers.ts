/**
 * Compares a requested draw count with the number of elements that were uploaded.
 *
 * A request that is larger than the buffer is an error. Report it, and do not
 * reduce it without a message. If the count is too large, the GPU reads past the
 * end of the data.
 *
 * This function is here, and not in program.ts, so that both backends can use it.
 * program.ts and webgpu.ts must not import values from each other.
 */
export function clampDrawCount(requested: number | undefined, available: number, label: string): number {
  if (requested === undefined) return Math.max(available, 0);
  if (!Number.isFinite(requested) || requested < 0) {
    throw new Error(`BroMetal: draw({ ${label}: ${requested} }) must be a non-negative number`);
  }
  const count = Math.floor(requested);
  if (count > available) {
    throw new Error(
      `BroMetal: draw({ ${label}: ${count} }) exceeds the ${available} uploaded — upload more data or lower the count`,
    );
  }
  return count;
}

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
