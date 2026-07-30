/**
 * A small room-and-corridor dungeon for the top-down demo.
 *
 * Deliberately plain: rectangles joined by L-shaped corridors, walls stamped
 * wherever a floor cell borders solid rock. The interesting part of the demo is
 * how the sprites are *drawn*, not the generator.
 *
 * The output is shaped for a GPU that reads the level itself. Instead of a list
 * of cell objects the demo has to walk every frame, the grid is two parallel
 * byte arrays that go straight into an RGBA8 data texture, and everything else
 * (props, torches, patrols) is a grid coordinate — so the whole level uploads
 * once and the vertex shader looks up its own cell from then on.
 *
 * The generator stays on the CPU. It is a global, sequential algorithm — each
 * room tested against all previous, each corridor joining consecutive centres —
 * so it is not a function of position, and `walkable()` is gameplay: with no
 * GPU-to-CPU readback, the answer has to exist here regardless.
 */

/** Tile indices in public/sprites/tiny-dungeon.png (12 x 11 grid of 16px tiles). */
export const DUNGEON_TILES = {
  floor: [48, 49, 50, 51] as const,
  floorWorn: [52, 53] as const,
  /**
   * The wall tiles are a run set. Each tile has a dark border on the sides that
   * the artist drew as exposed masonry:
   *
   *   wallBoth  (58) has a border on the left and the right.
   *   wallLeft  (57) has a border on the left only.
   *   wallRight (59) has a border on the right only.
   *   wallMid   (40) has no side border.
   *   wallVent  (28) has no side border. It shows a barred vent.
   *
   * Select the tile from the neighbour cells. Do not select it at random. A random
   * selection puts a border in the middle of a wall. Then the wall looks like
   * many separate blocks.
   */
  wallBoth: 58,
  wallLeft: 57,
  wallRight: 59,
  wallMid: 40,
  wallVent: 28,
  torch: 29,
  crate: 63,
  table: 72,
  stool: 73,
  chest: 89,
  chestOpen: 90,
  potion: 114,
  hero: 84,
  ghost: 108,
  wraith: 121,
  spider: 122,
  imp: 110,
} as const;

/** What stands in a grid slot. Matches the `kind` byte the shader decodes. */
export const CELL = { empty: 0, floor: 1, wall: 2 } as const;

/** A prop's grid column and row, not its world centre — the shader adds the half. */
export interface DungeonProp {
  x: number;
  y: number;
  tile: number;
}

/**
 * A monster's patrol loop as a rectangle. The CPU used to walk four waypoints
 * and integrate toward the next one; the shader evaluates the perimeter as a
 * closed form of time, which needs no state and so needs no upload.
 */
export interface PatrolRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Dungeon {
  width: number;
  height: number;
  /** One byte per grid slot, row-major: a `CELL` value. */
  kinds: Uint8Array;
  /** Atlas tile index per grid slot, row-major. Zero where `kinds` is empty. */
  tiles: Uint8Array;
  /**
   * Slots that actually contain something. The demo compacts to exactly this
   * many terrain instances at load, so nothing degenerate is ever submitted.
   */
  filled: number;
  props: DungeonProp[];
  /** Torch grid cells. Both coordinates fit a byte on a 46 x 34 map. */
  torches: [number, number][];
  patrols: PatrolRect[];
  /** Hero start, in world units. */
  spawn: [number, number];
  /** True where an actor may stand. Takes world coordinates. */
  walkable(x: number, y: number): boolean;
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

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

const WIDTH = 46;
const HEIGHT = 34;

export function buildDungeon(): Dungeon {
  const random = rng(0xd0e7);
  const floor: boolean[] = new Array(WIDTH * HEIGHT).fill(false);
  const at = (x: number, y: number): number => y * WIDTH + x;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;

  const rooms: Room[] = [];
  const attempts = 40;
  for (let i = 0; i < attempts && rooms.length < 9; i++) {
    const w = 5 + Math.floor(random() * 7);
    const h = 4 + Math.floor(random() * 6);
    const x = 2 + Math.floor(random() * (WIDTH - w - 4));
    const y = 2 + Math.floor(random() * (HEIGHT - h - 4));
    const candidate = { x, y, w, h };
    // One cell of padding so two rooms never share a wall.
    const clash = rooms.some(
      (room) =>
        x < room.x + room.w + 1 &&
        x + w + 1 > room.x &&
        y < room.y + room.h + 1 &&
        y + h + 1 > room.y,
    );
    if (clash) continue;
    rooms.push(candidate);
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        floor[at(rx, ry)] = true;
      }
    }
  }

  // L-shaped corridors between consecutive room centres.
  for (let i = 1; i < rooms.length; i++) {
    const a = center(rooms[i - 1]!);
    const b = center(rooms[i]!);
    const horizontalFirst = random() > 0.5;
    const corner: [number, number] = horizontalFirst ? [b[0], a[1]] : [a[0], b[1]];
    carveLine(floor, at, a, corner);
    carveLine(floor, at, corner, b);
  }

  // A wall goes in each solid cell that touches a floor cell. The result is one
  // ring around all of the floor.
  //
  // The output is two byte arrays, not a list of cell objects. The only consumer
  // is an RGBA8 data texture. The shader reads one cell of it per instance.
  const kinds = new Uint8Array(WIDTH * HEIGHT);
  const tiles = new Uint8Array(WIDTH * HEIGHT);
  let filled = 0;

  // Pass 1 marks each cell as floor or wall, and gives the floor cells a tile.
  // The wall tiles need a second pass. A wall tile depends on the cells to its
  // left and right, and those cells are not marked yet.
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const slot = at(x, y);
      if (floor[slot] === true) {
        const worn = random() > 0.86;
        const pool = worn ? DUNGEON_TILES.floorWorn : DUNGEON_TILES.floor;
        kinds[slot] = CELL.floor;
        tiles[slot] = pool[Math.floor(random() * pool.length)]!;
        filled++;
        continue;
      }
      let touchesFloor = false;
      for (let oy = -1; oy <= 1 && !touchesFloor; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (inside(x + ox, y + oy) && floor[at(x + ox, y + oy)] === true) {
            touchesFloor = true;
            break;
          }
        }
      }
      if (touchesFloor) {
        kinds[slot] = CELL.wall;
        filled++;
      }
    }
  }

  // Pass 2 gives each wall cell its tile.
  //
  // A side is exposed if the cell on that side is not a wall. Masonry continues
  // through a neighbour wall, so a shared side gets no border.
  const isWall = (x: number, y: number): boolean =>
    inside(x, y) && kinds[at(x, y)] === CELL.wall;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const slot = at(x, y);
      if (kinds[slot] !== CELL.wall) continue;
      const openLeft = !isWall(x - 1, y);
      const openRight = !isWall(x + 1, y);
      if (openLeft && openRight) {
        tiles[slot] = DUNGEON_TILES.wallBoth;
      } else if (openLeft) {
        tiles[slot] = DUNGEON_TILES.wallLeft;
      } else if (openRight) {
        tiles[slot] = DUNGEON_TILES.wallRight;
      } else {
        // Both sides are shared. Use the vent tile sometimes. It breaks up a long
        // wall without a border.
        tiles[slot] = random() > 0.88 ? DUNGEON_TILES.wallVent : DUNGEON_TILES.wallMid;
      }
    }
  }

  // Props and torches inside rooms, never on a room's own edge ring.
  const props: DungeonProp[] = [];
  const torches: [number, number][] = [];
  const propTiles = [
    DUNGEON_TILES.crate,
    DUNGEON_TILES.table,
    DUNGEON_TILES.stool,
    DUNGEON_TILES.chest,
    DUNGEON_TILES.potion,
  ];
  for (const room of rooms) {
    const count = 1 + Math.floor(random() * 3);
    for (let i = 0; i < count; i++) {
      props.push({
        x: room.x + 1 + Math.floor(random() * Math.max(room.w - 2, 1)),
        y: room.y + 1 + Math.floor(random() * Math.max(room.h - 2, 1)),
        tile: propTiles[Math.floor(random() * propTiles.length)]!,
      });
    }
    // Torch on the room's top wall, which is the ring just outside the floor.
    torches.push([room.x + Math.floor(room.w / 2), room.y + room.h]);
  }

  // Patrols: a loop around the inside of each room after the first.
  const patrols: PatrolRect[] = rooms.slice(1).map((room) => ({
    x0: room.x + 1.5,
    y0: room.y + 1.5,
    x1: room.x + room.w - 1.5,
    y1: room.y + room.h - 1.5,
  }));

  const first = rooms[0] ?? { x: 2, y: 2, w: 4, h: 4 };
  const spawn: [number, number] = [first.x + first.w / 2, first.y + first.h / 2];

  return {
    width: WIDTH,
    height: HEIGHT,
    kinds,
    tiles,
    filled,
    props,
    torches,
    patrols,
    spawn,
    walkable(x: number, y: number): boolean {
      // Half a tile of body radius, so the sprite never straddles a wall.
      const r = 0.34;
      for (const [ox, oy] of [
        [-r, -r],
        [r, -r],
        [-r, r],
        [r, r],
      ] as const) {
        const cx = Math.floor(x + ox);
        const cy = Math.floor(y + oy);
        if (!inside(cx, cy) || floor[at(cx, cy)] !== true) return false;
      }
      return true;
    },
  };
}

function center(room: Room): [number, number] {
  return [Math.floor(room.x + room.w / 2), Math.floor(room.y + room.h / 2)];
}

function carveLine(
  floor: boolean[],
  at: (x: number, y: number) => number,
  from: readonly [number, number],
  to: readonly [number, number],
): void {
  const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(from[0] + ((to[0] - from[0]) * i) / Math.max(steps, 1));
    const y = Math.round(from[1] + ((to[1] - from[1]) * i) / Math.max(steps, 1));
    // Two cells wide so corridors read as corridors, not scratches.
    floor[at(x, y)] = true;
    floor[at(x, Math.min(y + 1, HEIGHT - 1))] = true;
  }
}
