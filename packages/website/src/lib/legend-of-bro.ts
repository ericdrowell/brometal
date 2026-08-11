/**
 * Legend of Bro — the game half of the example.
 *
 * Everything here is ordinary TypeScript: the level, the atlas layout, movement,
 * collision and the monsters' wandering. None of it knows BroMetal exists. The
 * demo component turns the result into instance buffers once per frame, and the
 * renderer's only job is to draw a few hundred quads.
 *
 * That split is the point of the example. A 2D game engine is mostly bookkeeping
 * a CPU does well; what a GPU library owes it is one fast way to say "put this
 * cell of that atlas at these coordinates".
 */

/** Pixels per tile, in the source art and in the atlas. */
export const TILE = 16;

/** The atlas is a plain grid of 16px cells, 16 across and 8 down. */
export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 8;

export const SHEETS = {
  floor: '/sprites/TilesetFloor.png',
  nature: '/sprites/TilesetNature.png',
  hero: '/sprites/hero.png',
  slime: '/sprites/slime.png',
  bat: '/sprites/bat.png',
} as const;

export type SheetName = keyof typeof SHEETS;

export interface Blit {
  sheet: SheetName;
  /** Source cell, in tiles. */
  sx: number;
  sy: number;
  /** Size, in tiles. */
  w: number;
  h: number;
  /** Destination cell in the atlas, in tiles. */
  ax: number;
  ay: number;
}

/**
 * How the atlas is assembled from the five source sheets.
 *
 * The pack ships large tilesets; a level this size uses eight tiles and three
 * actors out of them. Compositing the pieces into one 256×128 atlas at load
 * means the whole scene draws from a single texture bind, which is what lets
 * the ground and every sprite share one program.
 *
 * The actor blocks are copied whole: each is 4×4 cells, columns being the facing
 * (down, up, left, right) and rows the four walk frames.
 */
export const ATLAS_BLITS: Blit[] = [
  { sheet: 'floor', sx: 11, sy: 12, w: 1, h: 1, ax: 0, ay: 0 }, // grass
  { sheet: 'floor', sx: 12, sy: 12, w: 1, h: 1, ax: 1, ay: 0 }, // grass, tufted
  { sheet: 'floor', sx: 14, sy: 12, w: 1, h: 1, ax: 2, ay: 0 }, // grass, tufted
  { sheet: 'floor', sx: 12, sy: 8, w: 1, h: 1, ax: 3, ay: 0 }, // dirt
  { sheet: 'nature', sx: 1, sy: 10, w: 1, h: 1, ax: 4, ay: 0 }, // bush
  { sheet: 'nature', sx: 1, sy: 11, w: 1, h: 1, ax: 5, ay: 0 }, // yellow flowers
  { sheet: 'nature', sx: 3, sy: 11, w: 1, h: 1, ax: 6, ay: 0 }, // red flower
  { sheet: 'nature', sx: 7, sy: 12, w: 1, h: 1, ax: 7, ay: 0 }, // rock
  { sheet: 'nature', sx: 0, sy: 0, w: 2, h: 2, ax: 0, ay: 1 }, // tree
  { sheet: 'hero', sx: 0, sy: 0, w: 4, h: 4, ax: 0, ay: 4 },
  { sheet: 'slime', sx: 0, sy: 0, w: 4, h: 4, ax: 4, ay: 4 },
  { sheet: 'bat', sx: 0, sy: 0, w: 4, h: 4, ax: 8, ay: 4 },
];

/** Top-left atlas cell of each thing, in cells. */
export const CELL = {
  grass: [0, 0],
  grassTuftA: [1, 0],
  grassTuftB: [2, 0],
  dirt: [3, 0],
  bush: [4, 0],
  flowerYellow: [5, 0],
  flowerRed: [6, 0],
  rock: [7, 0],
  tree: [0, 1],
  hero: [0, 4],
  slime: [4, 4],
  bat: [8, 4],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * The ground layer, one character per tile.
 *
 * `.` grass · `,` `"` tufted grass · `=` dirt path
 *
 * Authored as text because a tilemap is a picture, and a picture is easier to
 * edit as one. Anything standing on the ground — trees, rocks, flowers — is a
 * prop below rather than a character here, because props are not all one tile
 * and several of them block movement.
 */
export const GROUND = [
  '...".==...."................",.,........',
  '.....==......,."..".,,.....,..."....,.".',
  '.....==,"..,.."....".,.."..........."...',
  '.,...==...........,.."..........,,..."..',
  '...."==..,......,...",,..,...,"......"..',
  '.....==.......".""....."....,...".......',
  '.....==.........,..,.".,,".,...,........',
  ',....=="......".....,.".,...,..........,',
  '.....======================,,....,......',
  '.....======================....,........',
  '........,.,..............==.,...",....""',
  '."....,.,.........,..."..==."...,..,..,.',
  '.....,......,"......"."..==..........,..',
  '.,....,,.......,.........==.,...,.."....',
  '.,"....,....==,...,...,..==......"...,.,',
  '............=="..........==..,..........',
  '..,..,....".==.........".==============.',
  '....,,."....==..".,......==============.',
  '.".,....,...==..."..,...................',
  '............==...,."..,,.....,...."....,',
  '......"...".=="..."......"........,...."',
  '..,"."......==."............".,.,..,....',
  '..".....,.".==..........."..,".,........',
  '.......,...,==......"".."..,"...,...,...',
] as const;

export const MAP_W = GROUND[0]!.length;
export const MAP_H = GROUND.length;

const GROUND_CELL: Record<string, readonly [number, number]> = {
  '.': CELL.grass,
  ',': CELL.grassTuftA,
  '"': CELL.grassTuftB,
  '=': CELL.dirt,
};

export function groundCell(x: number, y: number): readonly [number, number] {
  const row = GROUND[y];
  if (row === undefined) return CELL.grass;
  return GROUND_CELL[row[x] ?? '.'] ?? CELL.grass;
}

export interface Prop {
  cell: readonly [number, number];
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * The blocking box, in tiles, relative to the prop's own top-left. A tree is
   * two tiles of canopy you walk behind and one tile of trunk you do not, so the
   * art size and the collision size are deliberately different numbers.
   */
  solid?: { x: number; y: number; w: number; h: number };
}

const tree = (x: number, y: number): Prop => ({
  cell: CELL.tree,
  x,
  y,
  w: 2,
  h: 2,
  solid: { x: 0.25, y: 1.1, w: 1.5, h: 0.8 },
});

const small = (cell: readonly [number, number], x: number, y: number, solid = false): Prop => ({
  cell,
  x,
  y,
  w: 1,
  h: 1,
  ...(solid ? { solid: { x: 0.1, y: 0.35, w: 0.8, h: 0.6 } } : {}),
});

export const PROPS: Prop[] = [
  // A forest ring hemming the clearing in, then clusters through the middle.
  // Generated to sit clear of the path and of each other — a tree dropped on the
  // trail would block the one route through the level.
  tree(0, 0), tree(2, 0), tree(8, 0), tree(10, 0), tree(12, 0), tree(16, 0),
  tree(18, 0), tree(22, 0), tree(24, 0), tree(26, 0), tree(28, 0), tree(32, 0),
  tree(38, 0), tree(0, 2), tree(38, 2), tree(0, 4), tree(38, 4), tree(0, 6),
  tree(38, 8), tree(38, 10), tree(38, 12), tree(0, 14), tree(0, 16), tree(0, 20),
  tree(38, 20), tree(0, 22), tree(2, 22), tree(4, 22), tree(6, 22), tree(8, 22),
  tree(16, 22), tree(18, 22), tree(22, 22), tree(24, 22), tree(26, 22),
  tree(28, 22), tree(32, 22), tree(36, 22), tree(38, 22),
  tree(2, 7), tree(2, 15), tree(5, 11), tree(8, 3), tree(8, 15), tree(8, 19),
  tree(11, 3), tree(11, 11), tree(14, 3), tree(14, 11), tree(17, 3), tree(17, 15),
  tree(17, 19), tree(20, 3), tree(20, 19), tree(23, 3), tree(26, 3), tree(26, 19),
  tree(29, 3), tree(29, 7), tree(29, 11), tree(29, 19), tree(32, 3), tree(32, 11),
  tree(35, 3), tree(35, 7),
  small(CELL.rock, 11, 22, true), small(CELL.rock, 8, 2, true),
  small(CELL.rock, 32, 9, true), small(CELL.rock, 18, 7, true),
  small(CELL.rock, 20, 17, true), small(CELL.rock, 7, 20, true),
  small(CELL.rock, 24, 13, true), small(CELL.rock, 30, 22, true),
  small(CELL.bush, 7, 2, true), small(CELL.bush, 11, 21, true),
  small(CELL.bush, 33, 19, true), small(CELL.bush, 20, 18, true),
  small(CELL.bush, 23, 5, true), small(CELL.bush, 4, 1, true),
  small(CELL.bush, 34, 20, true),
  small(CELL.flowerRed, 23, 7), small(CELL.flowerRed, 3, 5),
  small(CELL.flowerRed, 20, 16), small(CELL.flowerRed, 9, 5),
  small(CELL.flowerRed, 9, 10), small(CELL.flowerRed, 34, 3),
  small(CELL.flowerYellow, 14, 23), small(CELL.flowerYellow, 24, 10),
  small(CELL.flowerYellow, 17, 6), small(CELL.flowerYellow, 10, 5),
  small(CELL.flowerYellow, 10, 12),
];

/** Facing, matching the atlas column order of every actor sheet. */
export const DOWN = 0;
export const UP = 1;
export const LEFT = 2;
export const RIGHT = 3;

export interface Actor {
  cell: readonly [number, number];
  x: number;
  y: number;
  facing: number;
  /** Distance walked, in tiles — drives the frame so animation tracks movement. */
  walked: number;
  speed: number;
  /** Monsters only: seconds left before choosing a new heading. */
  think: number;
  dx: number;
  dy: number;
}

/** The blocking box every actor shares: their feet, not their whole sprite. */
const FOOT = { x: 0.2, y: 0.55, w: 0.6, h: 0.4 };

export function createHero(): Actor {
  return { cell: CELL.hero, x: 7, y: 7, facing: DOWN, walked: 0, speed: 4.4, think: 0, dx: 0, dy: 0 };
}

const monster = (
  cell: readonly [number, number],
  x: number,
  y: number,
  facing: number,
  speed: number,
): Actor => ({ cell, x, y, facing, walked: 0, speed, think: 0, dx: 0, dy: 0 });

/** Spawns sit on open ground — a monster started inside a tree cannot get out. */
export function createMonsters(): Actor[] {
  return [
    monster(CELL.slime, 13, 6, DOWN, 1.1),
    monster(CELL.slime, 21, 12, LEFT, 1.1),
    monster(CELL.slime, 5, 17, UP, 1.1),
    monster(CELL.slime, 33, 15, RIGHT, 1.1),
    monster(CELL.bat, 16, 10, RIGHT, 2.3),
    monster(CELL.bat, 27, 5, DOWN, 2.3),
    monster(CELL.bat, 6, 13, LEFT, 2.3),
  ];
}

/** Solid boxes, resolved once — props never move. */
export const BLOCKERS: { x: number; y: number; w: number; h: number }[] = PROPS.flatMap((p) =>
  p.solid === undefined
    ? []
    : [{ x: p.x + p.solid.x, y: p.y + p.solid.y, w: p.solid.w, h: p.solid.h }],
);

function overlaps(ax: number, ay: number, aw: number, ah: number, b: (typeof BLOCKERS)[number]): boolean {
  return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;
}

function blocked(x: number, y: number): boolean {
  const bx = x + FOOT.x;
  const by = y + FOOT.y;
  if (bx < 0 || by < 0 || bx + FOOT.w > MAP_W || by + FOOT.h > MAP_H) return true;
  return BLOCKERS.some((b) => overlaps(bx, by, FOOT.w, FOOT.h, b));
}

/**
 * Move an actor, resolving each axis separately.
 *
 * Testing both at once and rejecting the whole step is what makes a character
 * stick to a wall they are only brushing: pressing into a tree while walking
 * along it would cancel the sideways motion too. Resolving x and y one at a time
 * lets the blocked axis fail while the free one still moves, which is what
 * sliding along a surface actually is.
 */
export function moveActor(a: Actor, dx: number, dy: number, dt: number): void {
  const step = a.speed * dt;
  const moved = Math.hypot(dx, dy);
  if (moved === 0) return;

  const nx = (dx / moved) * step;
  const ny = (dy / moved) * step;

  if (!blocked(a.x + nx, a.y)) a.x += nx;
  if (!blocked(a.x, a.y + ny)) a.y += ny;

  a.walked += step;
  // Vertical intent wins ties so diagonal movement picks a stable sprite rather
  // than flickering between two facings on a near-45° heading.
  if (Math.abs(dy) >= Math.abs(dx)) a.facing = dy < 0 ? UP : DOWN;
  else a.facing = dx < 0 ? LEFT : RIGHT;
}

/** Monsters pick a heading, hold it for a beat, then pick again. */
export function wander(m: Actor, dt: number, random: () => number): void {
  m.think -= dt;
  if (m.think <= 0) {
    m.think = 0.9 + random() * 1.8;
    const turn = random();
    if (turn < 0.25) {
      m.dx = 0;
      m.dy = 0;
    } else {
      const angle = random() * Math.PI * 2;
      m.dx = Math.cos(angle);
      m.dy = Math.sin(angle);
    }
  }
  if (m.dx === 0 && m.dy === 0) return;

  const before = m.x + m.y;
  moveActor(m, m.dx, m.dy, dt);
  // Walked into something: turn around now rather than grinding against it for
  // the rest of the interval.
  if (Math.abs(m.x + m.y - before) < 1e-6) m.think = 0;
}

/** Walk frame 0–3, advancing with distance covered rather than wall time. */
export function walkFrame(a: Actor): number {
  return Math.floor(a.walked * 3) % 4;
}

/**
 * A deterministic generator, so the scene looks the same on every load.
 *
 * `Math.random` would make the monsters wander differently each refresh, which
 * is fine for a game and unhelpful for a demo people compare against a
 * screenshot.
 */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
