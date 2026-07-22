/**
 * A unit cube with 4 vertices per face (24 total) and 36 indices, with
 * per-face colors, outward normals, and 0..1 UVs — each demo imports the
 * streams it needs.
 */

const FACE_POSITIONS: readonly (readonly number[])[] = [
  [-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1], // front  (+z)
  [1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1], // back   (-z)
  [-1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1], // top    (+y)
  [-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1], // bottom (-y)
  [1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1], // right  (+x)
  [-1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1], // left   (-x)
];

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

const FACE_NORMALS: readonly (readonly [number, number, number])[] = [
  [0, 0, 1],
  [0, 0, -1],
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
];

function perFace(values: readonly (readonly number[])[]): Float32Array {
  return new Float32Array(values.flatMap((value) => [...value, ...value, ...value, ...value]));
}

export const positions = new Float32Array(FACE_POSITIONS.flat());

export const colors = perFace(VIVID_FACE_COLORS);

export const pastelColors = perFace(PASTEL_FACE_COLORS);

export const normals = perFace(FACE_NORMALS);

export const uvs = new Float32Array(FACE_POSITIONS.flatMap(() => [0, 0, 1, 0, 1, 1, 0, 1]));

export const indices = new Uint16Array(
  FACE_POSITIONS.flatMap((_, face) => {
    const base = face * 4;
    return [base, base + 1, base + 2, base, base + 2, base + 3];
  }),
);
