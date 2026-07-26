import { describe, expect, it } from 'vitest';
import { createTexture } from '../src/runtime/texture.js';
import type { Renderer } from '../src/runtime/context.js';

const ANISO_EXT = {
  TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe,
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff,
};

interface RecordedCall {
  method: string;
  args: unknown[];
}

/** A WebGL2 stub that records parameter calls and reports an 8x anisotropy cap. */
function stubRenderer(supportsAniso = true): { renderer: Renderer; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const gl = {
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    REPEAT: 0x2901,
    CLAMP_TO_EDGE: 0x812f,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    createTexture: () => ({}) as WebGLTexture,
    bindTexture: record('bindTexture'),
    pixelStorei: record('pixelStorei'),
    texImage2D: record('texImage2D'),
    texParameteri: record('texParameteri'),
    texParameterf: record('texParameterf'),
    generateMipmap: record('generateMipmap'),
    deleteTexture: record('deleteTexture'),
    getExtension: (name: string) =>
      supportsAniso && name === 'EXT_texture_filter_anisotropic' ? ANISO_EXT : null,
    getParameter: (token: number) => (token === ANISO_EXT.MAX_TEXTURE_MAX_ANISOTROPY_EXT ? 8 : 0),
  } as unknown as WebGL2RenderingContext;
  return { renderer: { backend: 'webgl2', gl } as Renderer, calls };
}

const SOURCE = { width: 4, height: 4 } as unknown as TexImageSource;

describe('texture anisotropy', () => {
  it('clamps the request to what the GPU reports', () => {
    const { renderer, calls } = stubRenderer();
    createTexture(renderer, SOURCE, { anisotropy: 16 });
    const aniso = calls.find((c) => c.method === 'texParameterf');
    expect(aniso?.args).toEqual([0x0de1, ANISO_EXT.TEXTURE_MAX_ANISOTROPY_EXT, 8]);
  });

  it('stays off unless asked for', () => {
    const { renderer, calls } = stubRenderer();
    createTexture(renderer, SOURCE, {});
    expect(calls.some((c) => c.method === 'texParameterf')).toBe(false);
  });

  it('degrades quietly when the extension is missing', () => {
    const { renderer, calls } = stubRenderer(false);
    createTexture(renderer, SOURCE, { anisotropy: 16 });
    expect(calls.some((c) => c.method === 'texParameterf')).toBe(false);
    expect(calls.some((c) => c.method === 'generateMipmap')).toBe(true);
  });

  it('skips mipmaps and anisotropy for nearest filtering', () => {
    const { renderer, calls } = stubRenderer();
    createTexture(renderer, SOURCE, { filter: 'nearest', anisotropy: 16 });
    expect(calls.some((c) => c.method === 'generateMipmap')).toBe(false);
    expect(calls.some((c) => c.method === 'texParameterf')).toBe(false);
  });
});
