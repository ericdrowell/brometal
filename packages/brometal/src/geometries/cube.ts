import { buildGeometry, type Geometry } from './types.js';

export interface CubeOptions {
  width?: number;
  height?: number;
  depth?: number;
}

interface Face {
  corners: readonly (readonly [number, number, number])[];
  normal: readonly [number, number, number];
}

// Face order (front, back, top, bottom, right, left) is part of the public
// contract — per-face vertex colors rely on it. Corners wind CCW from outside.
const FACES: readonly Face[] = [
  { corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], normal: [0, 0, 1] },
  { corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], normal: [0, 0, -1] },
  { corners: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], normal: [0, 1, 0] },
  { corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], normal: [0, -1, 0] },
  { corners: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], normal: [1, 0, 0] },
  { corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], normal: [-1, 0, 0] },
];

const FACE_UVS = [0, 0, 1, 0, 1, 1, 0, 1] as const;

export function createCube(options: CubeOptions = {}): Geometry {
  const halfW = (options.width ?? 2) / 2;
  const halfH = (options.height ?? 2) / 2;
  const halfD = (options.depth ?? 2) / 2;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  FACES.forEach((face, faceIndex) => {
    for (const [x, y, z] of face.corners) {
      positions.push(x * halfW, y * halfH, z * halfD);
      normals.push(...face.normal);
    }
    uvs.push(...FACE_UVS);
    const base = faceIndex * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  return buildGeometry(positions, normals, uvs, indices);
}
