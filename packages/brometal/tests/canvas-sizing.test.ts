import { describe, expect, it, vi } from 'vitest';
import { resizeToDisplaySize } from '../src/runtime/canvas.js';

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

});
