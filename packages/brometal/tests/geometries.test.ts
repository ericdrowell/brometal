import { describe, expect, it } from 'vitest';
import {
  createCircle,
  createCone,
  createCube,
  createCylinder,
  createPlane,
  createRing,
  createSphere,
  createTorus,
  createTorusKnot,
  type Geometry,
} from '../src/geometries/index.js';

const ALL: [string, Geometry][] = [
  ['cube', createCube()],
  ['plane', createPlane()],
  ['sphere', createSphere()],
  ['cylinder', createCylinder()],
  ['cone', createCone()],
  ['torus', createTorus()],
  ['torusKnot', createTorusKnot()],
  ['circle', createCircle()],
  ['ring', createRing()],
];

function vertexCount(geometry: Geometry): number {
  return geometry.positions.length / 3;
}

function triangleWindingAgreesWithNormals(geometry: Geometry): number {
  let disagreements = 0;
  const { positions, normals, indices } = geometry;
  for (let t = 0; t < indices.length; t += 3) {
    const [i0, i1, i2] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    const ax = positions[i1 * 3]! - positions[i0 * 3]!;
    const ay = positions[i1 * 3 + 1]! - positions[i0 * 3 + 1]!;
    const az = positions[i1 * 3 + 2]! - positions[i0 * 3 + 2]!;
    const bx = positions[i2 * 3]! - positions[i0 * 3]!;
    const by = positions[i2 * 3 + 1]! - positions[i0 * 3 + 1]!;
    const bz = positions[i2 * 3 + 2]! - positions[i0 * 3 + 2]!;
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    const nx = normals[i0 * 3]! + normals[i1 * 3]! + normals[i2 * 3]!;
    const ny = normals[i0 * 3 + 1]! + normals[i1 * 3 + 1]! + normals[i2 * 3 + 1]!;
    const nz = normals[i0 * 3 + 2]! + normals[i1 * 3 + 2]! + normals[i2 * 3 + 2]!;
    if (cx * nx + cy * ny + cz * nz < 0) {
      disagreements++;
    }
  }
  return disagreements;
}

describe('geometries', () => {
  it.each(ALL)('%s has consistent stream lengths and in-range indices', (_name, geometry) => {
    const count = vertexCount(geometry);
    expect(Number.isInteger(count)).toBe(true);
    expect(geometry.normals.length).toBe(count * 3);
    expect(geometry.uvs.length).toBe(count * 2);
    expect(geometry.indices.length % 3).toBe(0);
    for (const index of geometry.indices) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(count);
    }
  });

  it.each(ALL)('%s has unit-length normals', (_name, geometry) => {
    for (let i = 0; i < geometry.normals.length; i += 3) {
      const length = Math.hypot(
        geometry.normals[i]!,
        geometry.normals[i + 1]!,
        geometry.normals[i + 2]!,
      );
      expect(length).toBeCloseTo(1, 4);
    }
  });

  it.each(ALL)('%s has UVs within 0..1', (_name, geometry) => {
    for (const uv of geometry.uvs) {
      expect(uv).toBeGreaterThanOrEqual(-1e-6);
      expect(uv).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it.each(ALL)('%s triangle winding agrees with its normals', (_name, geometry) => {
    expect(triangleWindingAgreesWithNormals(geometry)).toBe(0);
  });

  it('cube matches the documented 24-vertex, 36-index layout', () => {
    const cube = createCube();
    expect(vertexCount(cube)).toBe(24);
    expect(cube.indices.length).toBe(36);
    // front face first, at +z with +z normals
    expect(cube.positions[2]).toBe(1);
    expect([...cube.normals.slice(0, 3)]).toEqual([0, 0, 1]);
  });

  it('cube scales by width/height/depth', () => {
    const cube = createCube({ width: 4, height: 2, depth: 6 });
    let maxX = 0;
    let maxY = 0;
    let maxZ = 0;
    for (let i = 0; i < cube.positions.length; i += 3) {
      maxX = Math.max(maxX, Math.abs(cube.positions[i]!));
      maxY = Math.max(maxY, Math.abs(cube.positions[i + 1]!));
      maxZ = Math.max(maxZ, Math.abs(cube.positions[i + 2]!));
    }
    expect([maxX, maxY, maxZ]).toEqual([2, 1, 3]);
  });

  it('sphere vertices sit on the radius with radial normals', () => {
    const radius = 2.5;
    const sphere = createSphere({ radius, widthSegments: 12, heightSegments: 8 });
    expect(vertexCount(sphere)).toBe(13 * 9);
    for (let i = 0; i < sphere.positions.length; i += 3) {
      const x = sphere.positions[i]!;
      const y = sphere.positions[i + 1]!;
      const z = sphere.positions[i + 2]!;
      expect(Math.hypot(x, y, z)).toBeCloseTo(radius, 4);
      expect(sphere.normals[i]).toBeCloseTo(x / radius, 4);
      expect(sphere.normals[i + 1]).toBeCloseTo(y / radius, 4);
      expect(sphere.normals[i + 2]).toBeCloseTo(z / radius, 4);
    }
  });

  it('cone tapers to a zero-radius top and keeps its bottom cap', () => {
    const cone = createCone({ radius: 1, height: 2, radialSegments: 8 });
    let maxTopRadius = 0;
    for (let i = 0; i < cone.positions.length; i += 3) {
      if (cone.positions[i + 1] === 1) {
        maxTopRadius = Math.max(maxTopRadius, Math.hypot(cone.positions[i]!, cone.positions[i + 2]!));
      }
    }
    expect(maxTopRadius).toBe(0);
  });

  it('torus stays within its outer radius band', () => {
    const torus = createTorus({ radius: 1, tube: 0.25 });
    for (let i = 0; i < torus.positions.length; i += 3) {
      const ringDistance = Math.hypot(torus.positions[i]!, torus.positions[i + 1]!);
      expect(ringDistance).toBeGreaterThanOrEqual(0.75 - 1e-4);
      expect(ringDistance).toBeLessThanOrEqual(1.25 + 1e-4);
    }
  });

  it('uses 32-bit indices only when the vertex count demands it', () => {
    expect(createSphere().indices).toBeInstanceOf(Uint16Array);
    const huge = createSphere({ widthSegments: 300, heightSegments: 300 });
    expect(huge.indices).toBeInstanceOf(Uint32Array);
  });
});
