/**
 * The terrain height field for the 2.5D world.
 *
 * **This function is duplicated in GLSL/WGSL** — every world shader declares its
 * own `terrainHeight` helper with the identical expression, because the vertex
 * shader displaces the ground by it while the CPU needs the same answer to stand
 * a tree, a rock, or the hero on that ground. If the two ever disagree, props
 * float or sink.
 *
 * Which is exactly why it is three sine terms and not fbm noise: the shader DSL
 * has `sin`/`cos`, the expression is short enough to keep byte-identical by
 * inspection, and there is no hash function whose float rounding could drift
 * between JS and a GPU. A noise field would look better and would be a
 * correctness liability.
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
