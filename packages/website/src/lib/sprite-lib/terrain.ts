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
 * Steepness at a point, 0 flat to ~1 cliff. Used to keep trees off the steep
 * faces, where a vertical trunk would visibly intersect the slope.
 */
export function terrainSlope(x: number, z: number): number {
  const e = 0.6;
  const dx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const dz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}
