import { afterEach, describe, expect, it, vi } from 'vitest';
import { startLoop } from '../src/runtime/loop.js';

interface RecordedCall {
  method: string;
  args: unknown[];
}

function stubGl(): { gl: WebGL2RenderingContext; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const gl = {
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x100,
    drawingBufferWidth: 320,
    drawingBufferHeight: 240,
    clear: record('clear'),
    viewport: record('viewport'),
    depthMask: record('depthMask'),
  } as unknown as WebGL2RenderingContext;
  return { gl, calls };
}

function stubCanvas(): HTMLCanvasElement {
  return { clientWidth: 320, clientHeight: 240, width: 320, height: 240 } as HTMLCanvasElement;
}

/** Runs the frame callbacks rAF has queued, count times. */
function runFrames(frames: (() => void)[], count: number): void {
  for (let i = 0; i < count; i++) {
    const pending = frames.splice(0, frames.length);
    for (const frame of pending) frame();
  }
}

describe('render loop', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('re-enables depth writes before clearing', () => {
    const frames: (() => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      frames.push(() => cb(0));
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('window', { devicePixelRatio: 1 });

    const { gl, calls } = stubGl();
    // A blended program leaves depth writes off; glClear honours the write
    // mask, so without the reset the depth clear would be a silent no-op.
    const handle = startLoop(gl, stubCanvas(), () => gl.depthMask(false));
    runFrames(frames, 2);
    handle.stop();

    const relevant = calls.filter((c) => c.method === 'depthMask' || c.method === 'clear');
    expect(relevant.map((c) => `${c.method}(${String(c.args[0])})`)).toEqual([
      'depthMask(true)',
      'clear(16640)',
      'depthMask(false)',
      'depthMask(true)',
      'clear(16640)',
      'depthMask(false)',
    ]);
  });
});
