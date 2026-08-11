import { shader, vec2, vec4, texture, mod, floor, step, length } from 'brometal';

/**
 * The 2×2 Bayer cell, as arithmetic.
 *
 * [[0, 2], [3, 1]] — the seed every larger ordered-dither matrix is built from.
 * Written as a formula because the DSL has no arrays: a lookup table is exactly
 * the thing you cannot express, and this is the same numbers without one.
 *
 * The inputs are floored. `mod()` on a fractional coordinate returns a
 * fractional result, which silently turns the threshold into a gradient across
 * each cell instead of one value per cell.
 */
function bayer2(x: number, y: number): number {
  return mod(2 * mod(floor(y), 2) + 3 * mod(floor(x), 2), 4);
}

/**
 * An 8×8 ordered dither threshold in 0..1.
 *
 * The standard recursion, unrolled twice since the DSL has no recursion either:
 *
 *   B8(x,y) = 16·B2(x, y) + 4·B2(x/2, y/2) + B2(x/4, y/4)
 *
 * The weights go on the **fine** term, and that is the whole trick. Inverted —
 * sixteen on the coarse term — the matrix is still a permutation of 0..63 and
 * still looks plausible written down, but its four 4×4 quadrants each hold a
 * narrow range, so a sweeping threshold flips whole 4×4 blocks at a time and the
 * wipe dissolves in visible squares. Weighted this way, adjacent cells are
 * maximally far apart — the first row runs 0, 48, 12, 60.
 */
function bayer8(x: number, y: number): number {
  const fine = 16 * bayer2(x, y);
  const mid = 4 * bayer2(floor(x / 2), floor(y / 2));
  return (fine + mid + bayer2(floor(x / 4), floor(y / 4))) / 64;
}

/**
 * The dithered iris, drawn **into the scene target** rather than over the canvas.
 *
 * This pass is why the dither is pixel-perfect. Drawn into the target, one
 * fragment is exactly one art pixel, so `floor(uv × size)` is the texel index
 * and every dot is one pixel of the same grid the tileset sits on. It is then
 * magnified by the same whole-number blit as everything else — 2×2, 3×3, 4×4 —
 * so the dots stay square and stay the size of the art.
 *
 * Doing it in the present pass instead runs the fragment shader once per *screen*
 * pixel. Deriving an art-pixel coordinate there and flooring it looks equivalent
 * and is not quite: the coordinate arrives interpolated, and any arithmetic that
 * touches it before the floor — `mod()` in particular — varies across the block
 * and shades a gradient inside each art pixel.
 *
 * Output is black with the alpha the dither decides, over an alpha-blended
 * program: transparent inside the circle, opaque outside, dithered between.
 */
export const LegendOfBroIris = shader({
  attributes: { aCorner: 'vec2' },
  uniforms: {
    /** Target size in art pixels — the grid the dither and the radius live on. */
    uScenePx: 'vec2',
    /** Iris centre, in target uv with +y down. */
    uCenter: 'vec2',
    /** Iris radius, in art pixels. */
    uRadius: 'float',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aCorner }, {}, v) {
    // +y down, matching how the camera and the sprites address the target.
    v.vUv = vec2(aCorner.x, 1 - aCorner.y);
    return vec4(aCorner.x * 2 - 1, aCorner.y * 2 - 1, 0, 1);
  },

  fragment({ uScenePx, uCenter, uRadius }, { vUv }) {
    const px = vUv.mul(uScenePx);
    // Distance in art pixels, so the iris is a circle rather than an ellipse
    // stretched by the aspect ratio.
    const dist = length(vUv.sub(uCenter).mul(uScenePx));
    // 0 at the radius, 1 a band further out. Comparing that against the ordered
    // threshold is what turns a hard circle into a ring of dots.
    const edge = (dist - uRadius) / 26;
    const hidden = 1 - step(edge, bayer8(px.x, px.y));
    return vec4(0, 0, 0, hidden);
  },
});
