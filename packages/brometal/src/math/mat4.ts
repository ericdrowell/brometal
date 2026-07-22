/**
 * CPU-side 4x4 matrix helpers for feeding `mat4` uniforms.
 * All matrices are column-major Float32Array(16), matching WebGL's
 * `uniformMatrix4fv` layout.
 *
 * Every function accepts an optional `out` matrix to write into — pass
 * preallocated scratch matrices in render loops to keep frames allocation-free.
 * Without `out`, a new matrix is allocated and returned.
 */

export type Mat4Array = Float32Array;

function target(out?: Mat4Array): Mat4Array {
  if (out === undefined) {
    return new Float32Array(16);
  }
  out.fill(0);
  return out;
}

function identity(out?: Mat4Array): Mat4Array {
  const m = target(out);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

function multiply(a: Mat4Array, b: Mat4Array, out?: Mat4Array): Mat4Array {
  const m = out ?? new Float32Array(16);
  // Cache both operands in locals so aliasing (out === a or out === b) is safe.
  const a00 = a[0]!, a01 = a[1]!, a02 = a[2]!, a03 = a[3]!;
  const a10 = a[4]!, a11 = a[5]!, a12 = a[6]!, a13 = a[7]!;
  const a20 = a[8]!, a21 = a[9]!, a22 = a[10]!, a23 = a[11]!;
  const a30 = a[12]!, a31 = a[13]!, a32 = a[14]!, a33 = a[15]!;
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4]!;
    const b1 = b[c * 4 + 1]!;
    const b2 = b[c * 4 + 2]!;
    const b3 = b[c * 4 + 3]!;
    m[c * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    m[c * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    m[c * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    m[c * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
  }
  return m;
}

function translation(x: number, y: number, z: number, out?: Mat4Array): Mat4Array {
  const m = identity(out);
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function rotationX(radians: number, out?: Mat4Array): Mat4Array {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = identity(out);
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

function rotationY(radians: number, out?: Mat4Array): Mat4Array {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = identity(out);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

function rotationZ(radians: number, out?: Mat4Array): Mat4Array {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = identity(out);
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

function perspective(
  fovYRadians: number,
  aspect: number,
  near: number,
  far: number,
  out?: Mat4Array,
): Mat4Array {
  const f = 1 / Math.tan(fovYRadians / 2);
  const m = target(out);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

function scratch(): Mat4Array {
  return new Float32Array(16);
}

export const mat4 = {
  identity,
  multiply,
  translation,
  rotationX,
  rotationY,
  rotationZ,
  perspective,
  /** Allocates a matrix intended for reuse as an `out` target in render loops. */
  scratch,
};
