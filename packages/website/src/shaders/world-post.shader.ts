import {
  shader,
  vec2,
  vec3,
  vec4,
  texture,
  targetUv,
  clamp,
  length,
  sqrt,
  sin,
  cos,
  smoothstep,
  mix,
  abs,
  max,
} from 'brometal';

/**
 * Depth of field and vignette, in one fullscreen pass.
 *
 * The scene target holds colour in rgb and **camera distance in alpha**, so this
 * pass has a real depth per pixel without a depth-texture read: the circle of
 * confusion is just how far that pixel's distance is from the focus plane.
 *
 * Taps are placed on a Vogel spiral — `i * 2.39996` radians (the golden angle)
 * at radius `sqrt(i / n)`. That distributes them evenly over a disc, so 16 taps
 * look like a soft round bokeh instead of the star that a fixed-angle ring gives.
 *
 * `vUv` comes from `targetUv` rather than the quad's own uvs: the two backends
 * disagree about which row of a render target NDC +y lands on, and a vertically
 * mirrored blur still looks like a blur — just focused on the wrong half of the
 * screen.
 */
export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: {
    uScene: 'sampler2D',
    /** 1 / target width, 1 / target height. */
    uTexel: 'vec2',
    /** Distance the focus plane sits at, in world units. */
    uFocus: 'float',
    /** Peak blur radius in texels. 0 disables the effect entirely. */
    uAperture: 'float',
    /** How quickly things go out of focus either side of the focus plane. */
    uFocusRange: 'float',
    uVignette: 'float',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition }, _uniforms, v) {
    v.vUv = targetUv(vec4(aPosition.x, aPosition.y, 0, 1));
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment(
    { uScene, uTexel, uFocus, uAperture, uFocusRange, uVignette },
    { vUv },
  ) {
    const center = texture(uScene, vUv);
    const depth = center.w;

    // Circle of confusion, 0 at the focus plane and 1 once fully defocused.
    const coc = clamp(abs(depth - uFocus) / max(uFocusRange, 0.001), 0, 1);
    const radius = coc * uAperture;

    let sum = vec3(center.x, center.y, center.z);
    let weight = 1;
    for (let i = 0; i < 16; i += 1) {
      const angle = i * 2.39996;
      const spread = sqrt((i + 0.5) / 16);
      const offset = vec2(cos(angle), sin(angle)).scale(spread * radius);
      const uv = vUv.add(offset.mul(uTexel));
      const tap = texture(uScene, uv);
      // Only let a tap contribute if it is itself at least as defocused as this
      // pixel. Without that test a sharp foreground object bleeds outward into
      // the blurred background behind it.
      const tapCoc = clamp(abs(tap.w - uFocus) / max(uFocusRange, 0.001), 0, 1);
      const admit = smoothstep(coc * 0.35, coc * 0.9 + 0.05, tapCoc + 0.02);
      sum = sum.add(vec3(tap.x, tap.y, tap.z).scale(admit));
      weight = weight + admit;
    }
    let color = sum.scale(1 / weight);

    // Vignette: a smooth falloff from the centre, tinted rather than crushed to
    // black so it reads as a lens rather than a mask.
    const r = length(vUv.sub(vec2(0.5, 0.5))) * 1.41421;
    const shade = 1 - uVignette * smoothstep(0.35, 1.05, r);
    color = mix(color.scale(shade), color.scale(shade).mul(vec3(0.9, 0.93, 1)), uVignette * 0.5);

    return vec4(color, 1);
  },
});
