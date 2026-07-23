import { buildGeometry, gridPatch, type Geometry } from './types.js';

export interface TorusKnotOptions {
  radius?: number;
  tube?: number;
  tubularSegments?: number;
  radialSegments?: number;
  /** Winds around the axis of rotational symmetry. */
  p?: number;
  /** Winds around the interior circle. */
  q?: number;
}

export function createTorusKnot(options: TorusKnotOptions = {}): Geometry {
  const radius = options.radius ?? 1;
  const tube = options.tube ?? 0.4;
  const tubularSegments = Math.max(3, Math.floor(options.tubularSegments ?? 256));
  const radialSegments = Math.max(3, Math.floor(options.radialSegments ?? 24));
  const p = options.p ?? 2;
  const q = options.q ?? 3;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const curvePoint = (u: number): [number, number, number] => {
    const quOverP = (q / p) * u;
    const cs = Math.cos(quOverP);
    return [
      radius * (2 + cs) * 0.5 * Math.cos(u),
      radius * (2 + cs) * 0.5 * Math.sin(u),
      radius * Math.sin(quOverP) * 0.5,
    ];
  };

  for (let i = 0; i <= tubularSegments; i++) {
    const u = (i / tubularSegments) * p * Math.PI * 2;
    const p1 = curvePoint(u);
    const p2 = curvePoint(u + 0.01);

    // Frenet-ish frame around the curve.
    const tangent = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const sum = [p2[0] + p1[0], p2[1] + p1[1], p2[2] + p1[2]];
    const bitangent = cross(tangent, sum);
    const normalAxis = cross(bitangent, tangent);
    normalizeInPlace(bitangent);
    normalizeInPlace(normalAxis);

    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const cx = -tube * Math.cos(v);
      const cy = tube * Math.sin(v);
      const x = p1[0] + (cx * normalAxis[0]! + cy * bitangent[0]!);
      const y = p1[1] + (cx * normalAxis[1]! + cy * bitangent[1]!);
      const z = p1[2] + (cx * normalAxis[2]! + cy * bitangent[2]!);
      positions.push(x, y, z);
      const invLength = 1 / Math.hypot(x - p1[0], y - p1[1], z - p1[2]);
      normals.push((x - p1[0]) * invLength, (y - p1[1]) * invLength, (z - p1[2]) * invLength);
      uvs.push(i / tubularSegments, j / radialSegments);
    }
  }

  gridPatch(indices, tubularSegments, radialSegments);
  return buildGeometry(positions, normals, uvs, indices);
}

function cross(a: number[], b: number[]): number[] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}

function normalizeInPlace(v: number[]): void {
  const invLength = 1 / Math.hypot(v[0]!, v[1]!, v[2]!);
  v[0]! *= invLength;
  v[1]! *= invLength;
  v[2]! *= invLength;
}
