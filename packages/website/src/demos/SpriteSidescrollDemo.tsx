'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createProgram,
  createRenderer,
  loadTexture,
  type BroMetalTexture,
  type Renderer,
  type RendererBackend,
} from 'brometal';
import parallaxShader from '@/shaders/platformer-parallax.shader.gen';
import terrainShader from '@/shaders/platformer-terrain.shader.gen';
import propsShader from '@/shaders/platformer-props.shader.gen';
import walkersShader from '@/shaders/platformer-walkers.shader.gen';
import playerShader from '@/shaders/platformer-player.shader.gen';
import {
  LAYER,
  QUAD_INDICES,
  QUAD_POSITIONS,
  QUAD_UVS,
  spriteAtlas,
} from '@/lib/sprites';
import { createDataTexture, type DataTexture } from '@/lib/data-texture';
import BackendBadge from '@/components/BackendBadge';
import DemoStats, { useFrameStats } from '@/components/DemoStats';
import DemoCredit from '@/components/DemoCredit';

// ---------------------------------------------------------------------------
// Inlined from what used to be platformer.ts. It had one caller, so it lives
// here rather than in a shared module.
// ---------------------------------------------------------------------------

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
const PLATFORMER_TILES = {
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
const CHAR_TILES = {
  playerIdle: 0,
  playerWalk: 1,
  greenFoeIdle: 24,
  greenFoeWalk: 25,
  blueFoe: 18,
} as const;

/** Tile indices in public/sprites/platformer-backgrounds.png (8 x 3 of 24px). */
const BACKGROUND_TILES = {
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
interface LevelColumn {
  /** Surface row, or `null` for a gap the player can fall through. */
  height: number | null;
  /** Foliage tile standing on the surface, or 0 for none. */
  decorTile: number;
  /** Row of the single floating platform piece in this column, or `null`. */
  platformRow: number | null;
}

interface Walker {
  from: number;
  to: number;
  y: number;
  speed: number;
  phase: number;
  tile: number;
}

interface Level {
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

function buildLevel(): Level {
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
function createLevelTexture(renderer: Renderer, level: Level): DataTexture {
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
function atlasGeom(atlas: {
  cols: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
}): Float32Array {
  const { cols, rows, tileWidth, tileHeight } = atlas;
  return new Float32Array([cols, rows, 0.5 / (cols * tileWidth), 0.5 / (rows * tileHeight)]);
}


const VIEW_HEIGHT = 15;
const RUN_SPEED = 7.5;
const GRAVITY = -34;
const JUMP_SPEED = 12.4;
const COYOTE_SECONDS = 0.09;

const WORLD_ATLAS = { cols: 20, rows: 9, tileWidth: 18, tileHeight: 18 };
const CHAR_ATLAS = { cols: 9, rows: 3, tileWidth: 24, tileHeight: 24 };
const BG_ATLAS = { cols: 8, rows: 3, tileWidth: 24, tileHeight: 24 };

/** Backdrop tuning: strip size, the band's centre Y, and its layer depth. */
const BAND_SIZE = 9;
const BAND_Y = 7.6;
const BACKDROP_Z = -0.45;
/**
 * How much of the camera's motion the background keeps. 0 would pin it to the
 * world, 1 would pin it to the screen; 0.72 reads as distant hills.
 */
const PARALLAX_FACTOR = 0.72;
/**
 * Strip slots per tier. Slots past the right edge draw off-screen and are
 * clipped, which is why an over-allocated fixed count is safer than an
 * aspect-derived `instanceCount`: `draw()` throws if the count exceeds what was
 * uploaded, and an exception out of the frame callback stops the loop for good.
 *
 * The shader places slot 0 up to two strips left of the view, so the covered
 * width is a little under (SLOTS - 2) * BAND_SIZE. Swept against every camera
 * position, 20 slots cover every aspect below 10.5 and 16 ran out at 8.1 — which
 * a short ultrawide window can actually reach, since the canvas is 100vw x 100vh.
 * The margin costs 64 bytes, once.
 */
const PARALLAX_SLOTS = 20;

const PLAYER_SIZE = 1.35;
const PLAYER_WALK_FPS = 11;
const WALKER_SIZE = 1.3;
const COIN_SIZE = 0.8;
const COIN_BOB = [3.4, 0.12] as const;
const FLAG_FPS = 6;
const CUTOFF = 0.5;

/** Player state codes, matched by `platformer-player.shader.ts`. */
const STATE_AIRBORNE = 0;
const STATE_IDLE = 1;
const STATE_RUNNING = 2;

/**
 * A playable pixel-art platformer where the level never travels to the GPU
 * twice.
 *
 * Five programs, five draw calls, and after startup the only instance data any
 * frame uploads is the player's `vec4`. The terrain is a static grid of cells
 * that read their own tile out of an 87x1 level texture; the backdrop, the coins
 * and the walkers are static buffers animated from `uTime`. Layering is still a
 * Z per sprite resolved by the depth buffer, because cut-out sprites write depth.
 *
 * There is no view-projection matrix anywhere: a 2D orthographic camera is four
 * numbers, and each shader applies them itself (see `toClip` in
 * `platformer-terrain.shader.ts`).
 *
 * What this demo does NOT claim is credit for the difference against the version
 * it replaced. Most of that gap was a plain bug — the old code handed `set()` a
 * batch's 4096-slot backing array instead of its live prefix — and it was fixed in
 * `sprites.ts`, not here. The panel spells the split out; so does the comment
 * above the terrain grid.
 */
export default function SpriteSidescrollDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const { stats, tick } = useFrameStats();
  const [hud, setHud] = useState({ coins: 0, total: 0, instances: 0 });
  const keysRef = useRef(new Set<string>());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    const onKeyDown = (event: KeyboardEvent): void => {
      keysRef.current.add(event.key.toLowerCase());
      if (CONTROL_KEYS.has(event.key.toLowerCase())) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      keysRef.current.delete(event.key.toLowerCase());
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    void (async () => {
      // The clear colour is tile 0 of the background atlas, so the sky and the
      // drawn strips meet with no seam.
      const [skyR, skyG, skyB] = BACKGROUND_TILES.skyColor;
      const renderer = await createRenderer(canvas, { clearColor: [skyR, skyG, skyB, 1] });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      const loaded: BroMetalTexture[] = [];
      const load = async (url: string): Promise<BroMetalTexture> => {
        const texture = await loadTexture(renderer, url, { filter: 'nearest', wrap: 'clamp' });
        loaded.push(texture);
        return texture;
      };
      const worldTexture = await load('/sprites/platformer.png');
      const charTexture = await load('/sprites/platformer-characters.png');
      const bgTexture = await load('/sprites/platformer-backgrounds.png');
      if (cancelled) {
        for (const texture of loaded) texture.dispose();
        renderer.destroy();
        return;
      }

      const level: Level = buildLevel();
      const levelTexture = createLevelTexture(renderer, level);

      // ── Programs: one per batch ──────────────────────────────────────────
      // Not stylistic. Instance data lives in the program's buffers, so a
      // program shared between two batches can only be fed by re-uploading both
      // every frame — the moment one of them stops uploading it draws with the
      // other's data. Splitting is what makes "upload once" expressible at all.
      const parallax = createProgram(renderer, parallaxShader, { blend: 'none' });
      const terrain = createProgram(renderer, terrainShader, { blend: 'none' });
      const props = createProgram(renderer, propsShader, { blend: 'none' });
      const walkers = createProgram(renderer, walkersShader, { blend: 'none' });
      const player = createProgram(renderer, playerShader, { blend: 'none' });
      const programs = [parallax, terrain, props, walkers, player];
      for (const program of programs) {
        program.attributes.aPosition.set(QUAD_POSITIONS);
        program.attributes.aUv.set(QUAD_UVS);
        program.setIndices(QUAD_INDICES);
        program.uniforms.uCutoff.set(CUTOFF);
      }

      // ── Backdrop: one slot per strip per tier, uploaded once ────────────
      const slots = new Float32Array(PARALLAX_SLOTS * 2 * 2);
      for (let slot = 0; slot < PARALLAX_SLOTS; slot++) {
        for (let tier = 0; tier < 2; tier++) {
          const at = (slot * 2 + tier) * 2;
          slots[at] = slot;
          slots[at + 1] = tier;
        }
      }
      parallax.instanceAttributes.iSlot.set(slots);
      parallax.uniforms.uAtlas.set(bgTexture);
      parallax.uniforms.uAtlasGeom.set(atlasGeom(BG_ATLAS));
      parallax.uniforms.uBand.set([BAND_SIZE, BAND_Y, PARALLAX_FACTOR, BACKDROP_Z]);
      parallax.uniforms.uTiles.set([
        BACKGROUND_TILES.band[0],
        BACKGROUND_TILES.band.length,
        BACKGROUND_TILES.fill,
      ]);

      // ── Terrain: one instance per grid cell, uploaded once ──────────────
      // The grid is a plain rectangle one row taller than the terrain needs;
      // that top row is the decor slot. 870 cells stand in for the level's 354
      // real ones: the other 516 cull themselves in the vertex shader, and
      // because clipping happens after that shader they still cost their vertex
      // invocations — what self-culling buys is rasterization, not vertex work.
      //
      // Worth being clear about what this grid does and does not save. It does
      // not save a byte per frame over uploading 354 static sprites once; the
      // instance data here is 6,960 B of (column, row) pairs against 18.5 KiB of
      // sprite stamps, both one-time. What it buys is that the level's shape stops
      // being a CPU data structure at all — no 331-entry sprite array, no tile
      // loop, no string-keyed occupancy Set.
      const gridRows = level.tileRows + 1;
      const gridCells = level.width * gridRows;
      const cells = new Float32Array(gridCells * 2);
      for (let column = 0; column < level.width; column++) {
        for (let row = 0; row < gridRows; row++) {
          const at = (column * gridRows + row) * 2;
          cells[at] = column;
          cells[at + 1] = row;
        }
      }
      terrain.instanceAttributes.iCell.set(cells);
      terrain.uniforms.uAtlas.set(worldTexture);
      terrain.uniforms.uAtlasGeom.set(atlasGeom(WORLD_ATLAS));
      terrain.uniforms.uLevel.set(levelTexture.texture);
      terrain.uniforms.uLevelSize.set(levelTexture.size);
      terrain.uniforms.uRuns.set([
        PLATFORMER_TILES.surfaceRun,
        PLATFORMER_TILES.interiorRun,
        PLATFORMER_TILES.underRun,
        PLATFORMER_TILES.loneRun,
      ]);
      terrain.uniforms.uParams.set([
        PLATFORMER_TILES.platform,
        level.tileRows,
        LAYER.floor,
        LAYER.decor,
      ]);

      // ── Coins and the flag: static, plus a liveness float ───────────────
      const coins = level.coins.map((coin) => ({ ...coin, taken: false }));
      const propCount = coins.length + 1;
      const propCenters = new Float32Array(propCount * 3);
      const propStamps = new Float32Array(propCount * 4);
      const propAlive = new Float32Array(propCount).fill(1);
      coins.forEach((coin, i) => {
        propCenters.set([coin.x, coin.y, LAYER.item], i * 3);
        propStamps.set([PLATFORMER_TILES.coin, COIN_SIZE, COIN_SIZE, 0], i * 4);
      });
      const flagIndex = coins.length;
      propCenters.set([level.flag[0], level.flag[1], LAYER.decor], flagIndex * 3);
      propStamps.set([PLATFORMER_TILES.flagA, 1, 1, 1], flagIndex * 4);
      props.instanceAttributes.iCenter.set(propCenters);
      props.instanceAttributes.iStamp.set(propStamps);
      props.instanceAttributes.iAlive.set(propAlive);
      props.uniforms.uAtlas.set(worldTexture);
      props.uniforms.uAtlasGeom.set(atlasGeom(WORLD_ATLAS));
      props.uniforms.uBob.set(COIN_BOB);
      props.uniforms.uFlag.set([PLATFORMER_TILES.flagA, FLAG_FPS, 2]);
      props.uniforms.uCoinTint.set([1.15, 1.1, 0.7]);

      // ── Walkers: patrol stamps, uploaded once ───────────────────────────
      // Their tile never changes, so the UV rect is baked here rather than
      // derived per vertex — the CPU is the right place for data that is
      // genuinely constant.
      const charAtlas = spriteAtlas(charTexture, CHAR_ATLAS);
      const patrols = new Float32Array(level.walkers.length * 4);
      const traits = new Float32Array(level.walkers.length * 4);
      const walkerRects = new Float32Array(level.walkers.length * 4);
      level.walkers.forEach((walker, i) => {
        patrols.set([walker.from, walker.to, walker.y, walker.speed], i * 4);
        traits.set([walker.phase, WALKER_SIZE, WALKER_SIZE, LAYER.actor - 0.02], i * 4);
        charAtlas.rect(walker.tile, walkerRects, i * 4);
      });
      walkers.instanceAttributes.iPatrol.set(patrols);
      walkers.instanceAttributes.iTrait.set(traits);
      walkers.instanceAttributes.iUvRect.set(walkerRects);
      walkers.uniforms.uAtlas.set(charTexture);

      // ── Player: the only per-frame upload in the demo ───────────────────
      const state = new Float32Array(4);
      player.uniforms.uAtlas.set(charTexture);
      player.uniforms.uAtlasGeom.set(atlasGeom(CHAR_ATLAS));
      player.uniforms.uPlayer.set([PLAYER_SIZE, LAYER.actor, PLAYER_WALK_FPS]);
      player.uniforms.uFrames.set([CHAR_TILES.playerIdle, CHAR_TILES.playerWalk]);

      const body = {
        x: 3,
        y: 6,
        vx: 0,
        vy: 0,
        grounded: false,
        sinceGrounded: 99,
        facing: 1,
      };
      let collected = 0;
      let jumpHeld = false;

      // The camera, as the four numbers a 2D orthographic projection actually
      // needs. Every shader does the projection itself from these, so no mat4 is
      // built here and no mat4 is uploaded: 16 bytes per program per frame
      // instead of 64, and a vertex pays three multiplies instead of sixteen.
      const camera = new Float32Array(4);
      let last = 0;

      const stop = renderer.loop((t) => {
        tick(t);
        const dt = Math.min(Math.max(t - last, 0), 1 / 30);
        last = t;

        // --- input ---
        const keys = keysRef.current;
        const left = keys.has('a') || keys.has('arrowleft');
        const right = keys.has('d') || keys.has('arrowright');
        const wantJump = keys.has(' ') || keys.has('w') || keys.has('arrowup');

        body.vx = (right ? RUN_SPEED : 0) - (left ? RUN_SPEED : 0);
        if (body.vx !== 0) body.facing = body.vx > 0 ? 1 : -1;

        // Coyote time: a jump pressed a few frames after walking off a ledge
        // still counts. Without it the controls feel broken rather than strict.
        body.sinceGrounded = body.grounded ? 0 : body.sinceGrounded + dt;
        if (wantJump && !jumpHeld && body.sinceGrounded < COYOTE_SECONDS) {
          body.vy = JUMP_SPEED;
          body.grounded = false;
          body.sinceGrounded = 99;
        }
        jumpHeld = wantJump;

        body.vy = Math.max(body.vy + GRAVITY * dt, -28);

        // --- horizontal then vertical, so a corner never wedges the player ---
        const halfW = 0.34;
        const halfH = 0.48;
        const stepX = body.vx * dt;
        if (!level.solidAt(body.x + stepX + Math.sign(stepX) * halfW, body.y, halfW, halfH)) {
          body.x += stepX;
        }
        const stepY = body.vy * dt;
        if (level.solidAt(body.x, body.y + stepY, halfW, halfH)) {
          if (body.vy < 0) body.grounded = true;
          body.vy = 0;
        } else {
          body.y += stepY;
          if (body.vy !== 0) body.grounded = false;
        }
        body.x = Math.min(Math.max(body.x, 1), level.width - 1);
        if (body.y < -6) {
          body.x = 3;
          body.y = 6;
          body.vy = 0;
        }

        // --- coins ---
        // A coin's bob is presentation and lives in the shader; a coin's
        // existence is on the HUD, and there is no readback, so the pickup test
        // stays here. It re-uploads the liveness attribute on the frames it
        // fires and on no others.
        let picked = false;
        for (let i = 0; i < coins.length; i++) {
          const coin = coins[i]!;
          if (coin.taken) continue;
          if (Math.abs(coin.x - body.x) < 0.7 && Math.abs(coin.y - body.y) < 0.8) {
            coin.taken = true;
            collected++;
            propAlive[i] = 0;
            picked = true;
          }
        }
        if (picked) props.instanceAttributes.iAlive.set(propAlive);

        // --- camera: follow x, clamp to level, keep y mostly steady ---
        const halfHeight = VIEW_HEIGHT / 2;
        const halfWidth = halfHeight * renderer.aspect;
        camera[0] = Math.min(Math.max(body.x, halfWidth), level.width - halfWidth);
        camera[1] = Math.max(body.y * 0.35 + 4.2, halfHeight - 2);
        camera[2] = halfWidth;
        camera[3] = halfHeight;

        // --- draw ---
        // Nothing below rebuilds a sprite. Every program gets the camera, the
        // animated ones get the clock, and the player gets four floats.
        //
        // Five writes for one camera is the cost of one program per batch: there
        // is no shared uniform block, so each program owns its own copy. It is
        // the largest per-frame number left in this demo.
        for (const program of programs) program.uniforms.uCamera.set(camera);
        props.uniforms.uTime.set(t);
        walkers.uniforms.uTime.set(t);
        player.uniforms.uTime.set(t);

        state[0] = body.x;
        state[1] = body.y;
        state[2] = body.facing;
        state[3] = body.grounded
          ? body.vx === 0
            ? STATE_IDLE
            : STATE_RUNNING
          : STATE_AIRBORNE;
        player.instanceAttributes.iState.set(state);

        parallax.draw();
        terrain.draw();
        props.draw();
        walkers.draw();
        player.draw();

        if (Math.floor(t * 3) !== Math.floor((t - dt) * 3)) {
          setHud({
            coins: collected,
            total: coins.length,
            instances: slots.length / 2 + gridCells + propCount + level.walkers.length + 1,
          });
        }
      });

      cleanup = () => {
        stop();
        for (const program of programs) program.dispose();
        levelTexture.texture.dispose();
        for (const texture of loaded) texture.dispose();
        renderer.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [tick]);

  return (
    <>
      <canvas ref={canvasRef} className="demo-canvas" />
      <div className="panels">
        <div className="panel">
          <h1>2D Side-scroller</h1>
          <p className="panel-note">
            A pixel-art platformer built the way BroMetal prefers: send the level to the GPU once,
            then animate it there. <strong>A / D</strong> to run, <strong>Space</strong> to jump,
            collect the coins.
          </p>
          <p className="panel-note">
            The coins bob, the flag waves and the enemies patrol from a clock inside the shader, so
            none of that moves a byte. Only the player needs the CPU, because the camera follows him
            and the score has to be read — 16 bytes of him per frame.
          </p>
        </div>
      </div>
      <DemoStats stats={stats}>
        {hud.coins}/{hud.total} coins · {hud.instances} quads submitted · 5 draw calls · 16 B/frame
        instance data
        <br />
        <DemoCredit />
        <br />
        Sprites: Pixel Platformer by{' '}
        <a href="https://kenney.nl/assets/pixel-platformer">Kenney</a> (CC0)
      </DemoStats>
      <BackendBadge backend={backend} />
    </>
  );
}

const CONTROL_KEYS = new Set([
  'w',
  'a',
  'd',
  ' ',
  'arrowup',
  'arrowleft',
  'arrowright',
  'arrowdown',
]);
