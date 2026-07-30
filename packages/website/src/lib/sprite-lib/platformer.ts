/**
 * Level data for the side-scroller demo: a hand-shaped run of platforms with
 * coins, foliage and a couple of patrolling walkers.
 *
 * The heightmap is authored rather than generated — a platformer needs jumps
 * that are actually makeable, and that is easier to guarantee by hand than to
 * coax out of noise.
 *
 * What this module deliberately does **not** produce is a list of sprites. The
 * authored runs collapse to one byte-packed column record each, that record goes
 * to the GPU once as an 87x1 data texture, and every tile the level draws is
 * derived from it in `platformer-terrain.shader.ts`. The CPU keeps only what the
 * game itself has to answer: "is this cell solid?" for the player's collisions.
 */
import { createDataTexture, type DataTexture } from '@/lib/sprite-lib/data-texture';
import type { Renderer } from 'brometal';

/**
 * Tile indices in public/sprites/platformer.png (20 x 9 grid of 18px tiles).
 *
 * The ground tiles come in runs of four: [both side borders, left border only,
 * no side borders, right border only]. Picking at random inserts a border into
 * the middle of a run and the terrain reads as a grid of separate blocks, so the
 * variant is chosen by position — see `platformer-terrain.shader.ts`, which does
 * that selection in the vertex shader from the neighbouring columns' heights.
 * Row 1 is the grass surface, row 6 the buried interior, row 7 the underside.
 */
export const PLATFORMER_TILES = {
  /** Base index of each 4-variant run. */
  surfaceRun: 20,
  interiorRun: 120,
  underRun: 140,
  /** A one-tile-tall column: bordered on top and bottom. */
  loneRun: 0,
  coin: 151,
  /**
   * Two-frame flag. `flagB === flagA + 1` is load-bearing: the shader animates it
   * as `flagA + mod(floor(t * fps), 2)` rather than looking up a table, because
   * the DSL has no arrays.
   */
  flagA: 111,
  flagB: 112,
  /**
   * Tufts, a shrub, a small pine, a cactus. Unlike the runs above, these need no
   * particular order: the level texture carries the chosen tile index verbatim,
   * so any four indices <= 255 would work.
   */
  foliage: [124, 125, 126, 127] as const,
  /** Floating platform pieces. */
  platform: 146,
  sign: 84,
} as const;

/**
 * Tile indices in public/sprites/platformer-characters.png (9 x 3 of 24px).
 *
 * `playerWalk === playerIdle + 1` is relied on by `platformer-player.shader.ts`:
 * the walk cycle is `mix(idle, walk, frame)` with no table. Reordering this atlas
 * silently picks the wrong frame.
 */
export const CHAR_TILES = {
  playerIdle: 0,
  playerWalk: 1,
  greenFoeIdle: 24,
  greenFoeWalk: 25,
  blueFoe: 18,
} as const;

/** Tile indices in public/sprites/platformer-backgrounds.png (8 x 3 of 24px). */
export const BACKGROUND_TILES = {
  /**
   * Horizon band: clouds, then clouds with trees. Contiguous, so the parallax
   * shader picks a variant with `bandBase + mod(abs(i), 4)`.
   */
  band: [8, 9, 10, 11] as const,
  /** Solid haze below the horizon. */
  fill: 16,
  /** Matches tile 16 so the strip and the clear colour meet invisibly. */
  fillColor: [0.761, 0.89, 0.91] as const,
  /** Matches tile 0 — the renderer's clear colour. */
  skyColor: [0.875, 0.965, 0.961] as const,
} as const;

/**
 * The DSL has no arrays, so every multi-frame animation in this demo is
 * `base + mod(frame, n)` over *adjacent* tile indices. That makes atlas ordering
 * load-bearing in a way a comment cannot enforce: reorder one of these sheets and
 * the flag or the walk cycle silently animates the wrong art. Checking it at
 * module load turns a silent visual bug into an immediate error, and is the only
 * reader of `flagB` — which is the point, since the shader derives it.
 */
for (const [what, run] of [
  ['flag flip', [PLATFORMER_TILES.flagA, PLATFORMER_TILES.flagB]],
  ['player walk cycle', [CHAR_TILES.playerIdle, CHAR_TILES.playerWalk]],
  ['parallax band', BACKGROUND_TILES.band],
] as const) {
  for (let i = 1; i < run.length; i++) {
    if (run[i] !== run[0] + i) {
      throw new Error(
        `platformer: the ${what} shader steps through these tiles with mod(), ` +
          `which needs a contiguous run — ${run.join(', ')} is not one`,
      );
    }
  }
}

/** One authored column, and exactly what the level texture carries per column. */
export interface LevelColumn {
  /** Surface row, or `null` for a gap the player can fall through. */
  height: number | null;
  /** Foliage tile standing on the surface, or 0 for none. */
  decorTile: number;
  /** Row of the single floating platform piece in this column, or `null`. */
  platformRow: number | null;
}

export interface Walker {
  from: number;
  to: number;
  y: number;
  speed: number;
  phase: number;
  tile: number;
}

export interface Level {
  width: number;
  columns: readonly LevelColumn[];
  /**
   * Rows the terrain can occupy, 0 .. tileRows-1. The grid the terrain shader
   * draws is one row taller than this; that extra row is the decor slot.
   */
  tileRows: number;
  coins: { x: number; y: number }[];
  walkers: Walker[];
  flag: [number, number];
  /** True when an AABB centred on (x, y) overlaps solid ground. */
  solidAt(x: number, y: number, halfWidth: number, halfHeight: number): boolean;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Surface height per column, or `null` for a gap the player can fall through.
 * Authored as runs of (length, height) so the shape is readable and the jumps
 * are deliberate.
 */
const SURFACE: readonly (readonly [number, number | null])[] = [
  [8, 2],
  [2, 3],
  [4, 3],
  [2, null],
  [5, 4],
  [3, 5],
  [2, null],
  [6, 3],
  [4, 2],
  [3, null],
  [5, 4],
  [4, 6],
  [2, null],
  [4, 5],
  [6, 3],
  [2, null],
  [8, 2],
  [3, 4],
  [4, 4],
  [10, 2],
];

/**
 * x, y, width in tiles.
 *
 * Two invariants the level texture depends on, both true here and both worth
 * checking if this table is edited: a column carries **at most one** platform
 * row (there is one byte for it), and a platform row never coincides with a
 * ground row in the same column (they would fight over the same grid cell).
 */
const FLOATING: readonly (readonly [number, number, number])[] = [
  [15, 7, 3],
  [27, 6, 2],
  [41, 8, 3],
  [56, 7, 4],
  [70, 6, 2],
];

export function buildLevel(): Level {
  const random = rng(0xb0a7);
  const heights: (number | null)[] = [];
  for (const [length, height] of SURFACE) {
    for (let i = 0; i < length; i++) heights.push(height);
  }
  const width = heights.length;

  const columns: LevelColumn[] = heights.map((height) => ({
    height,
    decorTile: 0,
    platformRow: null,
  }));

  let maxRow = 0;
  for (const height of heights) {
    if (height !== null) maxRow = Math.max(maxRow, height);
  }
  for (const [x, y, span] of FLOATING) {
    for (let i = 0; i < span; i++) {
      columns[x + i]!.platformRow = y;
    }
    maxRow = Math.max(maxRow, y);
  }
  const tileRows = maxRow + 1;

  // Occupancy as a byte per cell rather than a Set of "cx,cy" strings: the
  // player's collision test is the only remaining consumer, and it wants an
  // O(1) array index, not a template literal and a hash.
  const occupancy = new Uint8Array(width * tileRows);
  for (let column = 0; column < width; column++) {
    const { height, platformRow } = columns[column]!;
    if (height !== null) {
      for (let row = 0; row <= height; row++) occupancy[row * width + column] = 1;
    }
    if (platformRow !== null) occupancy[platformRow * width + column] = 1;
  }

  // Decor sits on the surface, never in a gap. The rng sequence is interleaved
  // with the coin placement below, so both loops must keep their current shape
  // for the level to look the way it was authored.
  for (let column = 1; column < width - 1; column++) {
    const height = heights[column];
    if (height === null || height === undefined) continue;
    if (random() > 0.72) {
      columns[column]!.decorTile =
        PLATFORMER_TILES.foliage[Math.floor(random() * PLATFORMER_TILES.foliage.length)]!;
    }
  }

  // Coins: a few above the ground, plus a row over each floating platform —
  // the reason to jump up there at all.
  const coins: { x: number; y: number }[] = [];
  for (let column = 3; column < width - 3; column += 3) {
    const height = heights[column];
    if (height === null || height === undefined) continue;
    if (random() > 0.45) coins.push({ x: column + 0.5, y: height + 2.2 });
  }
  for (const [x, y, span] of FLOATING) {
    for (let i = 0; i < span; i++) {
      coins.push({ x: x + i + 0.5, y: y + 1.8 });
    }
  }

  // Each walker patrols one FLAT run so a single Y keeps its feet on the
  // ground. A tile at row h spans h..h+1, so the surface of a column of height
  // h is at y = h + 1; the sprite centre sits just over half its height above
  // that, allowing for the transparent padding under the character art.
  const walkers: Walker[] = [
    // cols 1-7, height 2 -> surface 3
    { from: 1.5, to: 7.5, y: 3.55, speed: 0.55, phase: 0, tile: CHAR_TILES.greenFoeIdle },
    // cols 26-31, height 3 -> surface 4
    { from: 26.5, to: 31.5, y: 4.55, speed: 0.7, phase: 1.6, tile: CHAR_TILES.blueFoe },
    // cols 77-85, height 2 -> surface 3
    { from: 77.5, to: 85.5, y: 3.55, speed: 0.48, phase: 3.1, tile: CHAR_TILES.greenFoeWalk },
  ];

  const lastHeight = heights[width - 1] ?? 2;
  const flag: [number, number] = [width - 3.5, lastHeight + 1.5];

  return {
    width,
    columns,
    tileRows,
    coins,
    walkers,
    flag,
    solidAt(x: number, y: number, halfWidth: number, halfHeight: number): boolean {
      const minX = Math.floor(x - halfWidth);
      const maxX = Math.floor(x + halfWidth);
      const minY = Math.floor(y - halfHeight);
      const maxY = Math.floor(y + halfHeight);
      for (let cy = Math.max(minY, 0); cy <= Math.min(maxY, tileRows - 1); cy++) {
        for (let cx = Math.max(minX, 0); cx <= Math.min(maxX, width - 1); cx++) {
          if (occupancy[cy * width + cx] === 1) return true;
        }
      }
      return false;
    },
  };
}

/**
 * The authored level as a 1-pixel-tall RGBA8 texture — one texel per column,
 * which the terrain shader samples in its vertex stage.
 *
 * Height 1 is deliberate: with `nearest` filtering V never matters, so the one
 * axis a data texture can get wrong is removed entirely. Alpha is pinned at 255
 * because `DataCell` defaults it to 0 and a zero-alpha texel is the sort of thing
 * a premultiply path is entitled to touch.
 *
 * `+ 1` on the two nullable fields is what makes 0 mean "absent" — a byte has no
 * room for a sentinel otherwise.
 */
export function createLevelTexture(renderer: Renderer, level: Level): DataTexture {
  return createDataTexture(renderer, level.width, 1, (x) => {
    const { height, decorTile, platformRow } = level.columns[x]!;
    return {
      r: height === null ? 0 : height + 1,
      g: decorTile,
      b: platformRow === null ? 0 : platformRow + 1,
      a: 255,
    };
  });
}

/**
 * The `uAtlasGeom` uniform every platformer shader takes: (cols, rows, insetU,
 * insetV). It is `spriteAtlas`'s tile-rect arithmetic minus the tile index —
 * the shaders derive the rect themselves so a tile index never has to travel as
 * four floats of instance data.
 *
 * The inset is half a texel, for the same reason `spriteAtlas` applies one:
 * Kenney's packed sheets have no gutter, so an edge-to-edge UV rect samples the
 * neighbouring tile along the seam.
 */
export function atlasGeom(atlas: {
  cols: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
}): Float32Array {
  const { cols, rows, tileWidth, tileHeight } = atlas;
  return new Float32Array([cols, rows, 0.5 / (cols * tileWidth), 0.5 / (rows * tileHeight)]);
}
