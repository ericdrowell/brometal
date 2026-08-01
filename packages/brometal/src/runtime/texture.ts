import type { Renderer } from './context.js';
import { createWebgpuTexture, createWebgpuTexture3D } from './webgpu.js';

export interface TextureOptions {
  /** Flip the image vertically on upload so UV (0,0) is the bottom-left. Default true. */
  flipY?: boolean;
  wrap?: 'repeat' | 'clamp';
  /** 'smooth' = trilinear with mipmaps (default); 'nearest' = pixelated. */
  filter?: 'smooth' | 'nearest';
  /**
   * Anisotropic filtering samples, 1–16. Ground planes and walls seen at a
   * grazing angle are what this fixes: trilinear picks one mip for the whole
   * pixel footprint, so a surface stretching to the horizon is simultaneously
   * over-blurred across and aliased along. Clamped to what the GPU supports;
   * ignored with `filter: 'nearest'`. Default 1 (off).
   */
  anisotropy?: number;
}

export interface BroMetalTexture {
  /** Present on WebGL2-backed textures. */
  readonly glTexture?: WebGLTexture;
  /**
   * WebGL2 bind target. Absent means TEXTURE_2D; a volume carries TEXTURE_3D.
   * Binding a 3D texture to the 2D target silently reads nothing, so the target
   * has to travel with the texture rather than being assumed at the call site.
   */
  readonly glTarget?: number;
  dispose(): void;
}

/**
 * Tightly packed RGBA8 volume data, slice after slice.
 *
 * The buffer is pinned to ArrayBuffer rather than left as ArrayBufferLike:
 * WebGPU's upload path will not accept a SharedArrayBuffer view, and the wider
 * type makes that a call-site error instead of a compile-time one.
 */
export interface VolumeSource {
  width: number;
  height: number;
  depth: number;
  data: Uint8Array<ArrayBuffer>;
}

/**
 * A 3D texture, for fields that vary through space rather than across a
 * surface — cloud density, precomputed scattering, flow volumes.
 */
export function createTexture3D(
  renderer: Renderer,
  volume: VolumeSource,
  options: TextureOptions = {},
): BroMetalTexture {
  const expected = volume.width * volume.height * volume.depth * 4;
  if (volume.data.length !== expected) {
    throw new Error(
      `BroMetal: volume data is ${volume.data.length} bytes but ${volume.width}x${volume.height}x${volume.depth} RGBA needs ${expected}`,
    );
  }
  if (renderer.backend === 'webgpu') {
    return createWebgpuTexture3D(renderer, volume, options);
  }
  const gl = renderer.gl;
  if (gl === undefined) {
    throw new Error('BroMetal: renderer has no WebGL2 context');
  }
  const glTexture = gl.createTexture();
  if (glTexture === null) {
    throw new Error('BroMetal: failed to create a 3D texture');
  }
  gl.bindTexture(gl.TEXTURE_3D, glTexture);
  gl.texImage3D(
    gl.TEXTURE_3D,
    0,
    gl.RGBA,
    volume.width,
    volume.height,
    volume.depth,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    volume.data,
  );
  const wrap = options.wrap === 'clamp' ? gl.CLAMP_TO_EDGE : gl.REPEAT;
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, wrap);
  const filter = options.filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
  gl.bindTexture(gl.TEXTURE_3D, null);

  return {
    glTexture,
    glTarget: gl.TEXTURE_3D,
    dispose(): void {
      gl.deleteTexture(glTexture);
    },
  };
}

export function createTexture(
  renderer: Renderer,
  source: TexImageSource,
  options: TextureOptions = {},
): BroMetalTexture {
  if (renderer.backend === 'webgpu') {
    return createWebgpuTexture(renderer, source, options);
  }
  const gl = renderer.gl;
  if (gl === undefined) {
    throw new Error('BroMetal: renderer has no WebGL2 context');
  }
  return createWebgl2Texture(gl, source, options);
}

function createWebgl2Texture(
  gl: WebGL2RenderingContext,
  source: TexImageSource,
  options: TextureOptions,
): BroMetalTexture {
  const glTexture = gl.createTexture();
  if (glTexture === null) {
    throw new Error('BroMetal: failed to create a texture');
  }
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, options.flipY ?? true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  const wrap = options.wrap === 'clamp' ? gl.CLAMP_TO_EDGE : gl.REPEAT;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);

  if (options.filter === 'nearest') {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  } else {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const requested = Math.floor(options.anisotropy ?? 1);
    if (requested > 1) {
      const ext = gl.getExtension('EXT_texture_filter_anisotropic');
      if (ext !== null) {
        const limit = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
        gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(requested, limit));
      }
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, null);

  return {
    glTexture,
    dispose(): void {
      gl.deleteTexture(glTexture);
    },
  };
}

export async function loadTexture(
  renderer: Renderer,
  url: string,
  options: TextureOptions = {},
): Promise<BroMetalTexture> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  try {
    await image.decode();
  } catch {
    throw new Error(`BroMetal: failed to load texture '${url}'`);
  }
  if (renderer.backend === 'webgpu') {
    // ImageBitmap is the universally-supported WebGPU copy source.
    const bitmap = await createImageBitmap(image);
    return createTexture(renderer, bitmap, options);
  }
  return createTexture(renderer, image, options);
}
