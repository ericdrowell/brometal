/**
 * Stylized low-poly meshes for the 2.5D world, built by composing BroMetal's
 * parametric geometries and then **flat-shading** them.
 *
 * Flat shading is what makes the look: de-index the mesh and give all three
 * vertices of each triangle that triangle's own normal, so every facet reads as
 * a single flat plane instead of a smooth gradient. It costs vertex count — no
 * sharing — but these meshes are tens of triangles and drawn thousands of times
 * by instancing, so the vertex data is paid for once.
 */
import { createCylinder, createSphere, type Geometry } from 'brometal';

/** A mesh ready for a program: no indices, one normal and colour per vertex. */
export interface FlatMesh {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** Triangle count × 3. */
  vertexCount: number;
}

export interface MeshPart {
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
export function mergeFlat(parts: readonly MeshPart[]): FlatMesh {
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
export function treeMesh(): FlatMesh {
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
export function bushyTreeMesh(): FlatMesh {
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
export function rockMesh(seed = 7): FlatMesh {
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
export function grassBladeMesh(): FlatMesh {
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
export function groundGrid(size: number, segments: number): {
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
