/**
 * The scene both sprite demos draw. Shared so the cut-out page and the blended
 * page differ *only* in how they draw it — same sprites, same positions, same
 * camera path, same atlas.
 *
 * Deliberately built to be hostile to the blended technique: the trees are
 * dense enough to overlap constantly, and `FOLIAGE` places clumps close enough
 * together that their quads interpenetrate. Sorting picks one order per sprite,
 * which is the wrong answer for two quads that cross.
 */

/** Tile indices in public/sprites/tiny-town.png (12 x 11 grid of 16px tiles). */
export const TOWN_TILES = {
  /** Plain, tufted, and flowered grass. */
  grass: [0, 1, 2] as const,
  /** Grass with grey stones — sprinkled in for variety. */
  grassPatch: 43,
  /** Round-canopy and conifer trees, orange and green. */
  trees: [15, 16, 27, 28] as const,
  /** A round bush and a leafy sprig. */
  bushes: [5, 17] as const,
  mushrooms: 29,
} as const;

export interface ScenePlant {
  x: number;
  z: number;
  /** World height of the quad; width follows from the tile being square. */
  size: number;
  tile: number;
  tint: readonly [number, number, number];
}

export interface SceneGroundTile {
  x: number;
  z: number;
  tile: number;
}

export interface SpriteScene {
  ground: SceneGroundTile[];
  plants: ScenePlant[];
  /** Half-width of the ground in world units. */
  extent: number;
}

/**
 * Deterministic PRNG so the two demos are pixel-comparable and a reload does
 * not reshuffle the forest. Mulberry32.
 */
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

const GROUND_TILES_PER_SIDE = 32;
/** World size of one ground tile. */
const TILE_SIZE = 1;

export function buildSpriteScene(clumps = 90): SpriteScene {
  const random = rng(0x5eed);
  const extent = (GROUND_TILES_PER_SIDE * TILE_SIZE) / 2;

  const ground: SceneGroundTile[] = [];
  for (let iz = 0; iz < GROUND_TILES_PER_SIDE; iz++) {
    for (let ix = 0; ix < GROUND_TILES_PER_SIDE; ix++) {
      const x = -extent + (ix + 0.5) * TILE_SIZE;
      const z = -extent + (iz + 0.5) * TILE_SIZE;
      const roll = random();
      const tile =
        roll > 0.93
          ? TOWN_TILES.grassPatch
          : TOWN_TILES.grass[Math.floor(random() * TOWN_TILES.grass.length)]!;
      ground.push({ x, z, tile });
    }
  }

  // Clumps rather than a uniform scatter: overlapping quads are the interesting
  // case, and a clump guarantees several per screen wherever the camera looks.
  const plants: ScenePlant[] = [];
  for (let c = 0; c < clumps; c++) {
    const cx = (random() * 2 - 1) * (extent - 2);
    const cz = (random() * 2 - 1) * (extent - 2);
    const members = 3 + Math.floor(random() * 4);
    for (let m = 0; m < members; m++) {
      const angle = random() * Math.PI * 2;
      const radius = random() * 1.4;
      const isTree = random() > 0.42;
      const size = isTree ? 1.7 + random() * 1.1 : 0.75 + random() * 0.4;
      const pool = isTree ? TOWN_TILES.trees : TOWN_TILES.bushes;
      // A slight brightness jitter keeps a wall of identical trees from reading
      // as a texture bug rather than a forest.
      const shade = 0.84 + random() * 0.32;
      plants.push({
        x: cx + Math.cos(angle) * radius,
        z: cz + Math.sin(angle) * radius,
        size,
        tile: pool[Math.floor(random() * pool.length)]!,
        tint: [shade, shade * 1.02, shade * 0.97],
      });
    }
    if (random() > 0.55) {
      plants.push({
        x: cx + (random() * 2 - 1) * 1.6,
        z: cz + (random() * 2 - 1) * 1.6,
        size: 0.5,
        tile: TOWN_TILES.mushrooms,
        tint: [1, 1, 1],
      });
    }
  }

  return { ground, plants, extent };
}

/**
 * Camera path shared by both demos: a slow orbit outside the forest, angled
 * down enough to read as 2.5D but shallow enough that the billboards overlap
 * heavily — overlap is the whole point of the comparison.
 */
export function orbitCamera(
  elapsedSeconds: number,
  extent: number,
): { position: [number, number, number]; target: [number, number, number] } {
  const angle = elapsedSeconds * 0.16;
  const radius = extent * 1.35;
  return {
    position: [Math.cos(angle) * radius, 12, Math.sin(angle) * radius],
    target: [0, 1.2, 0],
  };
}
