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

/**
 * View matrix for a camera at `eye` looking at `target` (classic gluLookAt).
 * `up` defaults to +y.
 */
function lookAt(
  eye: readonly [number, number, number],
  target: readonly [number, number, number],
  up: readonly [number, number, number] = [0, 1, 0],
  out?: Mat4Array,
): Mat4Array {
  let fx = target[0] - eye[0];
  let fy = target[1] - eye[1];
  let fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;

  let sx = fy * up[2] - fz * up[1];
  let sy = fz * up[0] - fx * up[2];
  let sz = fx * up[1] - fy * up[0];
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl;
  sy /= sl;
  sz /= sl;

  const ux = sy * fz - sz * fy;
  const uy = sz * fx - sx * fz;
  const uz = sx * fy - sy * fx;

  const m = out ?? new Float32Array(16);
  m[0] = sx;
  m[1] = ux;
  m[2] = -fx;
  m[3] = 0;
  m[4] = sy;
  m[5] = uy;
  m[6] = -fy;
  m[7] = 0;
  m[8] = sz;
  m[9] = uz;
  m[10] = -fz;
  m[11] = 0;
  m[12] = -(sx * eye[0] + sy * eye[1] + sz * eye[2]);
  m[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  m[14] = fx * eye[0] + fy * eye[1] + fz * eye[2];
  m[15] = 1;
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
  lookAt,
  /** Allocates a matrix intended for reuse as an `out` target in render loops. */
  scratch,
};
