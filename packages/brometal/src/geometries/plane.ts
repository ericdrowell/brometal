import { buildGeometry, gridPatch, type Geometry } from './types.js';

export interface PlaneOptions {
  width?: number;
  height?: number;
  widthSegments?: number;
  heightSegments?: number;
}

/** A flat grid in the XY plane facing +z. */
export function createPlane(options: PlaneOptions = {}): Geometry {
  const width = options.width ?? 2;
  const height = options.height ?? 2;
  const widthSegments = Math.max(1, Math.floor(options.widthSegments ?? 1));
  const heightSegments = Math.max(1, Math.floor(options.heightSegments ?? 1));

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= heightSegments; iy++) {
    const v = iy / heightSegments;
    const y = -height / 2 + v * height;
    for (let ix = 0; ix <= widthSegments; ix++) {
      const u = ix / widthSegments;
      positions.push(-width / 2 + u * width, y, 0);
      normals.push(0, 0, 1);
      uvs.push(u, v);
    }
  }

  // Rows advance upward (+y), so the winding is flipped relative to
  // top-down grids like the sphere's.
  gridPatch(indices, heightSegments, widthSegments, { flip: true });
  return buildGeometry(positions, normals, uvs, indices);
}
