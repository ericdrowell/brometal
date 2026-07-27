import { describe, expect, it, vi } from 'vitest';
import { createWebgl2RenderTarget } from '../src/runtime/render-target.js';

interface RecordedCall {
  method: string;
  args: unknown[];
}

const GL = {
  TEXTURE_2D: 0x0de1,
  RGBA: 0x1908,
  RGBA16F: 0x881a,
  HALF_FLOAT: 0x140b,
  NEAREST: 0x2600,
  CLAMP_TO_EDGE: 0x812f,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  FRAMEBUFFER: 0x8d40,
  COLOR_ATTACHMENT0: 0x8ce0,
  FRAMEBUFFER_COMPLETE: 0x8cd5,
  RENDERBUFFER: 0x8d41,
  DEPTH_ATTACHMENT: 0x8d00,
  DEPTH_COMPONENT24: 0x81a6,
};

function stubGl(options: { float?: boolean; status?: number } = {}): {
  gl: WebGL2RenderingContext;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const gl = {
    ...GL,
    getExtension: (name: string) =>
      options.float !== false && name === 'EXT_color_buffer_float' ? {} : null,
    createTexture: () => ({}) as WebGLTexture,
    createFramebuffer: () => ({}) as WebGLFramebuffer,
    createRenderbuffer: () => ({}) as WebGLRenderbuffer,
    bindRenderbuffer: record('bindRenderbuffer'),
    renderbufferStorage: record('renderbufferStorage'),
    framebufferRenderbuffer: record('framebufferRenderbuffer'),
    deleteRenderbuffer: record('deleteRenderbuffer'),
    bindTexture: record('bindTexture'),
    bindFramebuffer: record('bindFramebuffer'),
    texImage2D: record('texImage2D'),
    texParameteri: record('texParameteri'),
    framebufferTexture2D: record('framebufferTexture2D'),
    checkFramebufferStatus: () => options.status ?? GL.FRAMEBUFFER_COMPLETE,
    deleteTexture: record('deleteTexture'),
    deleteFramebuffer: record('deleteFramebuffer'),
  } as unknown as WebGL2RenderingContext;
  return { gl, calls };
}

describe('render targets', () => {
  it('allocates a half-float colour attachment', () => {
    const { gl, calls } = stubGl();
    const target = createWebgl2RenderTarget(gl, 64, 32);

    expect([target.width, target.height]).toEqual([64, 32]);
    const upload = calls.find((c) => c.method === 'texImage2D');
    expect(upload?.args).toEqual([GL.TEXTURE_2D, 0, GL.RGBA16F, 64, 32, 0, GL.RGBA, GL.HALF_FLOAT, null]);
    expect(calls.some((c) => c.method === 'framebufferTexture2D')).toBe(true);
  });

  it('samples unfiltered and clamped — the texels are numbers, not pixels', () => {
    const { gl, calls } = stubGl();
    createWebgl2RenderTarget(gl, 8, 8);
    const params = calls
      .filter((c) => c.method === 'texParameteri')
      .map((c) => [c.args[1], c.args[2]]);
    expect(params).toEqual([
      [GL.TEXTURE_MIN_FILTER, GL.NEAREST],
      [GL.TEXTURE_MAG_FILTER, GL.NEAREST],
      [GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE],
      [GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE],
    ]);
  });

  it('binds into a sampler2D uniform like any other texture', () => {
    const { gl } = stubGl();
    const target = createWebgl2RenderTarget(gl, 8, 8);
    // The uniform setter accepts anything carrying a glTexture handle.
    expect((target.texture as { glTexture?: WebGLTexture }).glTexture).toBeDefined();
  });

  it('explains itself when the device cannot render to float', () => {
    const { gl } = stubGl({ float: false });
    expect(() => createWebgl2RenderTarget(gl, 8, 8)).toThrow(/EXT_color_buffer_float/);
  });

  it('cleans up and reports an incomplete framebuffer', () => {
    const { gl, calls } = stubGl({ status: 0x8cd6 });
    expect(() => createWebgl2RenderTarget(gl, 8, 8)).toThrow(/incomplete/);
    expect(calls.some((c) => c.method === 'deleteTexture')).toBe(true);
    expect(calls.some((c) => c.method === 'deleteFramebuffer')).toBe(true);
  });

  it('leaves the default framebuffer bound after creation', () => {
    const { gl, calls } = stubGl();
    createWebgl2RenderTarget(gl, 8, 8);
    const binds = calls.filter((c) => c.method === 'bindFramebuffer');
    expect(binds.at(-1)?.args[1]).toBeNull();
  });

  it('has no depth attachment unless asked', () => {
    const { gl, calls } = stubGl();
    const target = createWebgl2RenderTarget(gl, 8, 8);
    expect(target.depth).toBe(false);
    expect(calls.some((c) => c.method === 'framebufferRenderbuffer')).toBe(false);
  });

  it('attaches a depth buffer on request, so a shadow pass can sort itself', () => {
    const { gl, calls } = stubGl();
    const target = createWebgl2RenderTarget(gl, 128, 128, true);

    expect(target.depth).toBe(true);
    const storage = calls.find((c) => c.method === 'renderbufferStorage');
    expect(storage?.args).toEqual([GL.RENDERBUFFER, GL.DEPTH_COMPONENT24, 128, 128]);
    const attach = calls.find((c) => c.method === 'framebufferRenderbuffer');
    expect(attach?.args[1]).toBe(GL.DEPTH_ATTACHMENT);
  });

  it('releases the depth buffer with the target', () => {
    const { gl, calls } = stubGl();
    createWebgl2RenderTarget(gl, 8, 8, true).dispose();
    expect(calls.some((c) => c.method === 'deleteRenderbuffer')).toBe(true);
  });

  it('does not dispose the shared texture handle from the sampler view', () => {
    const { gl, calls } = stubGl();
    const target = createWebgl2RenderTarget(gl, 8, 8);
    target.texture.dispose();
    expect(calls.some((c) => c.method === 'deleteTexture')).toBe(false);
    target.dispose();
    expect(calls.some((c) => c.method === 'deleteTexture')).toBe(true);
  });
});

describe('drawTo', () => {
  /** A canvas whose getContext hands back the stub, so the real renderer is under test. */
  async function realRenderer() {
    const { gl, calls } = stubGl();
    Object.assign(gl, {
      DEPTH_TEST: 0x0b71,
      COLOR_BUFFER_BIT: 0x4000,
      DEPTH_BUFFER_BIT: 0x0100,
      CULL_FACE: 0x0b44,
      BACK: 0x0405,
      drawingBufferWidth: 800,
      drawingBufferHeight: 600,
      viewport: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      clear: vi.fn(),
      clearColor: vi.fn(),
      cullFace: vi.fn(),
      depthMask: vi.fn(),
    });
    const canvas = { getContext: () => gl } as unknown as HTMLCanvasElement;
    const { createRenderer } = await import('../src/runtime/context.js');
    const renderer = await createRenderer(canvas, { backend: 'webgl2', clearColor: [0.1, 0.2, 0.3, 1] });
    return { renderer, gl: gl as WebGL2RenderingContext & { viewport: ReturnType<typeof vi.fn> }, calls };
  }

  it('points drawing at the target, then puts the screen back', async () => {
    const { renderer, gl, calls } = await realRenderer();
    const target = createWebgl2RenderTarget(gl, 16, 16);
    const seen: number[][] = [];

    renderer.drawTo(target, () => {
      // Inside the callback the viewport is the target's, not the canvas's.
      seen.push([...(gl.viewport as ReturnType<typeof vi.fn>).mock.calls.at(-1)!] as number[]);
    });

    expect(seen[0]).toEqual([0, 0, 16, 16]);
    expect(gl.viewport).toHaveBeenLastCalledWith(0, 0, 800, 600);
    const binds = calls.filter((c) => c.method === 'bindFramebuffer');
    expect(binds.at(-1)?.args[1]).toBeNull();
  });

  it('restores the screen even when the draw throws', async () => {
    const { renderer, gl, calls } = await realRenderer();
    const target = createWebgl2RenderTarget(gl, 16, 16);

    expect(() =>
      renderer.drawTo(target, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(gl.viewport).toHaveBeenLastCalledWith(0, 0, 800, 600);
    expect(calls.filter((c) => c.method === 'bindFramebuffer').at(-1)?.args[1]).toBeNull();
    // The renderer's own clear colour is restored, not left at the target's.
    expect(gl.clearColor).toHaveBeenLastCalledWith(0.1, 0.2, 0.3, 1);
  });

  it('depth-tests into a depth target and clears both buffers', async () => {
    const { renderer, gl } = await realRenderer();
    const target = createWebgl2RenderTarget(gl, 16, 16, true);
    const enabledInside: unknown[][] = [];

    renderer.drawTo(target, () => {
      enabledInside.push(...(gl.enable as ReturnType<typeof vi.fn>).mock.calls);
      expect(gl.clear).toHaveBeenLastCalledWith(0x4000 | 0x0100);
    });

    expect(enabledInside.some((args) => args[0] === 0x0b71)).toBe(true);
  });

  it('leaves depth testing off for a target without one', async () => {
    const { renderer, gl } = await realRenderer();
    const target = createWebgl2RenderTarget(gl, 16, 16);

    renderer.drawTo(target, () => {
      // A depth test against a buffer that is not there passes regardless, so
      // the only honest thing is to turn it off.
      expect(gl.disable).toHaveBeenLastCalledWith(0x0b71);
      expect(gl.clear).toHaveBeenLastCalledWith(0x4000);
    });
  });

  it('clears to the requested value, which a shadow map depends on', async () => {
    const { renderer, gl } = await realRenderer();
    const target = createWebgl2RenderTarget(gl, 16, 16, true);

    renderer.drawTo(
      target,
      () => {
        // Clearing a distance map to black would claim an occluder at the
        // light in every texel the geometry misses.
        expect(gl.clearColor).toHaveBeenLastCalledWith(1, 1, 1, 1);
      },
      { clear: [1, 1, 1, 1] },
    );

    expect(gl.clearColor).toHaveBeenLastCalledWith(0.1, 0.2, 0.3, 1);
  });

  it('rejects a target from the wrong backend', async () => {
    const { renderer } = await realRenderer();
    expect(() => renderer.drawTo({ width: 1, height: 1 } as never, () => {})).toThrow(
      /not created by the WebGL2 renderer/,
    );
  });
});
