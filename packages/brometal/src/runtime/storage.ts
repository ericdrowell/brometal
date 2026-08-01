import type { Renderer } from './context.js';
import { createWebgpuStorageBuffer } from './webgpu.js';

/**
 * A read-only storage buffer, bound to a `storage` uniform and read with
 * `storageRead(buffer, index)` in shader code.
 *
 * WebGPU only. WebGL2 is GLSL ES 3.00, which has no shader storage buffers —
 * SSBOs arrived in ES 3.10 and WebGL2 never exposed them, so there is nothing to
 * fall back to.
 */
export interface BroMetalStorageBuffer {
  /** Replace the contents. The buffer is not resized — length must still fit. */
  write(data: Float32Array<ArrayBuffer>): void;
  dispose(): void;
}

export function createStorageBuffer(
  renderer: Renderer,
  data: Float32Array<ArrayBuffer>,
): BroMetalStorageBuffer {
  if (renderer.backend !== 'webgpu') {
    throw new Error('BroMetal: storage buffers are WebGPU-only — WebGL2 has no SSBOs');
  }
  return createWebgpuStorageBuffer(renderer, data);
}
