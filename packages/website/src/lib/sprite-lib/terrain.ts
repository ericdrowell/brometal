/**
 * The terrain height field for the 2.3D world.
 *
 * **This function also exists in GLSL and WGSL.** Each world shader declares its
 * own `terrainHeight` helper with the same expression. The vertex shader moves the
 * ground with it. The CPU needs the same result to put a tree, a rock or the hero
 * on that ground. If the two versions differ, the props float above the ground or
 * sink into it.
 *
 * The expression is three sine terms, and not fbm noise, for that reason. The
 * shader language has `sin` and `cos`. The expression is short, so a person can
 * compare the two versions and see that they are the same. There is also no hash
 * function, so no rounding of floats can differ between JavaScript and a GPU. A
 * noise field looks better, but it puts correctness at risk.
 *
 * A shader cannot import a helper from another file. The compiler puts the functions
 * of `brometal/shader-functions` into a shader, but it permits that one module only.
 * That limit is the cause of the duplication.
 */

/** Half-width of the world. Terrain is defined everywhere; this is where it ends. */
export const WORLD_EXTENT = 46;

/** Anything below this is under water. */
export const WATER_LEVEL = -1.15;

export function terrainHeight(x: number, z: number): number {
  return (
    1.55 * Math.sin(x * 0.085) * Math.cos(z * 0.075) +
    0.75 * Math.sin(x * 0.17 + 1.7) * Math.cos(z * 0.155 + 0.6) +
    0.35 * Math.sin((x + z) * 0.26 + 2.4)
  );
}

/** Surface an actor stands on: the ground, or the waterline if it is submerged. */
export function walkHeight(x: number, z: number): number {
  return Math.max(terrainHeight(x, z), WATER_LEVEL);
}

/**
 * Steepness at a point: |∇h|. Used to keep trees off the steep faces, where a
 * vertical trunk would visibly intersect the slope.
 *
 * Differentiated by hand rather than sampled. A central difference needs four
 * `terrainHeight` calls — twenty sines and cosines — where the exact gradient
 * needs nine, because `sin` and `cos` of the same four arguments serve both the
 * height and its derivative. The ground shader carries the identical derivation
 * (see `shaders/world-ground.shader.ts`), which matters for the same reason the
 * height itself is duplicated: the CPU decides where a tree may stand and the
 * GPU decides where the cliff rock shows, and they must agree.
 *
 * Worth knowing what this function can return: the three terms bound it at
 * 0.351 in x and 0.324 in z, and sampled on a 0.05 grid over the whole world the
 * realised maximum is 0.31427. Any threshold above that is unreachable — which is
 * why the ground shader's cliff band ends at 0.29.
 */
export function terrainSlope(x: number, z: number): number {
  const sinAx = Math.sin(x * 0.085);
  const cosAx = Math.cos(x * 0.085);
  const sinAz = Math.sin(z * 0.075);
  const cosAz = Math.cos(z * 0.075);
  const sinBx = Math.sin(x * 0.17 + 1.7);
  const cosBx = Math.cos(x * 0.17 + 1.7);
  const sinBz = Math.sin(z * 0.155 + 0.6);
  const cosBz = Math.cos(z * 0.155 + 0.6);
  const cosC = Math.cos((x + z) * 0.26 + 2.4);
  const gx = 1.55 * 0.085 * cosAx * cosAz + 0.75 * 0.17 * cosBx * cosBz + 0.35 * 0.26 * cosC;
  const gz =
    -1.55 * 0.075 * sinAx * sinAz - 0.75 * 0.155 * sinBx * sinBz + 0.35 * 0.26 * cosC;
  return Math.hypot(gx, gz);
}
