export interface TextureOptions {
  /** Flip the image vertically on upload so UV (0,0) is the bottom-left. Default true. */
  flipY?: boolean;
  wrap?: 'repeat' | 'clamp';
  /** 'smooth' = trilinear with mipmaps (default); 'nearest' = pixelated. */
  filter?: 'smooth' | 'nearest';
}

export interface BroMetalTexture {
  readonly glTexture: WebGLTexture;
  dispose(): void;
}

export function createTexture(
  gl: WebGL2RenderingContext,
  source: TexImageSource,
  options: TextureOptions = {},
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
  gl: WebGL2RenderingContext,
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
  return createTexture(gl, image, options);
}
