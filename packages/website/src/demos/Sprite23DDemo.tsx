'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createCamera,
  createCylinder,
  createPlane,
  createProgram,
  createRenderer,
  createRenderTarget,
  createSphere,
  loadTexture,
  type BroMetalProgram,
  type BroMetalTexture,
  type Geometry,
  type RenderTarget,
  type Renderer,
  type RendererBackend,
} from 'brometal';
import groundShader from '@/shaders/world-ground.shader.gen';
import waterShader from '@/shaders/world-water.shader.gen';
import meshShader from '@/shaders/world-mesh.shader.gen';
import grassShader from '@/shaders/world-grass.shader.gen';
import spriteShader from '@/shaders/world-sprite.shader.gen';
import postShader from '@/shaders/world-post.shader.gen';
import {
  QUAD_INDICES,
  QUAD_POSITIONS,
  QUAD_UVS,
  SpriteBatch,
  billboardBasis,
  spriteAtlas,
  uploadSpriteBatch,
} from '@/lib/sprites';
import BackendBadge from '@/components/BackendBadge';
import DemoStats, { useFrameStats } from '@/components/DemoStats';
import DemoCredit from '@/components/DemoCredit';

// ---------------------------------------------------------------------------
// Inlined from what used to be terrain.ts. It had one caller, so it lives
// here rather than in a shared module.
// ---------------------------------------------------------------------------

/**
 * The terrain height field for the 2.3D world.
 *
 * **This function also exists in GLSL and WGSL.** Each world shader declares its
 * own `terrainHeight` helper with the same expression. The vertex shader moves the
 * ground with it. The CPU needs the same result to put a tree, a rock or the hero
 * on that ground. If the two versions differ, the props float above the ground or
 * sink into it.
 *
 * The expression is three sine terms, and not fbm noise, for that reason. The
 * shader language has `sin` and `cos`. The expression is short, so a person can
 * compare the two versions and see that they are the same. There is also no hash
 * function, so no rounding of floats can differ between JavaScript and a GPU. A
 * noise field looks better, but it puts correctness at risk.
 *
 * A shader cannot import a helper from another file. The compiler puts the functions
 * of `brometal/shader-functions` into a shader, but it permits that one module only.
 * That limit is the cause of the duplication.
 */

/** Half-width of the world. Terrain is defined everywhere; this is where it ends. */
const WORLD_EXTENT = 46;

/** Anything below this is under water. */
const WATER_LEVEL = -1.15;

function terrainHeight(x: number, z: number): number {
  return (
    1.55 * Math.sin(x * 0.085) * Math.cos(z * 0.075) +
    0.75 * Math.sin(x * 0.17 + 1.7) * Math.cos(z * 0.155 + 0.6) +
    0.35 * Math.sin((x + z) * 0.26 + 2.4)
  );
}

/** Surface an actor stands on: the ground, or the waterline if it is submerged. */
function walkHeight(x: number, z: number): number {
  return Math.max(terrainHeight(x, z), WATER_LEVEL);
}

/**
 * Steepness at a point: |∇h|. Used to keep trees off the steep faces, where a
 * vertical trunk would visibly intersect the slope.
 *
 * Differentiated by hand rather than sampled. A central difference needs four
 * `terrainHeight` calls — twenty sines and cosines — where the exact gradient
 * needs nine, because `sin` and `cos` of the same four arguments serve both the
 * height and its derivative. The ground shader carries the identical derivation
 * (see `shaders/world-ground.shader.ts`), which matters for the same reason the
 * height itself is duplicated: the CPU decides where a tree may stand and the
 * GPU decides where the cliff rock shows, and they must agree.
 *
 * Worth knowing what this function can return: the three terms bound it at
 * 0.351 in x and 0.324 in z, and sampled on a 0.05 grid over the whole world the
 * realised maximum is 0.31427. Any threshold above that is unreachable — which is
 * why the ground shader's cliff band ends at 0.29.
 */
function terrainSlope(x: number, z: number): number {
  const sinAx = Math.sin(x * 0.085);
  const cosAx = Math.cos(x * 0.085);
  const sinAz = Math.sin(z * 0.075);
  const cosAz = Math.cos(z * 0.075);
  const sinBx = Math.sin(x * 0.17 + 1.7);
  const cosBx = Math.cos(x * 0.17 + 1.7);
  const sinBz = Math.sin(z * 0.155 + 0.6);
  const cosBz = Math.cos(z * 0.155 + 0.6);
  const cosC = Math.cos((x + z) * 0.26 + 2.4);
  const gx = 1.55 * 0.085 * cosAx * cosAz + 0.75 * 0.17 * cosBx * cosBz + 0.35 * 0.26 * cosC;
  const gz =
    -1.55 * 0.075 * sinAx * sinAz - 0.75 * 0.155 * sinBx * sinBz + 0.35 * 0.26 * cosC;
  return Math.hypot(gx, gz);
}

// ---------------------------------------------------------------------------
// Inlined from what used to be world.ts. It had one caller, so it lives
// here rather than in a shared module.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Inlined from what used to be mesh.ts. It had one caller, so it lives
// here rather than in a shared module.
// ---------------------------------------------------------------------------

/**
 * Low-poly meshes for the 2.3D world. Each mesh joins parametric geometries from
 * BroMetal, and then uses **flat shading**.
 *
 * Flat shading gives the style. Remove the indexes from the mesh. Then give the
 * three vertices of each triangle the normal of that triangle. Each face is then
 * one flat plane, and not a smooth gradient.
 *
 * This method increases the vertex count, because no vertex is shared. These
 * meshes have tens of triangles, and instancing draws them thousands of times. The
 * vertex data therefore has a cost of one upload.
 */

// ---------------------------------------------------------------------------
// Inlined from what used to be mesh-batch.ts. It had one caller, so it lives
// here rather than in a shared module.
// ---------------------------------------------------------------------------

/**
 * Packs `MeshInstance` records into the three instance arrays the world-mesh and
 * world-grass shaders expect.
 *
 * The scenery in this world never moves, so these are built once and uploaded
 * once — `draw({ instanceCount })` then draws whatever the count is without the
 * arrays ever being touched again.
 */

interface MeshInstanceArrays {
  /** vec3 per instance */
  positions: Float32Array;
  /** vec2 per instance: uniform scale, yaw in radians */
  scaleYaw: Float32Array;
  /** vec3 per instance */
  tints: Float32Array;
  count: number;
}

function packInstances(instances: readonly MeshInstance[]): MeshInstanceArrays {
  const count = instances.length;
  const positions = new Float32Array(Math.max(count, 1) * 3);
  const scaleYaw = new Float32Array(Math.max(count, 1) * 2);
  const tints = new Float32Array(Math.max(count, 1) * 3);
  for (let i = 0; i < count; i++) {
    const instance = instances[i]!;
    positions[i * 3] = instance.x;
    positions[i * 3 + 1] = instance.y;
    positions[i * 3 + 2] = instance.z;
    scaleYaw[i * 2] = instance.scale;
    scaleYaw[i * 2 + 1] = instance.yaw;
    tints[i * 3] = instance.tint[0];
    tints[i * 3 + 1] = instance.tint[1];
    tints[i * 3 + 2] = instance.tint[2];
  }
  return { positions, scaleYaw, tints, count };
}


/** A mesh ready for a program: no indices, one normal and colour per vertex. */
interface FlatMesh {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** Triangle count × 3. */
  vertexCount: number;
}

interface MeshPart {
  geometry: Geometry;
  translate?: readonly [number, number, number];
  /** Per-axis scale, applied before the translate. */
  scale?: readonly [number, number, number];
  color: readonly [number, number, number];
}

/**
 * Merges parts into one flat-shaded mesh. Each part is scaled, translated, and
 * appended; normals are recomputed per triangle from the transformed positions,
 * so a non-uniform scale cannot leave them wrong the way transforming the
 * originals would.
 */
function mergeFlat(parts: readonly MeshPart[]): FlatMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  for (const part of parts) {
    const [sx, sy, sz] = part.scale ?? [1, 1, 1];
    const [tx, ty, tz] = part.translate ?? [0, 0, 0];
    const source = part.geometry.positions;
    const indices = part.geometry.indices;

    for (let i = 0; i < indices.length; i += 3) {
      const tri: number[][] = [];
      for (let corner = 0; corner < 3; corner++) {
        const v = indices[i + corner]! * 3;
        tri.push([
          source[v]! * sx + tx,
          source[v + 1]! * sy + ty,
          source[v + 2]! * sz + tz,
        ]);
      }
      const [a, b, c] = tri as [number[], number[], number[]];
      const ux = b[0]! - a[0]!;
      const uy = b[1]! - a[1]!;
      const uz = b[2]! - a[2]!;
      const vx = c[0]! - a[0]!;
      const vy = c[1]! - a[1]!;
      const vz = c[2]! - a[2]!;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      // A degenerate triangle (a scaled-to-zero cone cap, say) would contribute
      // a zero normal; skip it rather than shade with garbage.
      if (length < 1e-9) continue;
      for (const vertex of tri) {
        positions.push(vertex[0]!, vertex[1]!, vertex[2]!);
        normals.push(nx, ny, nz);
        colors.push(part.color[0], part.color[1], part.color[2]);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    vertexCount: positions.length / 3,
  };
}

/**
 * A conifer: a tapered trunk under three stacked cones, each a little smaller
 * than the one below. Six radial segments — few enough that the silhouette is
 * visibly faceted, which is the point.
 */
function treeMesh(): FlatMesh {
  const trunk = createCylinder({
    radiusTop: 0.11,
    radiusBottom: 0.17,
    height: 1,
    radialSegments: 6,
  });
  const cone = createCylinder({
    radiusTop: 0,
    radiusBottom: 1,
    height: 1,
    radialSegments: 7,
  });
  const bark: readonly [number, number, number] = [0.36, 0.25, 0.17];
  const dark: readonly [number, number, number] = [0.16, 0.36, 0.22];
  const mid: readonly [number, number, number] = [0.2, 0.45, 0.26];
  const light: readonly [number, number, number] = [0.27, 0.55, 0.3];
  return mergeFlat([
    // createCylinder is centred on the origin, so each part is lifted by half
    // its own height to sit on the one below.
    { geometry: trunk, scale: [1, 0.9, 1], translate: [0, 0.45, 0], color: bark },
    { geometry: cone, scale: [0.62, 1.05, 0.62], translate: [0, 1.35, 0], color: dark },
    { geometry: cone, scale: [0.5, 0.95, 0.5], translate: [0, 1.95, 0], color: mid },
    { geometry: cone, scale: [0.34, 0.8, 0.34], translate: [0, 2.5, 0], color: light },
  ]);
}

/** A rounder deciduous tree: trunk plus two squashed spheres. */
function bushyTreeMesh(): FlatMesh {
  const trunk = createCylinder({
    radiusTop: 0.1,
    radiusBottom: 0.18,
    height: 1,
    radialSegments: 6,
  });
  const blob = createSphere({ radius: 1, widthSegments: 7, heightSegments: 5 });
  return mergeFlat([
    { geometry: trunk, scale: [1, 1.1, 1], translate: [0, 0.55, 0], color: [0.38, 0.27, 0.18] },
    { geometry: blob, scale: [0.72, 0.6, 0.72], translate: [0, 1.5, 0], color: [0.23, 0.47, 0.25] },
    { geometry: blob, scale: [0.5, 0.44, 0.5], translate: [0.14, 2.0, -0.1], color: [0.3, 0.57, 0.3] },
  ]);
}

/**
 * A boulder: a coarse sphere with each vertex pushed in or out by a
 * deterministic hash, so the facets end up irregular rather than a recognisable
 * UV sphere.
 */
function rockMesh(seed = 7): FlatMesh {
  const sphere = createSphere({ radius: 1, widthSegments: 6, heightSegments: 4 });
  const jittered = new Float32Array(sphere.positions);
  for (let v = 0; v < jittered.length; v += 3) {
    const n = hash(v / 3 + seed);
    const scale = 0.74 + n * 0.5;
    jittered[v] = jittered[v]! * scale;
    jittered[v + 1] = jittered[v + 1]! * (0.6 + hash(v + seed) * 0.35);
    jittered[v + 2] = jittered[v + 2]! * scale;
  }
  return mergeFlat([
    {
      geometry: { ...sphere, positions: jittered },
      color: [0.45, 0.45, 0.5],
    },
  ]);
}

/**
 * One grass blade: a tapered strip of three quads, so the vertex shader has
 * enough vertices along its length to bend it into a curve rather than shear it
 * into a straight diagonal.
 */
function grassBladeMesh(): FlatMesh {
  const segments = 3;
  const width = 0.075;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const base: readonly [number, number, number] = [0.22, 0.42, 0.2];
  const tip: readonly [number, number, number] = [0.45, 0.68, 0.32];

  const push = (x: number, y: number): void => {
    positions.push(x, y, 0);
    // Blades are lit as if they face the camera-ish; a true normal on a
    // zero-thickness strip flips as it turns, which reads as flicker.
    normals.push(0, 0.55, 0.84);
    const t = y;
    colors.push(
      base[0] + (tip[0] - base[0]) * t,
      base[1] + (tip[1] - base[1]) * t,
      base[2] + (tip[2] - base[2]) * t,
    );
  };

  for (let s = 0; s < segments; s++) {
    const y0 = s / segments;
    const y1 = (s + 1) / segments;
    const w0 = width * (1 - y0 * 0.85);
    const w1 = width * (1 - y1 * 0.85);
    // Two triangles per segment, CCW seen from +z.
    push(-w0, y0);
    push(w0, y0);
    push(w1, y1);
    push(-w0, y0);
    push(w1, y1);
    push(-w1, y1);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    vertexCount: positions.length / 3,
  };
}

/**
 * A flat grid in the XZ plane, centred on the origin. Y is left at zero: the
 * ground and water shaders displace it themselves, from the same
 * `terrainHeight` the CPU uses to place everything else.
 */
function groundGrid(size: number, segments: number): {
  positions: Float32Array;
  indices: Uint32Array;
} {
  const positions: number[] = [];
  const indices: number[] = [];
  const step = size / segments;
  const half = size / 2;
  for (let iz = 0; iz <= segments; iz++) {
    for (let ix = 0; ix <= segments; ix++) {
      positions.push(-half + ix * step, 0, -half + iz * step);
    }
  }
  const stride = segments + 1;
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      // CCW when viewed from +y.
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}


/** Tile indices in public/sprites/tiny-town.png that stay as sprites. */
const TOWN = {
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
interface MeshInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  tint: readonly [number, number, number];
}

interface SpriteProp {
  x: number;
  y: number;
  z: number;
  size: number;
  tile: number;
  tint: readonly [number, number, number];
}

interface World {
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

function buildWorld(): World {
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


type MeshProgram = BroMetalProgram<
  (typeof meshShader)['attributes'],
  (typeof meshShader)['instanceAttributes'],
  (typeof meshShader)['uniforms']
>;

/** The wizard in public/sprites/tiny-dungeon.png, a 12 x 11 grid of 16px tiles. */
const HERO_TILE = 84;

const WALK_SPEED = 7;
const CAMERA_LAG = 4;
const SUN = new Float32Array([0.48, 0.74, 0.42]);
const SKY: readonly [number, number, number] = [0.55, 0.75, 0.88];
/** Alpha the scene target is cleared to — the sky reads as maximally far. */
const FAR_DEPTH = 400;
/**
 * Segments per side of the terrain and water grids.
 *
 * 96 over 92 world units is a 0.96-unit cell. The height field's shortest
 * wavelength is 2π/(0.26·√2) ≈ 17 units, so that is ~18 samples per wavelength —
 * already far past the point where more vertices change the silhouette. The
 * terrain used to be at 150 (0.61-unit cells), which cost 2.4× the vertex
 * invocations and 480 KiB of startup upload to render the same hills.
 */
const GRID_SEGMENTS = 96;

/**
 * 2.3D: sprite characters and props inside a real 3D world.
 *
 * 2.3D (2D + 3D) is the author's term for this shape, from his Ankity engine.
 *
 * Terrain, water, trees, rocks and grass are actual geometry — a displaced grid,
 * flat-shaded instanced meshes, and instanced blades with wind. Fences, barrels,
 * sacks, mushrooms and the hero stay 2D billboards. Because the cut-out sprites
 * write depth, the two kinds interleave correctly in one depth buffer: the hero
 * walks behind a 3D tree and in front of a sprite fence with nothing sorted.
 *
 * Everything renders into a float target whose **alpha channel carries distance
 * from the camera**, and a fullscreen pass reads that back for depth of field.
 * Note the consequence: every scene program runs with `blend: 'none'`, because
 * alpha is depth here and not coverage — blending against it would dissolve the
 * scene. Transparency comes from `discard()` instead, which is the only reason
 * this arrangement is available at all.
 */
export default function Sprite23DDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const { stats, tick } = useFrameStats();
  const [counts, setCounts] = useState({ trees: 0, rocks: 0, grass: 0, sprites: 0 });
  const keysRef = useRef(new Set<string>());

  const [focus, setFocus] = useState(17);
  const [aperture, setAperture] = useState(22);
  const [vignette, setVignette] = useState(0.74);
  // Refs so the render loop reads the live value without re-running the effect.
  const focusRef = useRef(17);
  const apertureRef = useRef(22);
  const vignetteRef = useRef(0.74);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    const onKeyDown = (event: KeyboardEvent): void => {
      keysRef.current.add(event.key.toLowerCase());
      if (MOVEMENT_KEYS.has(event.key.toLowerCase())) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      keysRef.current.delete(event.key.toLowerCase());
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    void (async () => {
      const renderer = await createRenderer(canvas, { clearColor: [...SKY, 1] });
      if (cancelled) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);

      const atlasTexture = await loadTexture(renderer, '/sprites/tiny-town.png', {
        filter: 'nearest',
        wrap: 'clamp',
      });
      const heroTexture = await loadTexture(renderer, '/sprites/tiny-dungeon.png', {
        filter: 'nearest',
        wrap: 'clamp',
      });
      if (cancelled) {
        atlasTexture.dispose();
        heroTexture.dispose();
        renderer.destroy();
        return;
      }
      const townAtlas = spriteAtlas(atlasTexture, {
        cols: 12,
        rows: 11,
        tileWidth: 16,
        tileHeight: 16,
      });
      const heroAtlas = spriteAtlas(heroTexture, {
        cols: 12,
        rows: 11,
        tileWidth: 16,
        tileHeight: 16,
      });

      const world: World = buildWorld();

      // --- terrain and water: the same flat grid, displaced by two shaders ---
      // Both grids want the same tessellation now, and a grid is nothing but
      // `-half + i * step` — so it is built once. The two programs still get
      // their own GPU buffers (buffers belong to a program in this runtime), but
      // the JS arrays and the loop that fills them are shared.
      //
      // Sharing it is load-bearing, not just tidy: because ground and water are
      // linear over the *same* cells, "is the water under the terrain here?" is
      // decidable at the three corners of a triangle, which is what lets the
      // water shader cull four fifths of itself with no risk of a hole.
      const grid = groundGrid(world.extent * 2, GRID_SEGMENTS);
      const gridIndices = narrowGridIndices(grid.indices, GRID_SEGMENTS);

      const groundProgram = createProgram(renderer, groundShader);
      groundProgram.attributes.aPosition.set(grid.positions);
      groundProgram.setIndices(gridIndices);
      groundProgram.uniforms.uWaterLevel.set(WATER_LEVEL);

      const waterProgram = createProgram(renderer, waterShader);
      waterProgram.attributes.aPosition.set(grid.positions);
      waterProgram.setIndices(gridIndices);
      waterProgram.uniforms.uWaterLevel.set(WATER_LEVEL);

      // --- instanced 3D scenery: one program per mesh ---
      const buildMeshProgram = (
        mesh: FlatMesh,
        instances: ReturnType<typeof packInstances>,
      ): MeshProgram => {
        const program = createProgram(renderer, meshShader);
        program.attributes.aPosition.set(mesh.positions);
        program.attributes.aNormal.set(mesh.normals);
        program.attributes.aColor.set(mesh.colors);
        program.instanceAttributes.iPos.set(instances.positions);
        program.instanceAttributes.iScaleRot.set(resolveYaw(instances));
        program.instanceAttributes.iTint.set(instances.tints);
        return program;
      };
      const conifers = packInstances(world.conifers);
      const bushy = packInstances(world.bushyTrees);
      const rocks = packInstances(world.rocks);
      const coniferProgram = buildMeshProgram(treeMesh(), conifers);
      const bushyProgram = buildMeshProgram(bushyTreeMesh(), bushy);
      const rockProgram = buildMeshProgram(rockMesh(), rocks);

      const grassInstances = packInstances(world.grass);
      const grassMesh = grassBladeMesh();
      const grassProgram = createProgram(renderer, grassShader);
      grassProgram.attributes.aPosition.set(grassMesh.positions);
      grassProgram.attributes.aNormal.set(grassMesh.normals);
      grassProgram.attributes.aColor.set(grassMesh.colors);
      grassProgram.instanceAttributes.iPos.set(grassInstances.positions);
      grassProgram.instanceAttributes.iScaleRot.set(resolveYaw(grassInstances));
      grassProgram.instanceAttributes.iTint.set(grassInstances.tints);
      grassProgram.uniforms.uWind.set(0.42);

      // The sun never moves, so it is uploaded once rather than re-sent to six
      // programs every frame. Only uViewProj, uCamPos and uTime actually change.
      for (const program of [
        groundProgram,
        waterProgram,
        coniferProgram,
        bushyProgram,
        rockProgram,
        grassProgram,
      ]) {
        program.uniforms.uLightDir.set(SUN);
      }

      // --- sprites: props and hero, one program each ---
      const buildSpriteProgram = () => {
        const program = createProgram(renderer, spriteShader);
        program.attributes.aPosition.set(QUAD_POSITIONS);
        program.attributes.aUv.set(QUAD_UVS);
        program.setIndices(QUAD_INDICES);
        program.uniforms.uCutoff.set(0.5);
        return program;
      };
      const propProgram = buildSpriteProgram();
      const heroProgram = buildSpriteProgram();

      const propBatch = new SpriteBatch(townAtlas, Math.max(world.props.length, 1));
      for (const prop of world.props) {
        propBatch.push({
          x: prop.x,
          y: prop.y,
          z: prop.z,
          width: prop.size,
          height: prop.size,
          tile: prop.tile,
          tint: prop.tint,
        });
      }
      // Props never move: one upload, here, and `uploadSpriteBatch` marks the
      // batch clean so nothing re-sends it.
      const propCount = uploadSpriteBatch(propProgram, propBatch);

      const heroBatch = new SpriteBatch(heroAtlas, 4);

      // --- post pass: depth of field + vignette, straight to the screen ---
      const fullscreen = createPlane({ width: 2, height: 2 });
      const postProgram = createProgram(renderer, postShader);
      postProgram.attributes.aPosition.set(fullscreen.positions);
      postProgram.setIndices(fullscreen.indices);

      // The target has to match the canvas, or the scene would be rendered at
      // one aspect and stretched to another. Recreated whenever the drawing
      // buffer changes size.
      let target: RenderTarget | null = null;
      const ensureTarget = (r: Renderer): RenderTarget => {
        const width = Math.max(1, r.canvas.width);
        const height = Math.max(1, r.canvas.height);
        if (target === null || target.width !== width || target.height !== height) {
          target?.dispose();
          target = createRenderTarget(r, { width, height, depth: true });
        }
        return target;
      };

      const hero = { x: world.spawn[0], z: world.spawn[1], facing: 1, bob: 0 };
      const camera = createCamera({ fovY: Math.PI / 4.4, near: 0.4, far: 260 });
      const camPos = new Float32Array([hero.x, 12, hero.z + 17]);
      const camVec = new Float32Array(3);
      const right = new Float32Array(3);
      const up = new Float32Array(3);
      const texel = new Float32Array(2);

      let last = 0;

      const stop = renderer.loop((t) => {
        tick(t);
        const dt = Math.min(Math.max(t - last, 0), 0.05);
        last = t;

        // --- hero walks the terrain; screen-up is -Z ---
        const keys = keysRef.current;
        let moveX = 0;
        let moveZ = 0;
        if (keys.has('a') || keys.has('arrowleft')) moveX -= 1;
        if (keys.has('d') || keys.has('arrowright')) moveX += 1;
        if (keys.has('w') || keys.has('arrowup')) moveZ -= 1;
        if (keys.has('s') || keys.has('arrowdown')) moveZ += 1;
        const moving = moveX !== 0 || moveZ !== 0;
        if (moving) {
          const inv = 1 / Math.hypot(moveX, moveZ);
          hero.x += moveX * inv * WALK_SPEED * dt;
          hero.z += moveZ * inv * WALK_SPEED * dt;
          if (moveX !== 0) hero.facing = moveX > 0 ? 1 : -1;
          hero.bob += dt * 10;
        }
        const limit = world.extent - 2;
        hero.x = Math.min(Math.max(hero.x, -limit), limit);
        hero.z = Math.min(Math.max(hero.z, -limit), limit);
        // walkHeight clamps to the waterline, so crossing a lake wades rather
        // than submerges.
        const groundY = walkHeight(hero.x, hero.z);

        // --- follow camera, smoothed, riding the terrain ---
        const k = 1 - Math.exp(-CAMERA_LAG * dt);
        camPos[0]! += (hero.x - camPos[0]!) * k;
        camPos[1]! += (groundY + 11 - camPos[1]!) * k;
        camPos[2]! += (hero.z + 15 - camPos[2]!) * k;
        camera.setPosition(camPos[0]!, camPos[1]!, camPos[2]!);
        camera.lookAt(hero.x, groundY + 1, hero.z);
        const viewProj = camera.viewProjection(renderer.aspect);
        const view = camera.view();
        camVec[0] = camPos[0]!;
        camVec[1] = camPos[1]!;
        camVec[2] = camPos[2]!;

        // --- hero billboard ---
        const heroSize = 1.2;
        heroBatch.clear();
        heroBatch.push({
          x: hero.x,
          y: groundY + heroSize / 2 + (moving ? Math.abs(Math.sin(hero.bob)) * 0.1 : 0),
          z: hero.z,
          width: heroSize,
          height: heroSize,
          tile: HERO_TILE,
          flipX: hero.facing < 0,
        });
        // The hero is the only thing this demo uploads per frame, and it is one
        // sprite: 13 floats. Passing the batch's backing store instead would
        // upload its whole capacity — four sprites' worth — for the same result.
        const heroCount = uploadSpriteBatch(heroProgram, heroBatch);

        billboardBasis(view, true, right, up);

        const scene = ensureTarget(renderer);

        // Alpha of the clear is the sky's "distance": far enough that the sky
        // defocuses with the rest of the background rather than staying sharp.
        renderer.drawTo(
          scene,
          () => {
            groundProgram.uniforms.uViewProj.set(viewProj);
            groundProgram.uniforms.uCamPos.set(camVec);
            groundProgram.draw();

            waterProgram.uniforms.uViewProj.set(viewProj);
            waterProgram.uniforms.uCamPos.set(camVec);
            waterProgram.uniforms.uTime.set(t);
            waterProgram.draw();

            for (const [program, instances] of [
              [rockProgram, rocks],
              [coniferProgram, conifers],
              [bushyProgram, bushy],
            ] as const) {
              program.uniforms.uViewProj.set(viewProj);
              program.uniforms.uCamPos.set(camVec);
              program.draw({ instanceCount: instances.count });
            }

            grassProgram.uniforms.uViewProj.set(viewProj);
            grassProgram.uniforms.uCamPos.set(camVec);
            grassProgram.uniforms.uTime.set(t);
            grassProgram.draw({ instanceCount: grassInstances.count });

            for (const [program, texture, count] of [
              [propProgram, atlasTexture, propCount],
              [heroProgram, heroTexture, heroCount],
            ] as const) {
              if (count === 0) continue;
              program.uniforms.uViewProj.set(viewProj);
              program.uniforms.uRight.set(right);
              program.uniforms.uUp.set(up);
              program.uniforms.uCamPos.set(camVec);
              program.uniforms.uAtlas.set(texture as BroMetalTexture);
              program.draw({ instanceCount: count });
            }
          },
          { clear: [SKY[0], SKY[1], SKY[2], FAR_DEPTH] },
        );

        texel[0] = 1 / scene.width;
        texel[1] = 1 / scene.height;
        postProgram.uniforms.uScene.set(scene.texture);
        postProgram.uniforms.uTexel.set(texel);
        postProgram.uniforms.uFocus.set(focusRef.current);
        postProgram.uniforms.uAperture.set(apertureRef.current);
        // Wider focus range at long focus distances, so the slider stays usable
        // across the whole depth of the scene instead of snapping at the far end.
        postProgram.uniforms.uFocusRange.set(6 + focusRef.current * 0.5);
        postProgram.uniforms.uVignette.set(vignetteRef.current);
        postProgram.draw();

        if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
          setCounts({
            trees: conifers.count + bushy.count,
            rocks: rocks.count,
            grass: grassInstances.count,
            sprites: propCount + heroCount,
          });
        }
      });

      cleanup = () => {
        stop();
        for (const program of [
          groundProgram,
          waterProgram,
          coniferProgram,
          bushyProgram,
          rockProgram,
          grassProgram,
          propProgram,
          heroProgram,
          postProgram,
        ]) {
          program.dispose();
        }
        target?.dispose();
        atlasTexture.dispose();
        heroTexture.dispose();
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
          <h1>Lens</h1>
          <div className="row">
            <label htmlFor="focus">Focus</label>
            <input
              id="focus"
              type="range"
              min={4}
              max={70}
              step={0.5}
              value={focus}
              onChange={(event) => {
                const value = Number(event.target.value);
                setFocus(value);
                focusRef.current = value;
              }}
            />
            <output htmlFor="focus">{focus.toFixed(0)}m</output>
          </div>
          <div className="row">
            <label htmlFor="aperture">Blur</label>
            <input
              id="aperture"
              type="range"
              min={0}
              max={22}
              step={0.5}
              value={aperture}
              onChange={(event) => {
                const value = Number(event.target.value);
                setAperture(value);
                apertureRef.current = value;
              }}
            />
            <output htmlFor="aperture">{aperture.toFixed(1)}</output>
          </div>
          <div className="row">
            <label htmlFor="vignette">Vignette</label>
            <input
              id="vignette"
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={vignette}
              onChange={(event) => {
                const value = Number(event.target.value);
                setVignette(value);
                vignetteRef.current = value;
              }}
            />
            <output htmlFor="vignette">{vignette.toFixed(2)}</output>
          </div>
          <p className="panel-note">
            Move Focus in and the far hills go soft. Move it out and the near grass goes soft
            instead. Blur at 0 turns the effect off.
          </p>
        </div>
        <div className="panel">
          <h1>2.3D World</h1>
          <p className="panel-note">
            Flat sprite characters standing in a real 3D world. The author of this demo calls that
            shape <strong>2.3D</strong> — 2D plus 3D — in his engine, Ankity. Walk with{' '}
            <strong>WASD</strong> and wade into the lakes.
          </p>
          <p className="panel-note">
            The ground, water, trees, rocks and grass are true geometry. The hero, the fences and the
            barrels are flat pictures. Both kinds write to one depth buffer, so the hero disappears
            behind whatever is really in front of him, pixel by pixel, with nothing sorted.
          </p>
      </div>
      </div>
      <DemoStats stats={stats}>
        {counts.trees} trees · {counts.rocks} rocks · {counts.grass} grass blades ·{' '}
        {counts.sprites} sprites · 9 draw calls
        <br />
        <DemoCredit />
        <br />
        Sprites: Tiny Town + Tiny Dungeon by <a href="https://kenney.nl">Kenney</a> (CC0)
      </DemoStats>
      <BackendBadge backend={backend} />
    </>
  );
}

/**
 * Turns `(scale, yaw)` into `(scale, cos yaw, sin yaw)` for the mesh and grass
 * shaders.
 *
 * A yaw is one float and a resolved rotation is two, so this looks like a step
 * backwards — 9,404 instances, 37 KiB more upload. It is not: a yaw is constant
 * across an instance but the pipeline has no per-instance stage, so the shader
 * would evaluate `cos`/`sin` of it once per *vertex*. That is 159,246 grass
 * vertices plus 139,410 tree and rock vertices every frame paying for two
 * transcendentals each — roughly 600,000 a frame — against 37 KiB uploaded once
 * at startup. Trading a one-time upload for permanent per-vertex trig is the
 * mistake; this is the same trade run the right way round.
 *
 * Done here rather than in `packInstances`, which is shared with the other sprite
 * demos; the proper home for it is `mesh-batch.ts` itself.
 */
function resolveYaw(instances: MeshInstanceArrays): Float32Array {
  const out = new Float32Array(Math.max(instances.count, 1) * 3);
  for (let i = 0; i < instances.count; i++) {
    const yaw = instances.scaleYaw[i * 2 + 1]!;
    out[i * 3] = instances.scaleYaw[i * 2]!;
    out[i * 3 + 1] = Math.cos(yaw);
    out[i * 3 + 2] = Math.sin(yaw);
  }
  return out;
}

/**
 * `groundGrid` hands back a `Uint32Array` whatever the grid size, and
 * `setIndices` picks the GPU element type off the array it is given — so a grid
 * whose highest index is 9,408 ships twice the bytes it needs. 96 segments is
 * 55,296 indices: 216 KiB as u32, 108 KiB as u16, for identical geometry.
 *
 * Narrowed here rather than in `mesh.ts`, which is shared with the other sprite
 * demos; the proper home for this is `groundGrid` itself.
 */
function narrowGridIndices(
  indices: Uint32Array,
  segments: number,
): Uint16Array | Uint32Array {
  const vertexCount = (segments + 1) * (segments + 1);
  return vertexCount <= 65536 ? new Uint16Array(indices) : indices;
}

const MOVEMENT_KEYS = new Set([
  'w',
  'a',
  's',
  'd',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
]);
