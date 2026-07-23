import { buildGeometry, gridPatch, type Geometry } from './types.js';

export interface SphereOptions {
  radius?: number;
  widthSegments?: number;
  heightSegments?: number;
}

/** A UV sphere: latitude rows from the top pole down. */
export function createSphere(options: SphereOptions = {}): Geometry {
  const radius = options.radius ?? 1;
  const widthSegments = Math.max(3, Math.floor(options.widthSegments ?? 96));
  const heightSegments = Math.max(2, Math.floor(options.heightSegments ?? 48));

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= heightSegments; iy++) {
    const v = iy / heightSegments;
    const phi = v * Math.PI;
    const y = Math.cos(phi);
    const ringRadius = Math.sin(phi);
    for (let ix = 0; ix <= widthSegments; ix++) {
      const u = ix / widthSegments;
      const theta = u * Math.PI * 2;
      const x = ringRadius * Math.sin(theta);
      const z = ringRadius * Math.cos(theta);
      positions.push(x * radius, y * radius, z * radius);
      normals.push(x, y, z);
      uvs.push(u, 1 - v);
    }
  }

  gridPatch(indices, heightSegments, widthSegments, { skipTop: true, skipBottom: true });
  return buildGeometry(positions, normals, uvs, indices);
}
