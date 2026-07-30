/**
 * The 2.5D world: a grass clearing with paths, tree clumps, fences and props.
 *
 * Laid out so the hero has room to walk *between* overlapping billboards —
 * that is the situation the cut-out path handles and sprite sorting cannot,
 * so the scene should keep offering it.
 */

/** Tile indices in public/sprites/tiny-town.png (12 x 11 grid of 16px tiles). */
export const TOWN = {
  grass: [0, 1, 2] as const,
  grassStones: 43,
  path: [39, 40, 41] as const,
  trees: [15, 16, 27, 28] as const,
  bushes: [5, 17] as const,
  mushrooms: 29,
  /** A rail with a post at each end — self-contained, so it reads as a fence
   *  even though each one is its own billboard. */
  fence: 82,
  barrel: 107,
  sack: 106,
  well: 104,
} as const;

export interface GroundCell {
  x: number;
  z: number;
  tile: number;
}

export interface Prop {
  x: number;
  z: number;
  /** World height of the billboard; the tiles are square so width matches. */
  size: number;
  tile: number;
  tint: readonly [number, number, number];
}

export interface Village {
  ground: GroundCell[];
  props: Prop[];
  /** Half-width of the world in world units. */
  extent: number;
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

const TILES_PER_SIDE = 36;

export function buildVillage(): Village {
  const random = rng(0xa11e7);
  const extent = TILES_PER_SIDE / 2;

  // A cross of paths through the middle, so the clearing has structure and the
  // hero has an obvious place to walk.
  const onPath = (x: number, z: number): boolean =>
    Math.abs(x) < 1.6 || Math.abs(z) < 1.6 || Math.abs(Math.abs(x) - Math.abs(z)) < 1.1;

  const ground: GroundCell[] = [];
  for (let iz = 0; iz < TILES_PER_SIDE; iz++) {
    for (let ix = 0; ix < TILES_PER_SIDE; ix++) {
      const x = -extent + ix + 0.5;
      const z = -extent + iz + 0.5;
      let tile: number;
      if (onPath(x, z)) {
        tile = TOWN.path[Math.floor(random() * TOWN.path.length)]!;
      } else if (random() > 0.94) {
        tile = TOWN.grassStones;
      } else {
        tile = TOWN.grass[Math.floor(random() * TOWN.grass.length)]!;
      }
      ground.push({ x, z, tile });
    }
  }

  const props: Prop[] = [];
  const clear = (x: number, z: number): boolean => !onPath(x, z);

  // Tree clumps away from the paths.
  for (let c = 0; c < 70; c++) {
    const cx = (random() * 2 - 1) * (extent - 2);
    const cz = (random() * 2 - 1) * (extent - 2);
    if (!clear(cx, cz)) continue;
    const members = 2 + Math.floor(random() * 4);
    for (let m = 0; m < members; m++) {
      const angle = random() * Math.PI * 2;
      const radius = random() * 1.5;
      const x = cx + Math.cos(angle) * radius;
      const z = cz + Math.sin(angle) * radius;
      const isTree = random() > 0.35;
      const shade = 0.84 + random() * 0.3;
      props.push({
        x,
        z,
        size: isTree ? 1.6 + random() * 0.9 : 0.75 + random() * 0.3,
        tile: isTree
          ? TOWN.trees[Math.floor(random() * TOWN.trees.length)]!
          : TOWN.bushes[Math.floor(random() * TOWN.bushes.length)]!,
        tint: [shade, shade * 1.02, shade * 0.97],
      });
    }
  }

  // A fence line either side of the north path — something to walk behind.
  for (let i = -7; i <= 7; i++) {
    if (Math.abs(i) < 2) continue;
    for (const z of [-4.5, 4.5] as const) {
      props.push({ x: i * 1.0, z, size: 0.9, tile: TOWN.fence, tint: [1, 0.98, 0.94] });
    }
  }

  // Scattered small props, and mushrooms in the grass.
  for (let i = 0; i < 26; i++) {
    const x = (random() * 2 - 1) * (extent - 3);
    const z = (random() * 2 - 1) * (extent - 3);
    const tile =
      random() > 0.6 ? TOWN.barrel : random() > 0.5 ? TOWN.sack : TOWN.mushrooms;
    props.push({ x, z, size: tile === TOWN.mushrooms ? 0.55 : 0.75, tile, tint: [1, 1, 1] });
  }

  return { ground, props, extent };
}
