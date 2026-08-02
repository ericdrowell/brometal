import type { Renderer } from './context.js';
import type { BroMetalTexture } from './texture.js';
import { createWebgpuRenderTarget } from './webgpu.js';

export interface RenderTargetOptions {
  width: number;
  height: number;
  /**
   * Attach a depth buffer, so drawing into the target is depth-tested like
   * drawing to the screen. Off by default: a state or post-process pass writes
   * one value per texel from a single quad and has nothing to sort.
   *
   * A shadow map is the case that needs it. The map has to record the *nearest*
   * surface to the light, and without a depth test that is just whichever
   * triangle was submitted last.
   */
  depth?: boolean;
}

/**
 * An off-screen surface a program can draw into, and a texture any shader can
 * sample. This is what gives the GPU memory: a pass writes state into a target,
 * the next frame reads it back, and nothing round-trips through the CPU.
 *
 * Targets are RGBA16F and sampled unfiltered — they hold numbers, not pictures,
 * and interpolating between two particles' positions would be meaningless.
 *
 * One trap worth knowing: a fullscreen quad drawn into a target covers its rows
 * top-to-bottom, while NDC +y points at the first row — so a hand-rolled uv
 * reads a target's rows mirrored. `targetUv()` is the one place that flip
 * lives; use it rather than writing `clip.xy / clip.w * 0.5 + 0.5` yourself.
 */
export interface RenderTarget {
  readonly width: number;
  readonly height: number;
  /** Bind to a `sampler2D` uniform to read the target's contents. */
  readonly texture: BroMetalTexture;
  /** Whether drawing into this target is depth-tested. */
  readonly depth: boolean;
  dispose(): void;
}

export function createRenderTarget(renderer: Renderer, options: RenderTargetOptions): RenderTarget {
  return createWebgpuRenderTarget(
    renderer,
    Math.max(1, Math.floor(options.width)),
    Math.max(1, Math.floor(options.height)),
    options.depth ?? false,
  );
}
