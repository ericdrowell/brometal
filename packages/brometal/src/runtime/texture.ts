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
  return createWebgpuTexture3D(renderer, volume, options);
}

export function createTexture(
  renderer: Renderer,
  source: TexImageSource,
  options: TextureOptions = {},
): BroMetalTexture {
  return createWebgpuTexture(renderer, source, options);
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
  // ImageBitmap is the universally-supported WebGPU copy source.
  return createTexture(renderer, await createImageBitmap(image), options);
}
