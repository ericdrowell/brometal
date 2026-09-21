import type { Renderer } from './context.js';
import { createWebgpuStorageBuffer } from './webgpu.js';

/**
 * A read-only storage buffer, bound to a `storage` uniform and read with
 * `storageRead(buffer, index)` in shader code.
 *
 *
 * Written by a compute stage and read by any stage, so state can live on the
 * GPU across frames without a render target's texel-grid shape.
 */
export interface BroMetalStorageBuffer {
  /** Replace the contents. The buffer is not resized — length must still fit. */
  write(data: StorageBufferData): void;
  dispose(): void;
}

export type StorageBufferData =
  | Float32Array<ArrayBuffer>
  | Uint32Array<ArrayBuffer>
  | Int32Array<ArrayBuffer>;

export function createStorageBuffer(
  renderer: Renderer,
  data: StorageBufferData,
): BroMetalStorageBuffer {
  return createWebgpuStorageBuffer(renderer, data);
}
