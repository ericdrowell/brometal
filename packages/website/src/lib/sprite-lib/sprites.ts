/**
 * A minimal sprite layer over BroMetal — the shape a 2D/2.5D game framework
 * would build on top of the library.
 *
 * Three pieces:
 *  - `spriteAtlas` turns a tile index into the `vec4` UV rect the shader wants.
 *  - `SpriteBatch` is an over-allocated instance pool: `push()` per sprite, then
 *    upload the four arrays and `draw({ instanceCount: batch.count })`. Capacity
 *    only grows, so a batch that grows and shrinks never reallocates.
 *  - `billboardBasis` derives the camera-facing (or Y-locked) quad axes from a
 *    camera's view matrix.
 *
 * `SpriteBatch.sort` is what the cut-out path exists to delete: cut-out sprites
 * write depth, so the GPU orders them and the CPU never touches the array. It is
 * kept because the blended demo needs it to be correct at all — that contrast is
 * the point of the pair.
 *
 * One caveat worth knowing: give each batch its own program. Several uploads into
 * one program per frame works, but only because the WebGPU backend appends each
 * one at a fresh buffer offset; separate programs make the intent obvious and
 * keep the buffers independent.
 */
import { mat4, type BroMetalTexture, type Mat4Array } from 'brometal';

export interface SpriteAtlas {
  texture: BroMetalTexture;
  /** Columns and rows of tiles in the image. */
  cols: number;
  rows: number;
  /** Writes the UV rect (u0, v0, du, dv) of `tile` into `out` at `offset`. */
  rect(tile: number, out: Float32Array, offset: number): void;
  /** Aspect ratio of one tile (width / height), for sizing quads. */
  tileAspect: number;
}

export interface AtlasOptions {
  cols: number;
  rows: number;
  /**
   * Tile pixel dimensions. Used for `tileAspect` and, more importantly, to
   * inset each tile's UV rect by exactly half a texel.
   *
   * Kenney's `_packed` atlases have no padding between tiles, so a UV rect that
   * runs edge to edge lands exactly on the boundary between two texels and the
   * sampler may round either way — picking up the neighbouring tile along the
   * seam. Half a texel is the standard remedy: it keeps every sample inside the
   * intended tile without visibly cropping it.
   */
  tileWidth?: number;
  tileHeight?: number;
  /** Override the inset, in texels. Default 0.5. */
  insetTexels?: number;
}

/**
 * V is flipped because `loadTexture` defaults to `flipY: true`: row 0 of the
 * image is at the TOP, but UV 0 is at the BOTTOM of the uploaded texture.
 */
export function spriteAtlas(texture: BroMetalTexture, options: AtlasOptions): SpriteAtlas {
  const { cols, rows } = options;
  const tileWidth = options.tileWidth ?? 16;
  const tileHeight = options.tileHeight ?? 16;
  const texels = options.insetTexels ?? 0.5;
  const du = 1 / cols;
  const dv = 1 / rows;
  // Half a texel expressed in UV space: one texel is 1/(cols*tileWidth) wide.
  const insetU = texels / (cols * tileWidth);
  const insetV = texels / (rows * tileHeight);
  return {
    texture,
    cols,
    rows,
    tileAspect: tileWidth / tileHeight,
    rect(tile: number, out: Float32Array, offset: number): void {
      const col = tile % cols;
      const row = Math.floor(tile / cols);
      out[offset] = col * du + insetU;
      out[offset + 1] = 1 - (row + 1) * dv + insetV;
      out[offset + 2] = du - insetU * 2;
      out[offset + 3] = dv - insetV * 2;
    },
  };
}

/** One sprite as pushed by a caller. Depth is only read when sorting. */
export interface SpriteInput {
  x: number;
  y: number;
  z?: number;
  width: number;
  height: number;
  tile: number;
  /** rgb multiplier, default white. */
  tint?: readonly [number, number, number];
  alpha?: number;
  /** Mirrors the sprite horizontally — a walk cycle facing left. */
  flipX?: boolean;
}

/**
 * Instance-array pool for one sprite shader.
 *
 * Two things here exist to keep the upload honest, and both were originally
 * missing:
 *
 * - `live()` returns views over the **live prefix only**. `set()` hands the
 *   driver whatever array it is given, so passing the backing store uploads the
 *   whole capacity — a batch allocated at 4096 uploaded 208 KiB per frame to draw
 *   800 sprites. Subarray views cost nothing and upload what is actually there.
 * - `dirty` tracks whether the content changed at all. Static content — a
 *   tilemap, a scenery set — should upload exactly once, and the only way to know
 *   that is to track it.
 */
export class SpriteBatch {
  centers: Float32Array;
  sizes: Float32Array;
  uvRects: Float32Array;
  tints: Float32Array;
  count = 0;
  /** True when the contents changed since the last `markUploaded()`. */
  dirty = true;

  private capacity: number;
  private readonly atlas: SpriteAtlas;
  /** Parallel scratch used only when sorting; avoids touching the GPU arrays. */
  private order: number[] = [];
  private depths: number[] = [];

  constructor(atlas: SpriteAtlas, capacity = 256) {
    this.atlas = atlas;
    this.capacity = capacity;
    this.centers = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity * 2);
    this.uvRects = new Float32Array(capacity * 4);
    this.tints = new Float32Array(capacity * 4);
  }

  clear(): void {
    this.count = 0;
    this.dirty = true;
  }

  push(sprite: SpriteInput): void {
    if (this.count === this.capacity) {
      this.grow();
    }
    this.dirty = true;
    const i = this.count++;
    this.centers[i * 3] = sprite.x;
    this.centers[i * 3 + 1] = sprite.y;
    this.centers[i * 3 + 2] = sprite.z ?? 0;
    // A negative width mirrors the quad, which is how flipX costs nothing:
    // the vertex shader multiplies the unit quad by this.
    this.sizes[i * 2] = sprite.flipX === true ? -sprite.width : sprite.width;
    this.sizes[i * 2 + 1] = sprite.height;
    this.atlas.rect(sprite.tile, this.uvRects, i * 4);
    const [r, g, b] = sprite.tint ?? WHITE;
    this.tints[i * 4] = r;
    this.tints[i * 4 + 1] = g;
    this.tints[i * 4 + 2] = b;
    this.tints[i * 4 + 3] = sprite.alpha ?? 1;
  }

  /**
   * Reorders the live prefix far-to-near. Returns the number of sprites
   * reordered so a demo can report the cost the cut-out path avoids.
   */
  sort(viewDepth: (x: number, y: number, z: number) => number): number {
    const n = this.count;
    if (n < 2) return n;
    const order = this.order;
    const depths = this.depths;
    order.length = n;
    depths.length = n;
    for (let i = 0; i < n; i++) {
      order[i] = i;
      depths[i] = viewDepth(this.centers[i * 3]!, this.centers[i * 3 + 1]!, this.centers[i * 3 + 2]!);
    }
    order.sort((a, b) => depths[b]! - depths[a]!);
    this.dirty = true;
    permute(this.centers, order, 3);
    permute(this.sizes, order, 2);
    permute(this.uvRects, order, 4);
    permute(this.tints, order, 4);
    return n;
  }

  /**
   * Views over just the live prefix — what should actually be uploaded. These
   * are views, not copies: no allocation, and they track the backing store until
   * the next `grow()`.
   */
  live(): { centers: Float32Array; sizes: Float32Array; uvRects: Float32Array; tints: Float32Array } {
    const n = this.count;
    return {
      centers: this.centers.subarray(0, n * 3),
      sizes: this.sizes.subarray(0, n * 2),
      uvRects: this.uvRects.subarray(0, n * 4),
      tints: this.tints.subarray(0, n * 4),
    };
  }

  markUploaded(): void {
    this.dirty = false;
  }

  private grow(): void {
    const next = this.capacity * 2;
    this.centers = grown(this.centers, next * 3);
    this.sizes = grown(this.sizes, next * 2);
    this.uvRects = grown(this.uvRects, next * 4);
    this.tints = grown(this.tints, next * 4);
    this.capacity = next;
  }

  get capacityCount(): number {
    return this.capacity;
  }
}

/**
 * The instance-attribute shape every sprite shader in this library shares.
 * Structural, so it matches any `BroMetalProgram` whose instance attributes are
 * named this way without dragging the full generic signature around.
 */
export interface SpriteInstanceTarget {
  instanceAttributes: {
    iCenter: { set(data: Float32Array): void };
    iSize: { set(data: Float32Array): void };
    iUvRect: { set(data: Float32Array): void };
    iTint: { set(data: Float32Array): void };
  };
}

/**
 * Uploads a batch's live prefix, and only if it changed. Returns the number of
 * instances now on the GPU, which is what to pass to `draw({ instanceCount })`.
 *
 * Returns 0 for an empty batch **without uploading** — a zero-length upload
 * would leave the attribute with an element count of zero, and `draw()` rejects
 * that as "no instance data" rather than drawing nothing. Callers must skip the
 * draw when this returns 0.
 *
 * ## The dirty skip requires one program per batch
 *
 * Skipping the upload is only safe if nothing else has written to that program's
 * instance buffers since. Two batches sharing one program will silently draw each
 * other's data: batch A uploads and draws, batch B uploads and draws, and next
 * frame A is clean so its `set()` is skipped — leaving B's instances bound while
 * A's draw call runs. The failure looks like sprites from the wrong atlas rather
 * than like a missing upload, which is why it is worth stating here and not just
 * in the header.
 *
 * Give each batch its own program. That is cheap: programs share the compiled
 * shader module and only own their buffers.
 */
export function uploadSpriteBatch(program: SpriteInstanceTarget, batch: SpriteBatch): number {
  if (batch.count === 0) return 0;
  if (!batch.dirty) return batch.count;
  const live = batch.live();
  program.instanceAttributes.iCenter.set(live.centers);
  program.instanceAttributes.iSize.set(live.sizes);
  program.instanceAttributes.iUvRect.set(live.uvRects);
  program.instanceAttributes.iTint.set(live.tints);
  batch.markUploaded();
  return batch.count;
}

const WHITE: readonly [number, number, number] = [1, 1, 1];

function grown(source: Float32Array, length: number): Float32Array {
  const next = new Float32Array(length);
  next.set(source);
  return next;
}

/** In-place gather by `order`, `stride` floats per element. */
function permute(data: Float32Array, order: number[], stride: number): void {
  const copy = data.slice(0, order.length * stride);
  for (let i = 0; i < order.length; i++) {
    const from = order[i]! * stride;
    const to = i * stride;
    for (let c = 0; c < stride; c++) {
      data[to + c] = copy[from + c]!;
    }
  }
}

/**
 * Camera basis for billboarded quads, read out of a view matrix.
 *
 * `Mat4Array` is column-major, so row *i* is (m[i], m[4+i], m[8+i]) — and the
 * rows of a view matrix's rotation are the camera axes in world space.
 *
 * `yLocked` keeps sprites upright and only yaws them toward the camera, which
 * is what a 2.5D world wants: a tree should not lie back when the camera looks
 * down at it.
 */
export function billboardBasis(
  view: Mat4Array,
  yLocked: boolean,
  right: Float32Array,
  up: Float32Array,
): void {
  if (yLocked) {
    const len = Math.hypot(view[0]!, view[8]!) || 1;
    right[0] = view[0]! / len;
    right[1] = 0;
    right[2] = view[8]! / len;
    up[0] = 0;
    up[1] = 1;
    up[2] = 0;
    return;
  }
  right[0] = view[0]!;
  right[1] = view[4]!;
  right[2] = view[8]!;
  up[0] = view[1]!;
  up[1] = view[5]!;
  up[2] = view[9]!;
}

/**
 * View-projection for a 2D camera showing `worldHeight` world units of height,
 * centred on (centerX, centerY). Width follows from the drawing buffer aspect,
 * so sprites never stretch.
 *
 * There is no view matrix: the projection alone does the work, and world Z is
 * free to act as a layer index. With this near/far pair a *larger* Z draws in
 * front, which is why `LAYER` below counts upward.
 */
export function ortho2d(
  centerX: number,
  centerY: number,
  worldHeight: number,
  aspect: number,
  out: Mat4Array,
): Mat4Array {
  const halfHeight = worldHeight / 2;
  const halfWidth = halfHeight * aspect;
  return mat4.orthographic(
    centerX - halfWidth,
    centerX + halfWidth,
    centerY - halfHeight,
    centerY + halfHeight,
    -1,
    1,
    out,
  );
}

/**
 * Z values for a 2D scene. Because cut-out sprites write depth, everything can
 * go in one draw call per atlas and the depth buffer resolves the layering —
 * no back-to-front submission order to maintain.
 */
export const LAYER = {
  floor: 0,
  decor: 0.1,
  item: 0.2,
  actor: 0.3,
  overhead: 0.4,
  ui: 0.5,
} as const;

/** Basis for flat 2D sprites: the quad stays in the XY plane. */
export const AXIS_RIGHT = new Float32Array([1, 0, 0]);
export const AXIS_UP = new Float32Array([0, 1, 0]);
/** Basis for a quad lying flat on the ground in a 3D scene. */
export const AXIS_GROUND_UP = new Float32Array([0, 0, 1]);

/** Unit quad centred on the origin in the XY plane, with UVs. Two triangles. */
export const QUAD_POSITIONS = new Float32Array([
  -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
]);

export const QUAD_UVS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

export const QUAD_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);

/**
 * Unit quad whose origin sits at the BOTTOM centre — the anchor a world-space
 * sprite wants, so `y` is where the sprite meets the ground.
 */
export const QUAD_POSITIONS_GROUNDED = new Float32Array([
  -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0,
]);
