import { describe, expect, it, vi } from 'vitest';
import { resizeToDisplaySize } from '../src/runtime/canvas.js';
import { startLoop } from '../src/runtime/loop.js';

/**
 * A canvas with no CSS size. Its layout box takes its size from the drawing
 * buffer — the feedback path that makes clientWidth unsafe as a source of
 * truth, and the reason CSS sizing is the contract.
 */
function unstyledCanvas(width = 800, height = 600): HTMLCanvasElement {
  let bufferWidth = width;
  let bufferHeight = height;
  return {
    style: {} as Record<string, string>,
    get width() {
      return bufferWidth;
    },
    set width(value: number) {
      bufferWidth = value;
    },
    get height() {
      return bufferHeight;
    },
    set height(value: number) {
      bufferHeight = value;
    },
    get clientWidth() {
      return bufferWidth;
    },
    get clientHeight() {
      return bufferHeight;
    },
  } as unknown as HTMLCanvasElement;
}

/** A canvas sized by a stylesheet — the layout box ignores the drawing buffer. */
function cssSizedCanvas(cssWidth: number, cssHeight: number): HTMLCanvasElement {
  return {
    width: 300,
    height: 150,
    clientWidth: cssWidth,
    clientHeight: cssHeight,
  } as unknown as HTMLCanvasElement;
}

describe('canvas sizing', () => {
  it('tracks a CSS-sized canvas at the device pixel ratio', () => {
    const canvas = cssSizedCanvas(400, 250);
    resizeToDisplaySize(canvas, 2);
    expect([canvas.width, canvas.height]).toEqual([800, 500]);
  });

  it('leaves a canvas with no CSS size alone on a HiDPI display', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const canvas = unstyledCanvas(800, 600);
    // A runaway would show up immediately, since each write feeds the next
    // read (800 → 1600 → 3200 …) once the buffer drives layout.
    resizeToDisplaySize(canvas, 2);
    resizeToDisplaySize(canvas, 2);
    resizeToDisplaySize(canvas, 2);

    expect([canvas.width, canvas.height]).toEqual([800, 600]);
    // Nothing is written into the author's DOM either.
    expect(canvas.style.width).toBeUndefined();
    expect(canvas.style.height).toBeUndefined();
    warn.mockRestore();
  });

  it('names the fix once, not once per frame', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const canvas = unstyledCanvas();
    resizeToDisplaySize(canvas, 2);
    resizeToDisplaySize(canvas, 2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/no CSS size/);
    warn.mockRestore();
  });

  it('ignores a zero layout read instead of collapsing the buffer', () => {
    const canvas = cssSizedCanvas(0, 0);
    canvas.width = 800;
    canvas.height = 600;
    resizeToDisplaySize(canvas, 1);
    expect([canvas.width, canvas.height]).toEqual([800, 600]);
  });

  it('keeps the loop rendering at full size through a zero layout read', () => {
    // Same shape as the stub above, but the second layout read comes back 0x0.
    let layoutRead = 0;
    let bufferWidth = 800;
    let bufferHeight = 600;
    const canvas = {
      get width() {
        return bufferWidth;
      },
      set width(value: number) {
        bufferWidth = value;
      },
      get height() {
        return bufferHeight;
      },
      set height(value: number) {
        bufferHeight = value;
      },
      style: {} as Record<string, string>,
      get clientWidth() {
        return layoutRead === 1 ? 0 : bufferWidth;
      },
      get clientHeight() {
        const height = layoutRead === 1 ? 0 : bufferHeight;
        layoutRead++;
        return height;
      },
    } as unknown as HTMLCanvasElement;

    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

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
      // The loop re-enables depth writes before clearing, since a blended
      // program leaves the mask off and glClear honours it.
      depthMask: vi.fn(),
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
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
