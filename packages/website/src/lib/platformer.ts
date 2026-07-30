/**
 * Level data for the side-scroller demo: a hand-shaped run of platforms with
 * coins, foliage and a couple of patrolling walkers.
 *
 * The heightmap is authored rather than generated — a platformer needs jumps
 * that are actually makeable, and that is easier to guarantee by hand than to
 * coax out of noise.
 */

/**
 * Tile indices in public/sprites/platformer.png (20 x 9 grid of 18px tiles).
 *
 * The ground tiles come in runs of four: [both side borders, left border only,
 * no side borders, right border only]. Picking at random inserts a border into
 * the middle of a run and the terrain reads as a grid of separate blocks, so
 * `runTile` below selects by position instead. Row 1 is the grass surface, row 6
 * the buried interior, row 7 the underside.
 */
export const PLATFORMER_TILES = {
  /** Base index of each 4-variant run. */
  surfaceRun: 20,
  interiorRun: 120,
  underRun: 140,
  /** A one-tile-tall column: bordered on top and bottom. */
  loneRun: 0,
  coin: 151,
  flagA: 111,
  flagB: 112,
  /** Tufts, a shrub, a small pine, a cactus. */
  foliage: [124, 125, 126, 127] as const,
  /** Floating platform pieces. */
  platform: 146,
  sign: 84,
} as const;

/** Tile indices in public/sprites/platformer-characters.png (9 x 3 of 24px). */
export const CHAR_TILES = {
  playerIdle: 0,
  playerWalk: 1,
  greenFoeIdle: 24,
  greenFoeWalk: 25,
  blueFoe: 18,
} as const;

/** Tile indices in public/sprites/platformer-backgrounds.png (8 x 3 of 24px). */
export const BACKGROUND_TILES = {
  /** Horizon band: clouds, then clouds with trees. */
  band: [8, 9, 10, 11] as const,
  /** Solid haze below the horizon. */
  fill: 16,
  /** Matches tile 16 so the strip and the clear colour meet invisibly. */
  fillColor: [0.761, 0.89, 0.91] as const,
  /** Matches tile 0 — the renderer's clear colour. */
  skyColor: [0.875, 0.965, 0.961] as const,
} as const;

/**
 * Picks the variant of a 4-tile run that borders only the sides that are
 * actually exposed.
 */
export function runTile(base: number, openLeft: boolean, openRight: boolean): number {
  // base+0 carries borders on both sides, +1 on the left, +3 on the right, and
  // +2 on neither — so the variant is chosen by which sides are exposed.
  if (openLeft && openRight) return base;
  if (openLeft) return base + 1;
  if (openRight) return base + 3;
  return base + 2;
}

export interface LevelTile {
  x: number;
  y: number;
  tile: number;
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
  tiles: LevelTile[];
  decor: LevelTile[];
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

const FLOATING: readonly (readonly [number, number, number])[] = [
  // x, y, width in tiles
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

  const tiles: LevelTile[] = [];
  const solid = new Set<string>();
  const key = (cx: number, cy: number): string => `${cx},${cy}`;

  const filled = (column: number, row: number): boolean => {
    const height = heights[column];
    return height !== null && height !== undefined && row <= height && row >= 0;
  };

  for (let column = 0; column < width; column++) {
    const height = heights[column];
    if (height === null || height === undefined) continue;
    for (let row = 0; row <= height; row++) {
      // A side is "open" — and so needs the bordered variant — when the
      // neighbouring column has no tile at this row.
      const openLeft = !filled(column - 1, row);
      const openRight = !filled(column + 1, row);
      const base =
        row === height
          ? height === 0
            ? PLATFORMER_TILES.loneRun
            : PLATFORMER_TILES.surfaceRun
          : row === 0
            ? PLATFORMER_TILES.underRun
            : PLATFORMER_TILES.interiorRun;
      tiles.push({
        x: column + 0.5,
        y: row + 0.5,
        tile: runTile(base, openLeft, openRight),
      });
      solid.add(key(column, row));
    }
  }

  for (const [x, y, span] of FLOATING) {
    for (let i = 0; i < span; i++) {
      tiles.push({ x: x + i + 0.5, y: y + 0.5, tile: PLATFORMER_TILES.platform });
      solid.add(key(x + i, y));
    }
  }

  // Decor sits on the surface, never in a gap.
  const decor: LevelTile[] = [];
  for (let column = 1; column < width - 1; column++) {
    const height = heights[column];
    if (height === null || height === undefined) continue;
    if (random() > 0.72) {
      decor.push({
        x: column + 0.5,
        y: height + 1.5,
        tile:
          PLATFORMER_TILES.foliage[Math.floor(random() * PLATFORMER_TILES.foliage.length)]!,
      });
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
    tiles,
    decor,
    coins,
    walkers,
    flag,
    solidAt(x: number, y: number, halfWidth: number, halfHeight: number): boolean {
      const minX = Math.floor(x - halfWidth);
      const maxX = Math.floor(x + halfWidth);
      const minY = Math.floor(y - halfHeight);
      const maxY = Math.floor(y + halfHeight);
      for (let cy = minY; cy <= maxY; cy++) {
        for (let cx = minX; cx <= maxX; cx++) {
          if (solid.has(key(cx, cy))) return true;
        }
      }
      return false;
    },
  };
}
