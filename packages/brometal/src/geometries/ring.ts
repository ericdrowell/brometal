import { buildGeometry, gridPatch, type Geometry } from './types.js';

export interface RingOptions {
  innerRadius?: number;
  outerRadius?: number;
  thetaSegments?: number;
}

/** A flat annulus in the XY plane facing +z. */
export function createRing(options: RingOptions = {}): Geometry {
  const innerRadius = options.innerRadius ?? 0.5;
  const outerRadius = options.outerRadius ?? 1;
  const thetaSegments = Math.max(3, Math.floor(options.thetaSegments ?? 96));

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const radius of [innerRadius, outerRadius]) {
    for (let i = 0; i <= thetaSegments; i++) {
      const theta = (i / thetaSegments) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      positions.push(radius * cos, radius * sin, 0);
      normals.push(0, 0, 1);
      uvs.push((cos * radius / outerRadius + 1) / 2, (sin * radius / outerRadius + 1) / 2);
    }
  }

  gridPatch(indices, 1, thetaSegments);
  return buildGeometry(positions, normals, uvs, indices);
}
