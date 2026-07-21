/**
 * CPU-side 4x4 matrix helpers for feeding `mat4` uniforms.
 * All matrices are column-major Float32Array(16), matching WebGL's
 * `uniformMatrix4fv` layout. Every function returns a new matrix.
 */

export type Mat4Array = Float32Array;

function identity(): Mat4Array {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

function multiply(a: Mat4Array, b: Mat4Array): Mat4Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + r]! * b[c * 4 + k]!;
      }
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function translation(x: number, y: number, z: number): Mat4Array {
  const m = identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function rotationX(radians: number): Mat4Array {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = identity();
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

function rotationY(radians: number): Mat4Array {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = identity();
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

function rotationZ(radians: number): Mat4Array {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = identity();
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

function perspective(fovYRadians: number, aspect: number, near: number, far: number): Mat4Array {
  const f = 1 / Math.tan(fovYRadians / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export const mat4 = {
  identity,
  multiply,
  translation,
  rotationX,
  rotationY,
  rotationZ,
  perspective,
};
