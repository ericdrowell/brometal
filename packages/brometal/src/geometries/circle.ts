import { buildGeometry, type Geometry } from './types.js';

export interface CircleOptions {
  radius?: number;
  segments?: number;
}

/** A filled disc in the XY plane facing +z. */
export function createCircle(options: CircleOptions = {}): Geometry {
  const radius = options.radius ?? 1;
  const segments = Math.max(3, Math.floor(options.segments ?? 96));

  const positions: number[] = [0, 0, 0];
  const normals: number[] = [0, 0, 1];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    positions.push(radius * cos, radius * sin, 0);
    normals.push(0, 0, 1);
    uvs.push((cos + 1) / 2, (sin + 1) / 2);
  }
  for (let i = 1; i <= segments; i++) {
    indices.push(0, i, i + 1);
  }

  return buildGeometry(positions, normals, uvs, indices);
}
