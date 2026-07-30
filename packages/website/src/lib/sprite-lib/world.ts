/**
 * Scene contents for the 2.3D world.
 *
 * The division is the purpose of the demo. **The terrain, the water, the trees,
 * the rocks and the grass are true 3D geometry.** **The fences, the barrels, the
 * sacks, the mushrooms and the hero are sprites.**
 *
 * Both kinds write to the same depth buffer. A sprite fence can therefore hide a
 * 3D tree, and a 3D tree can hide the fence. The GPU does this for each pixel.
 *
 * `terrainHeight` in `./terrain.ts` gives the position of each object. The ground
 * shader uses the same function to move its vertices.
 */
import { WATER_LEVEL, WORLD_EXTENT, terrainHeight, terrainSlope, walkHeight } from './terrain';

/** Tile indices in public/sprites/tiny-town.png that stay as sprites. */
export const TOWN = {
  /**
   * A rail with a post at each end — self-contained, so it reads as a fence even
   * though each one is its own billboard.
   */
  fence: 82,
  barrel: 107,
  sack: 106,
  mushrooms: 29,
} as const;

/** One instanced 3D mesh: position, uniform scale, yaw, and a colour multiplier. */
export interface MeshInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  tint: readonly [number, number, number];
}

export interface SpriteProp {
  x: number;
  y: number;
  z: number;
  size: number;
  tile: number;
  tint: readonly [number, number, number];
}

export interface World {
  conifers: MeshInstance[];
  bushyTrees: MeshInstance[];
  rocks: MeshInstance[];
  grass: MeshInstance[];
  props: SpriteProp[];
  spawn: readonly [number, number];
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

/**
 * Somewhere a tree can stand: dry, not too steep, inside the world.
 *
 * The 0.52 is generous to the point of being inert — writing `terrainSlope` as a
 * closed-form gradient made it possible to state the bound, and |∇h| tops out at
 * 0.31427 on this field, so in practice only the water test rejects anything.
 * Left as it is because tightening it would move trees for no reason; a field
 * steep enough to matter would need it. The ground shader's cliff band
 * (0.22–0.29) is the threshold that does discriminate, and it was picked against
 * that measured maximum rather than by eye.
 */
function plantable(x: number, z: number, margin: number): boolean {
  if (Math.abs(x) > WORLD_EXTENT - margin || Math.abs(z) > WORLD_EXTENT - margin) return false;
  const h = terrainHeight(x, z);
  return h > WATER_LEVEL + 0.35 && terrainSlope(x, z) < 0.52;
}

export function buildWorld(): World {
  const random = rng(0xf0e57);

  const conifers: MeshInstance[] = [];
  const bushyTrees: MeshInstance[] = [];
  const rocks: MeshInstance[] = [];
  const grass: MeshInstance[] = [];
  const props: SpriteProp[] = [];

  // Trees in clumps rather than a uniform scatter: a forest has clearings, and
  // clumps also guarantee the overlapping-silhouette case the depth buffer is
  // here to resolve.
  for (let clump = 0; clump < 110; clump++) {
    const cx = (random() * 2 - 1) * (WORLD_EXTENT - 6);
    const cz = (random() * 2 - 1) * (WORLD_EXTENT - 6);
    if (!plantable(cx, cz, 5)) continue;
    const members = 2 + Math.floor(random() * 5);
    for (let m = 0; m < members; m++) {
      const angle = random() * Math.PI * 2;
      const radius = random() * 3.4;
      const x = cx + Math.cos(angle) * radius;
      const z = cz + Math.sin(angle) * radius;
      if (!plantable(x, z, 3)) continue;
      const shade = 0.85 + random() * 0.3;
      const instance: MeshInstance = {
        x,
        y: terrainHeight(x, z),
        z,
        scale: 0.85 + random() * 0.7,
        yaw: random() * Math.PI * 2,
        tint: [shade * 0.98, shade, shade * 0.94],
      };
      if (random() > 0.42) {
        conifers.push(instance);
      } else {
        bushyTrees.push(instance);
      }
    }
  }

  // Rocks go anywhere, including the shallows and the steep faces where trees
  // cannot — that is what stops the cliffs reading as bare.
  for (let i = 0; i < 190; i++) {
    const x = (random() * 2 - 1) * (WORLD_EXTENT - 2);
    const z = (random() * 2 - 1) * (WORLD_EXTENT - 2);
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL - 0.9) continue;
    const grey = 0.82 + random() * 0.4;
    rocks.push({
      x,
      // Sunk slightly, so a boulder looks bedded in rather than dropped on top.
      y: h - 0.12,
      z,
      scale: 0.3 + random() * 0.95,
      yaw: random() * Math.PI * 2,
      tint: [grey, grey * 0.99, grey * 1.02],
    });
  }

  // Grass, in patches. Blades are cheap but not free, and a patch reads better
  // than an even sprinkle.
  for (let patch = 0; patch < 420; patch++) {
    const cx = (random() * 2 - 1) * (WORLD_EXTENT - 3);
    const cz = (random() * 2 - 1) * (WORLD_EXTENT - 3);
    if (terrainHeight(cx, cz) < WATER_LEVEL + 0.15) continue;
    const blades = 12 + Math.floor(random() * 24);
    for (let b = 0; b < blades; b++) {
      const x = cx + (random() * 2 - 1) * 2.6;
      const z = cz + (random() * 2 - 1) * 2.6;
      const bh = terrainHeight(x, z);
      if (bh < WATER_LEVEL + 0.05) continue;
      const shade = 0.8 + random() * 0.45;
      grass.push({
        x,
        y: bh - 0.05,
        z,
        scale: 0.55 + random() * 0.75,
        yaw: random() * Math.PI * 2,
        tint: [shade * 0.95, shade, shade * 0.85],
      });
    }
  }

  // --- sprites: these deliberately stay 2D ---

  // Two fence lines that follow the terrain height.
  for (const line of [-9, 11] as const) {
    for (let i = -14; i <= 14; i++) {
      const x = i * 1.05;
      const z = line + Math.sin(i * 0.35) * 1.4;
      if (terrainHeight(x, z) < WATER_LEVEL + 0.3) continue;
      props.push({
        x,
        y: terrainHeight(x, z) + 0.45,
        z,
        size: 0.9,
        tile: TOWN.fence,
        tint: [1, 0.98, 0.94],
      });
    }
  }

  for (let i = 0; i < 44; i++) {
    const x = (random() * 2 - 1) * (WORLD_EXTENT - 5);
    const z = (random() * 2 - 1) * (WORLD_EXTENT - 5);
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.3 || terrainSlope(x, z) > 0.5) continue;
    const roll = random();
    const tile = roll > 0.6 ? TOWN.barrel : roll > 0.32 ? TOWN.sack : TOWN.mushrooms;
    const size = tile === TOWN.mushrooms ? 0.5 : 0.72;
    props.push({ x, y: h + size / 2, z, size, tile, tint: [1, 1, 1] });
  }

  // Spawn on the first dry, gentle spot near the middle.
  let spawn: readonly [number, number] = [0, 0];
  for (let i = 0; i < 400; i++) {
    const x = (random() * 2 - 1) * 12;
    const z = (random() * 2 - 1) * 12;
    if (terrainHeight(x, z) > WATER_LEVEL + 1.1 && terrainSlope(x, z) < 0.3) {
      spawn = [x, z];
      break;
    }
  }

  return { conifers, bushyTrees, rocks, grass, props, spawn, extent: WORLD_EXTENT };
}

export { WATER_LEVEL, WORLD_EXTENT, terrainHeight, walkHeight };
