import {
  shader,
  discard,
  texture,
  abs,
  floor,
  max,
  mix,
  mod,
  step,
  vec2,
  vec3,
  vec4,
  type Vec2,
  type Vec3,
  type Vec4,
} from 'brometal';

// ── The level, as a pure function of a grid slot ───────────────────────────
//
// The app uploads one instance per cell of a (width x tileRows+1) grid ONCE and
// never touches instance data again. Which tile a cell draws — or whether it
// draws at all — is decided here from three texels of an 87x1 level texture: the
// cell's own column and its two neighbours. That is the whole of what
// `buildLevel` used to emit as a 331-sprite array every frame.
//
// The top row of the grid is the decor slot rather than a terrain row, so
// foliage rides the same static buffer as the ground. It is the same layer trick
// brocraft plays with `iCell.z`.

/** Centre of column `col` in a 1-pixel-tall data texture. */
function columnUv(col: number, width: number): Vec2 {
  return vec2((col + 0.5) / width, 0.5);
}

/** Recovers the 0..255 byte a channel was packed from. */
function byteOf(channel: number): number {
  return floor(channel * 255 + 0.5);
}

/**
 * `spriteAtlas.rect` transcribed: tile index -> (u0, v0, du, dv) with a
 * half-texel inset. `geom` is (cols, rows, insetU, insetV).
 *
 * V is flipped because `loadTexture` defaults to `flipY: true`, so image row 0
 * lands at the TOP of the texture while UV 0 is at the bottom.
 */
function tileRect(tile: number, geom: Vec4): Vec4 {
  const du = 1 / geom.x;
  const dv = 1 / geom.y;
  const col = mod(tile, geom.x);
  const row = floor(tile / geom.x);
  return vec4(
    col * du + geom.z,
    1 - (row + 1) * dv + geom.w,
    du - geom.z * 2,
    dv - geom.w * 2,
  );
}

/**
 * The 2D camera without a matrix. `cam` is (centre X, centre Y, half view width,
 * half view height) — that is the whole of an orthographic 2D projection, where a
 * mat4 spends 16 floats to say it with 12 of them zero. Z is negated to match
 * `mat4.orthographic(l, r, b, t, -1, 1)`, so a higher `LAYER` still draws in
 * front; the WebGPU backend remaps clip Z from GL's range on its own.
 *
 * This is why every program here takes a `vec4` per frame instead of a `mat4`,
 * and why the app no longer builds a matrix at all.
 */
function toClip(world: Vec3, cam: Vec4): Vec4 {
  return vec4((world.x - cam.x) / cam.z, (world.y - cam.y) / cam.w, -world.z, 1);
}

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  /**
   * One instance per grid cell: (column, row). Row `uParams.y` — one past the
   * tallest terrain row — is the decor slot rather than a terrain row.
   */
  instanceAttributes: { iCell: 'vec2' },
  uniforms: {
    /** (camera X, camera Y, half view width, half view height). */
    uCamera: 'vec4',
    uAtlas: 'sampler2D',
    uCutoff: 'float',
    uAtlasGeom: 'vec4',
    /** The level texture: R = height+1, G = decor tile, B = platform row+1. */
    uLevel: 'sampler2D',
    uLevelSize: 'vec2',
    /** Base index of each 4-variant run: (surface, interior, under, lone). */
    uRuns: 'vec4',
    /** (floating-platform tile, decor grid row, floor Z, decor Z). */
    uParams: 'vec4',
  },
  varyings: { vUv: 'vec2' },

  vertex(
    { aPosition, aUv, iCell },
    { uCamera, uAtlasGeom, uLevel, uLevelSize, uRuns, uParams },
    v,
  ) {
    const col = iCell.x;
    const row = iCell.y;

    // Three fetches is all the terrain needs: the run variant depends only on
    // whether the left and right columns are filled at this row.
    const cell = texture(uLevel, columnUv(col, uLevelSize.x));
    const left = texture(uLevel, columnUv(col - 1, uLevelSize.x));
    const right = texture(uLevel, columnUv(col + 1, uLevelSize.x));

    // -1 means "no ground in this column", which is why the byte is height+1.
    const h = byteOf(cell.x) - 1;
    const hLeft = byteOf(left.x) - 1;
    const hRight = byteOf(right.x) - 1;

    // The texture wraps `clamp`, so column -1 reads column 0 and column width
    // reads the last column. Without these guards the level's first and last
    // columns would believe they had a solid neighbour and lose their side
    // border — the exact "border in the middle of a run" artefact the variant
    // system exists to prevent, only inverted.
    const hasLeft = step(0, col - 1);
    const hasRight = step(col + 1, uLevelSize.x - 1);

    const filledLeft = hasLeft * step(0, hLeft) * step(row, hLeft);
    const filledRight = hasRight * step(0, hRight) * step(row, hRight);
    const openLeft = 1 - filledLeft;
    const openRight = 1 - filledRight;

    // runTile as arithmetic: both sides open -> +0, left only -> +1, right only
    // -> +3, neither -> +2.
    const variant =
      openLeft * (1 - openRight) +
      3 * (1 - openLeft) * openRight +
      2 * (1 - openLeft) * (1 - openRight);

    // Which of the four runs this cell belongs to. A one-tile-tall column is
    // both the top and the bottom of its column and gets the fully bordered run.
    const isTop = 1 - step(0.5, abs(row - h));
    const isBottom = 1 - step(0.5, row);
    const isLone = isTop * isBottom;
    const base =
      uRuns.w * isLone +
      uRuns.x * isTop * (1 - isLone) +
      uRuns.z * (1 - isTop) * isBottom +
      uRuns.y * (1 - isTop) * (1 - isBottom);

    // A floating platform is a single piece with no run variants — matching the
    // CPU rule that neighbour tests consult ground height only.
    const platformRow = byteOf(cell.z) - 1;
    const isPlatform = step(0, platformRow) * (1 - step(0.5, abs(row - platformRow)));

    const isDecor = 1 - step(0.5, abs(row - uParams.y));
    const decorTile = byteOf(cell.y);

    const tile = mix(mix(base + variant, uParams.x, isPlatform), decorTile, isDecor);
    const rect = tileRect(tile, uAtlasGeom);
    v.vUv = rect.xy.add(aUv.mul(rect.zw));

    // Decor stands one tile above the surface, on its own layer.
    const cy = mix(row + 0.5, h + 1.5, isDecor);
    const z = mix(uParams.z, uParams.w, isDecor);
    const world = vec3(col + 0.5 + aPosition.x, cy + aPosition.y, z);

    // The grid is a rectangle; the level is ragged and full of gaps. Cells with
    // nothing in them collapse to a clipped degenerate quad, which is what lets
    // one fixed-size buffer stand in for an arbitrary hand-authored shape. It
    // saves no vertex work — clipping happens after this shader — it saves the
    // upload.
    const hasTile = max(step(0, h) * step(row, h), isPlatform);
    const alive = mix(hasTile, step(0.5, decorTile), isDecor);
    let clip = toClip(world, uCamera);
    if (alive < 0.5) {
      clip = vec4(2, 2, 2, 1);
    }
    return clip;
  },

  fragment({ uAtlas, uCutoff }, { vUv }) {
    const texel = texture(uAtlas, vUv);
    if (texel.w < uCutoff) {
      discard();
    }
    return vec4(texel.xyz, 1);
  },
});
