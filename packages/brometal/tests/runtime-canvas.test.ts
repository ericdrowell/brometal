import { describe, expect, it, vi } from 'vitest';
import { resizeToDisplaySize } from '../src/runtime/canvas.js';
import { startLoop } from '../src/runtime/loop.js';

describe('runtime canvas sizing', () => {
  it('keeps an attribute-sized canvas rendering at 800x600 after one zero layout read', () => {
    let layoutRead = 0;
    const canvas = {
      width: 800,
      height: 600,
      get clientWidth() {
        return layoutRead === 1 ? 0 : this.width;
      },
      get clientHeight() {
        const height = layoutRead === 1 ? 0 : this.height;
        layoutRead++;
        return height;
      },
    } as HTMLCanvasElement;

    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('window', { devicePixelRatio: 1 });

    const gl = {
      COLOR_BUFFER_BIT: 0x4000,
      DEPTH_BUFFER_BIT: 0x0100,
      get drawingBufferWidth() {
        return canvas.width;
      },
      get drawingBufferHeight() {
        return canvas.height;
      },
      viewport: vi.fn(),
      clear: vi.fn(),
    } as unknown as WebGL2RenderingContext;

    const elapsed: number[] = [];
    const renderedBuffers: number[][] = [];
    const loop = startLoop(gl, canvas, (elapsedSeconds) => {
      elapsed.push(elapsedSeconds);
      renderedBuffers.push([gl.drawingBufferWidth, gl.drawingBufferHeight]);
    });

    try {
      for (const timestamp of [0, 6, 12]) {
        const frame = frames.shift();
        expect(frame).toBeDefined();
        frame!(timestamp);
      }

      // The loop remains healthy at roughly 166 fps. The second frame sees a
      // transient 0x0 client size, but the drawing buffer never blinks to 1x1.
      expect(elapsed[1]! - elapsed[0]!).toBeCloseTo(0.006);
      expect(elapsed[2]! - elapsed[1]!).toBeCloseTo(0.006);
      expect(gl.clear).toHaveBeenCalledTimes(3);
      expect(renderedBuffers).toEqual([
        [800, 600],
        [800, 600],
        [800, 600],
      ]);
    } finally {
      loop.stop();
      vi.unstubAllGlobals();
    }
  });

  it('resizes from positive CSS dimensions using the device pixel ratio', () => {
    const canvas = {
      width: 300,
      height: 150,
      clientWidth: 400,
      clientHeight: 250,
    } as HTMLCanvasElement;

    resizeToDisplaySize(canvas, 2);

    expect([canvas.width, canvas.height]).toEqual([800, 500]);
  });
});
