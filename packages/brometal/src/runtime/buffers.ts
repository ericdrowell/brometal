/**
 * Compares a requested instance count with the number of instances that were
 * uploaded, and returns a count that is safe to draw.
 *
 * A request that is too large is a mistake in the application, but this function
 * does not throw. `draw()` runs inside the frame callback, and both render loops
 * ask for the next animation frame only after that callback returns. An exception
 * therefore stops the animation permanently. On WebGPU it also leaves the render
 * pass open on an encoder that nobody submits, which makes the renderer unusable.
 *
 * The count is reduced instead, and the runtime writes one warning for each
 * distinct message.
 */
export function resolveDrawCount(requested: number | undefined, available: number): number {
  const limit = Math.max(available, 0);
  if (requested === undefined) return limit;
  if (!Number.isFinite(requested) || requested < 0) {
    warnOnce(`draw({ instanceCount: ${requested} }) is not a count. Drawing ${limit} instead.`);
    return limit;
  }
  const count = Math.floor(requested);
  if (count > limit) {
    warnOnce(
      `draw({ instanceCount: ${count} }) is more than the ${limit} instances that were uploaded. ` +
        `Drawing ${limit} instead.`,
    );
    return limit;
  }
  return count;
}

const warned = new Set<string>();

function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`BroMetal: ${message}`);
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
