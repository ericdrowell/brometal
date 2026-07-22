import { describe, expect, it } from 'vitest';
import { createCamera } from '../src/camera/camera.js';
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

describe('camera', () => {
  it('defaults to the identity view at the origin', () => {
    const camera = createCamera();
    expectVecClose([...camera.view()], [...mat4.identity()]);
  });

  it('translates the world opposite to the camera position', () => {
    const camera = createCamera({ position: [0, 0, 6] });
    expectVecClose(transform(camera.view(), [0, 0, 0, 1]), [0, 0, -6, 1]);
  });

  it('yaw of 90 degrees looks down -x', () => {
    const camera = createCamera({ rotation: [0, Math.PI / 2, 0] });
    expectVecClose(transform(camera.view(), [-1, 0, 0, 1]), [0, 0, -1, 1]);
  });

  it('pitch of 90 degrees looks up +y', () => {
    const camera = createCamera({ rotation: [Math.PI / 2, 0, 0] });
    expectVecClose(transform(camera.view(), [0, 1, 0, 1]), [0, 0, -1, 1]);
  });

  it('viewProjection equals perspective times view', () => {
    const camera = createCamera({ position: [1, 2, 6], rotation: [0.2, 0.4, 0.1], fovY: Math.PI / 3, near: 0.5, far: 50 });
    const expected = mat4.multiply(mat4.perspective(Math.PI / 3, 1.5, 0.5, 50), camera.view());
    expectVecClose([...camera.viewProjection(1.5)], [...expected]);
  });

  it('centers a point straight ahead of the camera in clip space', () => {
    const camera = createCamera({ position: [0, 0, 6] });
    const [x, y, , w] = transform(camera.viewProjection(1.78), [0, 0, 0, 1]);
    expect(x / w).toBeCloseTo(0, 6);
    expect(y / w).toBeCloseTo(0, 6);
  });

  it('caches: unchanged camera returns the same matrix without recompute', () => {
    const camera = createCamera({ position: [0, 0, 6] });
    const first = camera.viewProjection(2);
    expect(camera.viewProjection(2)).toBe(first);
    expectVecClose([...camera.viewProjection(2)], [...first]);
  });

  it('setters invalidate the cache and no-op setters do not', () => {
    const camera = createCamera({ position: [0, 0, 6] });
    const before = [...camera.viewProjection(2)];

    camera.setPosition(0, 0, 6);
    expectVecClose([...camera.viewProjection(2)], before);

    camera.setPosition(0, 0, 12);
    const moved = camera.viewProjection(2);
    expectVecClose(transform(camera.view(), [0, 0, 0, 1]), [0, 0, -12, 1]);
    expect([...moved]).not.toEqual(before);
  });

  it('aspect and lens changes refresh the projection', () => {
    const camera = createCamera({ position: [0, 0, 6] });
    const wide = [...camera.viewProjection(2)];
    const square = [...camera.viewProjection(1)];
    expect(wide).not.toEqual(square);

    camera.setLens({ fovY: Math.PI / 2 });
    const zoomedOut = [...camera.viewProjection(1)];
    expect(zoomedOut).not.toEqual(square);
    expectVecClose(
      zoomedOut,
      [...mat4.multiply(mat4.perspective(Math.PI / 2, 1, 0.1, 1000), camera.view())],
    );
  });
});
