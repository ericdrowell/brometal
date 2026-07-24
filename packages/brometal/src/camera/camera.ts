import { mat4, type Mat4Array } from '../math/mat4.js';

export interface CameraLens {
  fovY?: number;
  near?: number;
  far?: number;
}

export interface CameraOptions extends CameraLens {
  position?: readonly [number, number, number];
  /** Radians, applied yaw (Y) → pitch (X) → roll (Z). */
  rotation?: readonly [number, number, number];
}

export interface Camera {
  setPosition(x: number, y: number, z: number): void;
  /** Radians about each axis, applied yaw (Y) → pitch (X) → roll (Z). */
  setRotation(x: number, y: number, z: number): void;
  /** Points the camera at a world position (sets yaw/pitch, zeroes roll). */
  lookAt(x: number, y: number, z: number): void;
  setLens(lens: CameraLens): void;
  /** World→camera matrix. Cached; recomputed only after a setter changed something. */
  view(): Mat4Array;
  /**
   * Projection · view, the single mat4 a shader needs (e.g. a `uViewProj`
   * uniform). Cached against position, rotation, lens, and aspect — calling
   * every frame with an unchanged camera costs no matrix math and never
   * allocates. The returned matrix is reused; treat it as read-only.
   */
  viewProjection(aspect: number): Mat4Array;
}

export function createCamera(options: CameraOptions = {}): Camera {
  let [px, py, pz] = options.position ?? [0, 0, 0];
  let [rx, ry, rz] = options.rotation ?? [0, 0, 0];
  let fovY = options.fovY ?? Math.PI / 4;
  let near = options.near ?? 0.1;
  let far = options.far ?? 1000;
  let aspect = 0;

  const viewMatrix = mat4.identity();
  const projMatrix = mat4.scratch();
  const viewProjMatrix = mat4.scratch();
  const tmp = mat4.scratch();
  let viewDirty = true;
  let projDirty = true;
  let viewProjDirty = true;

  const refreshView = (): void => {
    // World transform is T(p) · Ry(yaw) · Rx(pitch) · Rz(roll); the view
    // matrix is its inverse: Rz(-roll) · Rx(-pitch) · Ry(-yaw) · T(-p).
    mat4.rotationZ(-rz, viewMatrix);
    mat4.multiply(viewMatrix, mat4.rotationX(-rx, tmp), viewMatrix);
    mat4.multiply(viewMatrix, mat4.rotationY(-ry, tmp), viewMatrix);
    mat4.multiply(viewMatrix, mat4.translation(-px, -py, -pz, tmp), viewMatrix);
    viewDirty = false;
    viewProjDirty = true;
  };

  return {
    setPosition(x: number, y: number, z: number): void {
      if (x === px && y === py && z === pz) return;
      px = x;
      py = y;
      pz = z;
      viewDirty = true;
    },
    setRotation(x: number, y: number, z: number): void {
      if (x === rx && y === ry && z === rz) return;
      rx = x;
      ry = y;
      rz = z;
      viewDirty = true;
    },
    lookAt(x: number, y: number, z: number): void {
      const dx = x - px;
      const dy = y - py;
      const dz = z - pz;
      const length = Math.hypot(dx, dy, dz);
      if (length < 1e-6) return;
      // Camera forward is (-sin(ry)cos(rx), sin(rx), -cos(ry)cos(rx)) under
      // the yaw→pitch rotation order; invert for the direction to the target.
      const pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
      const yaw = Math.atan2(-dx, -dz);
      this.setRotation(pitch, yaw, 0);
    },
    setLens(lens: CameraLens): void {
      const nextFovY = lens.fovY ?? fovY;
      const nextNear = lens.near ?? near;
      const nextFar = lens.far ?? far;
      if (nextFovY === fovY && nextNear === near && nextFar === far) return;
      fovY = nextFovY;
      near = nextNear;
      far = nextFar;
      projDirty = true;
    },
    view(): Mat4Array {
      if (viewDirty) {
        refreshView();
      }
      return viewMatrix;
    },
    viewProjection(nextAspect: number): Mat4Array {
      if (nextAspect !== aspect) {
        aspect = nextAspect;
        projDirty = true;
      }
      if (projDirty) {
        mat4.perspective(fovY, aspect, near, far, projMatrix);
        projDirty = false;
        viewProjDirty = true;
      }
      if (viewDirty) {
        refreshView();
      }
      if (viewProjDirty) {
        mat4.multiply(projMatrix, viewMatrix, viewProjMatrix);
        viewProjDirty = false;
      }
      return viewProjMatrix;
    },
  };
}
