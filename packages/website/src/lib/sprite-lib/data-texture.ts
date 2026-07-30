/**
 * Authored data uploaded as a texture, so a shader can read it instead of the
 * CPU baking the answer into instance attributes every frame.
 *
 * This is the piece that lets a tilemap become a *static* scene: upload one
 * instance per grid cell once, put the per-cell payload (which tile, which
 * layer, how lit) in a texture, and let the vertex shader look up its own cell.
 * `program.draw({ instanceCount })` then draws the whole map with zero per-frame
 * bytes.
 *
 * ## Why 8-bit
 *
 * BroMetal's `createTexture` takes a `TexImageSource`, and `ImageData` is one —
 * so RGBA8 data textures need no library change. There is no float upload path
 * (see "Gap 7" in docs/sprite-rendering.md), which costs us precision but not
 * capability: a tile index fits exactly in a byte, and so does a quantised
 * distance. Pack accordingly and decode with `byteOf` below.
 *
 * ## flipY must be false
 *
 * Both backends put source row 0 at v=0 when `flipY: false` (WebGL2 via
 * `UNPACK_FLIP_Y_WEBGL`, WebGPU via `copyExternalImageToTexture`), so row
 * indices survive the upload unchanged and agree across backends. The V-direction
 * disagreement BroMetal warns about is specific to *render targets*, where a
 * fullscreen quad's rasterization order differs — not to uploaded images.
 *
 * Leaving `flipY` at its default of `true` would silently mirror the map
 * vertically, which for a tilemap reads as a level-generator bug rather than an
 * upload bug.
 */
import { createTexture, type BroMetalTexture, type Renderer } from 'brometal';

export interface DataTexture {
  texture: BroMetalTexture;
  width: number;
  height: number;
  /** `vec2(width, height)`, for the shader's `uMapSize` uniform. */
  size: Float32Array;
}

/**
 * One cell's payload. Values are 0..255 and land in the shader as 0..1 — recover
 * the byte with `floor(channel * 255 + 0.5)`.
 */
export interface DataCell {
  r?: number;
  g?: number;
  b?: number;
  a?: number;
}

/**
 * Builds an RGBA8 texture `width` x `height` from a callback per cell.
 *
 * Nearest filtering and clamped wrapping are not stylistic here: linear
 * filtering would interpolate *between* two cells' payloads and hand the shader
 * a tile index that does not exist, and repeat wrapping would fold the map's far
 * edge onto its near one.
 */
export function createDataTexture(
  renderer: Renderer,
  width: number,
  height: number,
  fill: (x: number, y: number) => DataCell,
): DataTexture {
  const bytes = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = fill(x, y);
      const at = (y * width + x) * 4;
      bytes[at] = cell.r ?? 0;
      bytes[at + 1] = cell.g ?? 0;
      bytes[at + 2] = cell.b ?? 0;
      bytes[at + 3] = cell.a ?? 0;
    }
  }
  const texture = createTexture(renderer, new ImageData(bytes, width, height), {
    filter: 'nearest',
    wrap: 'clamp',
    flipY: false,
  });
  return { texture, width, height, size: new Float32Array([width, height]) };
}

/**
 * Quantises a distance in world units to a byte, saturating at `range`.
 * 0 means "at the source", 255 means "at or beyond `range`".
 *
 * Used to bake per-cell distances to a light once, at load, so the shader can
 * apply falloff and flicker per frame without ever being told where the lights
 * are.
 */
export function quantizeDistance(distance: number, range: number): number {
  return Math.round(Math.min(distance / range, 1) * 255);
}
