import { startLoop, type LoopHandle } from './loop.js';

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
}

export interface Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  loop(callback: (elapsedSeconds: number) => void): () => void;
  destroy(): void;
}

export function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions = {}): Renderer {
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
    gl,
    canvas,
    loop(callback: (elapsedSeconds: number) => void): () => void {
      const handle = startLoop(gl, canvas, callback);
      activeLoops.add(handle);
      return () => {
        handle.stop();
        activeLoops.delete(handle);
      };
    },
    destroy(): void {
      for (const handle of activeLoops) {
        handle.stop();
      }
      activeLoops.clear();
    },
  };
}
