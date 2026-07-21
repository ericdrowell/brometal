/**
 * A unit cube with 4 vertices per face (24 total) so each face can carry a
 * flat color, plus 36 indices (two triangles per face).
 */

const FACE_POSITIONS: readonly (readonly number[])[] = [
  [-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1], // front  (+z)
  [1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1], // back   (-z)
  [-1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1], // top    (+y)
  [-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1], // bottom (-y)
  [1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1], // right  (+x)
  [-1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1], // left   (-x)
];

const FACE_COLORS: readonly (readonly [number, number, number])[] = [
  [0.92, 0.26, 0.31], // front  — red
  [0.98, 0.65, 0.15], // back   — orange
  [0.3, 0.82, 0.44], // top    — green
  [0.98, 0.85, 0.25], // bottom — yellow
  [0.26, 0.55, 0.96], // right  — blue
  [0.7, 0.4, 0.9], // left   — purple
];

export const positions = new Float32Array(FACE_POSITIONS.flat());

export const colors = new Float32Array(
  FACE_COLORS.flatMap((color) => [...color, ...color, ...color, ...color]),
);

export const indices = new Uint16Array(
  FACE_POSITIONS.flatMap((_, face) => {
    const base = face * 4;
    return [base, base + 1, base + 2, base, base + 2, base + 3];
  }),
);
