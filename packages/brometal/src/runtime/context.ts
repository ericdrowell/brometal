import { startLoop, type LoopHandle } from './loop.js';

export interface RendererOptions {
  clearColor?: readonly [number, number, number, number];
  antialias?: boolean;
}

export interface Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  loop(callback: (elapsedSeconds: number) => void): () => void;
  destroy(): void;
}

export function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions = {}): Renderer {
  const gl = canvas.getContext('webgl2', { antialias: options.antialias ?? true });
  if (gl === null) {
    throw new Error(
      'BroMetal: could not create a WebGL2 context. This browser/device does not support WebGL2, or the canvas already has a different context type.',
    );
  }
  gl.enable(gl.DEPTH_TEST);

  const clearColor = options.clearColor ?? ([0, 0, 0, 1] as const);
  const activeLoops = new Set<LoopHandle>();

  return {
    gl,
    canvas,
    loop(callback: (elapsedSeconds: number) => void): () => void {
      const handle = startLoop(gl, canvas, clearColor, callback);
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
