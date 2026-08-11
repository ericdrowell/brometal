import { shader, vec2, vec4, texture } from 'brometal';

/**
 * Blits the low-resolution scene onto the canvas at a whole-number scale.
 *
 * The scene — including the dithered iris, which is drawn into the target so it
 * lands on the same pixel grid as the art — is stretched by exactly 2×, 3× or
 * 4×, never 2.7×. At a fractional scale some source pixels cover two screen
 * pixels and their neighbours three, so everything visibly breathes as the
 * camera moves.
 *
 * `uFill` is how much of the canvas the quad covers, and it is slightly more
 * than all of it. The target is `ceil(canvas / scale)` texels, so `target ×
 * scale` overshoots by up to `scale - 1` pixels. Rather than shrink to fit —
 * reintroducing the fractional scale this exists to avoid — the quad is grown
 * past the edges and the excess clipped.
 *
 * The v coordinate is flipped because the target's first row is the top of the
 * world while clip-space +y is the top of the screen.
 */
export const LegendOfBroPresent = shader({
  attributes: { aCorner: 'vec2' },
  uniforms: { uScene: 'sampler2D', uFill: 'vec2' },
  varyings: { vUv: 'vec2' },

  vertex({ aCorner }, { uFill }, v) {
    v.vUv = vec2(aCorner.x, 1 - aCorner.y);
    return vec4((aCorner.x * 2 - 1) * uFill.x, (aCorner.y * 2 - 1) * uFill.y, 0, 1);
  },

  fragment({ uScene }, { vUv }) {
    return texture(uScene, vUv);
  },
});
