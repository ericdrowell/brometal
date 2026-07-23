import type { Renderer } from './context.js';
import { createWebgpuTexture } from './webgpu.js';

export interface TextureOptions {
  /** Flip the image vertically on upload so UV (0,0) is the bottom-left. Default true. */
  flipY?: boolean;
  wrap?: 'repeat' | 'clamp';
  /** 'smooth' = trilinear with mipmaps (default); 'nearest' = pixelated. */
  filter?: 'smooth' | 'nearest';
}

export interface BroMetalTexture {
  /** Present on WebGL2-backed textures. */
  readonly glTexture?: WebGLTexture;
  dispose(): void;
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
