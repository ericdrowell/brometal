import { createCube } from 'brometal';

/**
 * The shared demo cube: streams from BroMetal's createCube() plus per-face
 * color palettes. Color arrays rely on createCube's documented face order
 * (front, back, top, bottom, right, left) with 4 vertices per face.
 */

const cube = createCube();

export const positions = cube.positions;
export const normals = cube.normals;
export const uvs = cube.uvs;
export const indices = cube.indices;

const VIVID_FACE_COLORS: readonly (readonly [number, number, number])[] = [
  [0.92, 0.26, 0.31], // front  — red
  [0.98, 0.65, 0.15], // back   — orange
  [0.3, 0.82, 0.44], // top    — green
  [0.98, 0.85, 0.25], // bottom — yellow
  [0.26, 0.55, 0.96], // right  — blue
  [0.7, 0.4, 0.9], // left   — purple
];

const PASTEL_FACE_COLORS: readonly (readonly [number, number, number])[] = [
  [1, 0.55, 0.55],
  [1, 0.8, 0.5],
  [0.6, 1, 0.65],
  [1, 0.95, 0.6],
  [0.55, 0.75, 1],
  [0.85, 0.65, 1],
];

function perFace(values: readonly (readonly number[])[]): Float32Array {
  return new Float32Array(values.flatMap((value) => [...value, ...value, ...value, ...value]));
}

export const colors = perFace(VIVID_FACE_COLORS);

export const pastelColors = perFace(PASTEL_FACE_COLORS);
