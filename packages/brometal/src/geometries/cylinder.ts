import { buildGeometry, gridPatch, type Geometry } from './types.js';

export interface CylinderOptions {
  radiusTop?: number;
  radiusBottom?: number;
  height?: number;
  radialSegments?: number;
  openEnded?: boolean;
}

export function createCylinder(options: CylinderOptions = {}): Geometry {
  const radiusTop = options.radiusTop ?? 1;
  const radiusBottom = options.radiusBottom ?? 1;
  const height = options.height ?? 2;
  const radialSegments = Math.max(3, Math.floor(options.radialSegments ?? 96));
  const openEnded = options.openEnded ?? false;
  const halfHeight = height / 2;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Side wall: two rows, top first, so gridPatch's default winding faces out.
  const slope = (radiusBottom - radiusTop) / height;
  for (let iy = 0; iy <= 1; iy++) {
    const radius = iy === 0 ? radiusTop : radiusBottom;
    const y = iy === 0 ? halfHeight : -halfHeight;
    for (let ix = 0; ix <= radialSegments; ix++) {
      const u = ix / radialSegments;
      const theta = u * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      positions.push(radius * sin, y, radius * cos);
      const invLength = 1 / Math.hypot(sin, slope, cos);
      normals.push(sin * invLength, slope * invLength, cos * invLength);
      uvs.push(u, iy === 0 ? 1 : 0);
    }
  }
  gridPatch(indices, 1, radialSegments);

  if (!openEnded) {
    addCap(positions, normals, uvs, indices, radiusTop, halfHeight, radialSegments, 1);
    addCap(positions, normals, uvs, indices, radiusBottom, -halfHeight, radialSegments, -1);
  }

  return buildGeometry(positions, normals, uvs, indices);
}

function addCap(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  radius: number,
  y: number,
  radialSegments: number,
  direction: 1 | -1,
): void {
  if (radius === 0) return;
  const center = positions.length / 3;
  positions.push(0, y, 0);
  normals.push(0, direction, 0);
  uvs.push(0.5, 0.5);
  for (let ix = 0; ix <= radialSegments; ix++) {
    const theta = (ix / radialSegments) * Math.PI * 2;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    positions.push(radius * sin, y, radius * cos);
    normals.push(0, direction, 0);
    uvs.push(0.5 + sin / 2, 0.5 + (cos / 2) * direction);
  }
  for (let ix = 0; ix < radialSegments; ix++) {
    const ring = center + 1 + ix;
    if (direction === 1) {
      indices.push(center, ring, ring + 1);
    } else {
      indices.push(center, ring + 1, ring);
    }
  }
}
