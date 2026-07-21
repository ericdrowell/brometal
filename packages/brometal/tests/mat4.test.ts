import { describe, expect, it } from 'vitest';
import { mat4, type Mat4Array } from '../src/math/mat4.js';

function transform(m: Mat4Array, v: [number, number, number, number]): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) {
    out[r] = m[r]! * v[0] + m[4 + r]! * v[1] + m[8 + r]! * v[2] + m[12 + r]! * v[3];
  }
  return out;
}

function expectVecClose(actual: number[], expected: number[]): void {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index]!, 6);
  });
}

describe('mat4', () => {
  it('identity leaves vectors unchanged', () => {
    expectVecClose(transform(mat4.identity(), [1, 2, 3, 1]), [1, 2, 3, 1]);
  });

  it('multiplying by identity returns the same matrix', () => {
    const m = mat4.perspective(Math.PI / 3, 1.5, 0.1, 100);
    expectVecClose([...mat4.multiply(mat4.identity(), m)], [...m]);
    expectVecClose([...mat4.multiply(m, mat4.identity())], [...m]);
  });

  it('translation moves points but not directions', () => {
    const t = mat4.translation(10, -5, 2);
    expectVecClose(transform(t, [1, 1, 1, 1]), [11, -4, 3, 1]);
    expectVecClose(transform(t, [1, 1, 1, 0]), [1, 1, 1, 0]);
  });

  it('rotationX maps +y to +z at 90 degrees', () => {
    expectVecClose(transform(mat4.rotationX(Math.PI / 2), [0, 1, 0, 1]), [0, 0, 1, 1]);
  });

  it('rotationY maps +z to +x at 90 degrees', () => {
    expectVecClose(transform(mat4.rotationY(Math.PI / 2), [0, 0, 1, 1]), [1, 0, 0, 1]);
  });

  it('rotationZ maps +x to +y at 90 degrees', () => {
    expectVecClose(transform(mat4.rotationZ(Math.PI / 2), [1, 0, 0, 1]), [0, 1, 0, 1]);
  });

  it('rotations compose in application order (right-to-left)', () => {
    const m = mat4.multiply(mat4.rotationY(Math.PI / 2), mat4.rotationX(Math.PI / 2));
    expectVecClose(transform(m, [0, 1, 0, 1]), [1, 0, 0, 1]);
  });

  it('matrix multiplication is not commutative for distinct rotations', () => {
    const ab = mat4.multiply(mat4.rotationX(0.5), mat4.rotationY(1.1));
    const ba = mat4.multiply(mat4.rotationY(1.1), mat4.rotationX(0.5));
    const differs = [...ab].some((value, index) => Math.abs(value - ba[index]!) > 1e-6);
    expect(differs).toBe(true);
  });

  it('perspective matches the standard OpenGL projection', () => {
    const fov = Math.PI / 2;
    const m = mat4.perspective(fov, 2, 1, 101);
    expect(m[0]).toBeCloseTo(0.5, 6);
    expect(m[5]).toBeCloseTo(1, 6);
    expect(m[10]).toBeCloseTo(-102 / 100, 6);
    expect(m[11]).toBe(-1);
    expect(m[14]).toBeCloseTo(-202 / 100, 6);
    expect(m[15]).toBe(0);
  });

  it('perspective maps the near plane to clip z = -w', () => {
    const m = mat4.perspective(Math.PI / 4, 1, 0.5, 50);
    const [, , z, w] = transform(m, [0, 0, -0.5, 1]);
    expect(z / w).toBeCloseTo(-1, 5);
  });
});
