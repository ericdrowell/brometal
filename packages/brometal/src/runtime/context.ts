import { startLoop, type LoopHandle } from './loop.js';

export type RendererBackend = 'webgl2' | 'webgpu';

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
  powerPreference?: WebGLPowerPreference;
  /**
   * 'auto' (default) uses WebGPU when the browser provides a working adapter
   * and falls back to WebGL2 otherwise. Force a backend to pin it.
   */
  backend?: 'auto' | RendererBackend;
}

import type { RenderTarget, Webgl2TargetInternals } from './render-target.js';

export interface Renderer {
  readonly backend: RendererBackend;
  readonly canvas: HTMLCanvasElement;
  /** Drawing-buffer aspect ratio, for building projection matrices. */
  readonly aspect: number;
  /** The underlying context — WebGL2 backend only. */
  readonly gl?: WebGL2RenderingContext;
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
  const backend = options.backend ?? 'auto';
  if (backend === 'webgl2') {
    return createWebgl2Renderer(canvas, options);
  }
  const { createWebgpuRenderer } = await import('./webgpu.js');
  if (backend === 'webgpu') {
    return createWebgpuRenderer(canvas, options);
  }
  try {
    return await createWebgpuRenderer(canvas, options);
  } catch {
    return createWebgl2Renderer(canvas, options);
  }
}

function createWebgl2Renderer(canvas: HTMLCanvasElement, options: RendererOptions): Renderer {
  const gl = canvas.getContext('webgl2', {
    antialias: options.antialias ?? true,
    powerPreference: options.powerPreference ?? 'high-performance',
  });
  if (gl === null) {
    throw new Error(
      'BroMetal: could not create a WebGL2 context. This browser/device does not support WebGL2, or the canvas already has a different context type.',
    );
  }
  gl.enable(gl.DEPTH_TEST);
  if (options.cull === 'back') {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  const clearColor = options.clearColor ?? ([0, 0, 0, 1] as const);
  gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);

  const activeLoops = new Set<LoopHandle>();

  return {
    backend: 'webgl2',
    gl,
    canvas,
    get aspect(): number {
      return gl.drawingBufferWidth / Math.max(gl.drawingBufferHeight, 1);
    },
    loop(callback: (elapsedSeconds: number) => void): () => void {
      const handle = startLoop(gl, canvas, callback);
      activeLoops.add(handle);
      return () => {
        handle.stop();
        activeLoops.delete(handle);
      };
    },
    drawTo(target: RenderTarget, draw: () => void, options: DrawToOptions = {}): void {
      const internals = (target as RenderTarget & { __gl?: Webgl2TargetInternals }).__gl;
      if (internals === undefined) {
        throw new Error('BroMetal: this render target was not created by the WebGL2 renderer');
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, internals.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      // Without a depth attachment a depth test would pass regardless, so it is
      // turned off rather than left to read as meaningful.
      if (target.depth) {
        gl.enable(gl.DEPTH_TEST);
      } else {
        gl.disable(gl.DEPTH_TEST);
      }
      const [cr, cg, cb, ca] = options.clear ?? [0, 0, 0, 0];
      gl.clearColor(cr, cg, cb, ca);
      // glClear honours the depth write mask, which a blended program leaves
      // off — see the same guard in the frame loop.
      gl.depthMask(true);
      gl.clear(target.depth ? gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT : gl.COLOR_BUFFER_BIT);
      try {
        draw();
      } finally {
        gl.enable(gl.DEPTH_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        const [r, g, b, a] = clearColor;
        gl.clearColor(r, g, b, a);
      }
    },
    destroy(): void {
      for (const handle of activeLoops) {
        handle.stop();
      }
      activeLoops.clear();
    },
  };
}
