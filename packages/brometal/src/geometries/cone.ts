import { createCylinder } from './cylinder.js';
import type { Geometry } from './types.js';

export interface ConeOptions {
  radius?: number;
  height?: number;
  radialSegments?: number;
  openEnded?: boolean;
}

export function createCone(options: ConeOptions = {}): Geometry {
  return createCylinder({
    radiusTop: 0,
    radiusBottom: options.radius ?? 1,
    height: options.height ?? 2,
    radialSegments: options.radialSegments ?? 96,
    openEnded: options.openEnded ?? false,
  });
}
