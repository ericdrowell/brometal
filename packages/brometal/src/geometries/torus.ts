import { buildGeometry, gridPatch, type Geometry } from './types.js';

export interface TorusOptions {
  radius?: number;
  tube?: number;
  radialSegments?: number;
  tubularSegments?: number;
}

/** A donut in the XY plane: `radius` to the tube center, `tube` its thickness. */
export function createTorus(options: TorusOptions = {}): Geometry {
  const radius = options.radius ?? 1;
  const tube = options.tube ?? 0.4;
  const radialSegments = Math.max(3, Math.floor(options.radialSegments ?? 48));
  const tubularSegments = Math.max(3, Math.floor(options.tubularSegments ?? 128));

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= radialSegments; j++) {
    const phi = (j / radialSegments) * Math.PI * 2;
    for (let i = 0; i <= tubularSegments; i++) {
      const theta = (i / tubularSegments) * Math.PI * 2;
      const centerX = radius * Math.cos(theta);
      const centerY = radius * Math.sin(theta);
      const x = (radius + tube * Math.cos(phi)) * Math.cos(theta);
      const y = (radius + tube * Math.cos(phi)) * Math.sin(theta);
      const z = tube * Math.sin(phi);
      positions.push(x, y, z);
      const invLength = 1 / Math.hypot(x - centerX, y - centerY, z);
      normals.push((x - centerX) * invLength, (y - centerY) * invLength, z * invLength);
      uvs.push(i / tubularSegments, j / radialSegments);
    }
  }

  gridPatch(indices, radialSegments, tubularSegments, { flip: true });
  return buildGeometry(positions, normals, uvs, indices);
}
