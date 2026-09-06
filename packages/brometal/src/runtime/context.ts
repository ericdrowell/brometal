/// <reference types="@webgpu/types" />
import type { RenderTarget } from './render-target.js';
import { BroMetalError, type ErrorHandler } from './errors.js';

/**
 * BroMetal targets WebGPU only. The type stays a union of one so
 * `renderer.backend` remains readable and printable, and so adding a backend
 * later is a type change rather than an API change.
 */
export type RendererBackend = 'webgpu';

export interface RendererOptions {
  clearColor?: readonly [number, number, number, number];
  antialias?: boolean;
  /**
   * Back-face culling skips rasterizing triangles that face away from the
   * camera — roughly halves fragment work for closed meshes. Off by default
   * because it breaks open or double-sided geometry.
   */
  cull?: 'back' | 'none';
  /** GPU selection hint on dual-GPU machines. Defaults to 'high-performance'. */
  powerPreference?: GPUPowerPreference;
  /**
   * Called when the GPU fails *after* the renderer exists — a lost device, or a
   * pipeline that failed validation.
   *
   * Worth wiring even if you do nothing but log. These failures are invisible
   * otherwise: WebGPU reports them asynchronously, so an invalid pipeline draws
   * nothing and a lost device stops producing frames, both without an exception
   * anywhere. Without a handler the runtime warns to the console once, which is
   * a diagnostic of last resort rather than a feature.
   */
  onError?: ErrorHandler;
}

export interface Renderer {
  readonly backend: RendererBackend;
  readonly canvas: HTMLCanvasElement;
  /** Drawing-buffer aspect ratio, for building projection matrices. */
  readonly aspect: number;
  /**
   * Draw exactly one frame, now.
   *
   * `loop` owns `requestAnimationFrame`, which a host that already has its own
   * frame loop cannot give up, and a capture needs one frame on demand rather
   * than a stream of them. `present` is `loop`'s body without the scheduling —
   * resize, begin the pass, run the callback, submit.
   */
  present(callback: () => void): void;
  loop(callback: (elapsedSeconds: number) => void): () => void;
  /**
   * Runs `draw` with every `program.draw()` writing into `target` instead of
   * the screen. This is how state stays on the GPU across frames: a pass writes
   * into a target, and the next frame samples it.
   */
  drawTo(target: RenderTarget, draw: () => void, options?: DrawToOptions): void;
  destroy(): void;
}

export interface DrawToOptions {
  /**
   * What to clear the target to. Defaults to transparent black.
   *
   * Worth setting whenever zero is a meaningful value in the target rather than
   * an empty one. A shadow map holding distance-to-light is the example: clear
   * it to black and every texel the geometry misses claims an occluder sitting
   * at the light itself, putting the whole scene in shadow.
   */
  clear?: readonly [number, number, number, number];
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  options: RendererOptions = {},
): Promise<Renderer> {
  if (typeof navigator === 'undefined' || navigator.gpu === undefined) {
    throw new BroMetalError(
      'webgpu-unavailable',
      'BroMetal: this browser does not support WebGPU. BroMetal requires it — shaders are compiled to WGSL and compute passes have no WebGL equivalent. Chrome, Edge and Safari 26+ ship it; Firefox needs 141+.',
    );
  }
  const { createWebgpuRenderer } = await import('./webgpu.js');
  return createWebgpuRenderer(canvas, options);
}
