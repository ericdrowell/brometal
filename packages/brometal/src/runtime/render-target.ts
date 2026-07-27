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
 * One cross-backend trap: texture V runs opposite ways. A fullscreen quad drawn
 * into a target covers its rows bottom-to-top on WebGL2 and top-to-bottom on
 * WebGPU, while `texture(t, vec2(u, v))` reads the same v from opposite ends. A
 * layout that splits state across rows therefore reads back transposed on one
 * backend. Split along U instead, which agrees on both.
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

/** WebGL2-backed target internals (not part of the public API). */
export interface Webgl2TargetInternals {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  depthBuffer: WebGLRenderbuffer | null;
}

export function createRenderTarget(
  renderer: Renderer,
  options: RenderTargetOptions,
): RenderTarget {
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const depth = options.depth ?? false;
  if (renderer.backend === 'webgpu') {
    return createWebgpuRenderTarget(renderer, width, height, depth);
  }
  const gl = renderer.gl;
  if (gl === undefined) {
    throw new Error('BroMetal: renderer has no WebGL2 context');
  }
  return createWebgl2RenderTarget(gl, width, height, depth);
}

export function createWebgl2RenderTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  depth = false,
): RenderTarget {
  // Rendering *into* a float texture is an extension even in WebGL2; sampling
  // one is not. Without it there is nowhere to keep GPU state.
  if (gl.getExtension('EXT_color_buffer_float') === null) {
    throw new Error(
      'BroMetal: render targets need the EXT_color_buffer_float extension, which this device does not expose',
    );
  }

  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (texture === null || framebuffer === null) {
    throw new Error('BroMetal: failed to create a render target');
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Half float to match the WebGPU path, where full float is unfilterable and
  // so cannot share the sampler binding layout used by ordinary textures.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  // A renderbuffer rather than a texture: the depth is only needed to sort the
  // pass's own triangles, never sampled. What a shadow map reads back is the
  // colour attachment, which holds a distance the shader chose to write.
  let depthBuffer: WebGLRenderbuffer | null = null;
  if (depth) {
    depthBuffer = gl.createRenderbuffer();
    if (depthBuffer === null) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw new Error('BroMetal: failed to create a depth buffer for the render target');
    }
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    if (depthBuffer !== null) gl.deleteRenderbuffer(depthBuffer);
    throw new Error(`BroMetal: render target is incomplete (framebuffer status 0x${status.toString(16)})`);
  }

  const internals: Webgl2TargetInternals = { framebuffer, texture, depthBuffer };
  const target: RenderTarget & { __gl?: Webgl2TargetInternals } = {
    width,
    height,
    depth,
    texture: {
      glTexture: texture,
      dispose(): void {
        // The target owns the texture; disposing it here would surprise.
      },
    },
    dispose(): void {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      if (depthBuffer !== null) gl.deleteRenderbuffer(depthBuffer);
    },
  };
  target.__gl = internals;
  return target;
}
