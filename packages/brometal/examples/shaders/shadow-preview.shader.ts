import { shader, vec3, vec4, texture, targetUv, pow, step, mix, max, abs } from 'brometal';

/**
 * The shadow map itself, drawn into a corner so you can watch what the lit pass
 * is reading. Nearer to the light is brighter.
 *
 * The uv comes from `targetUv` of the quad's own corner positions rather than
 * from its uvs. Sampling a render target with plain uvs shows the image the
 * right way up on one backend and upside down on the other — the same row-order
 * disagreement the lit pass has to get right, just visible here instead of
 * disguised as a misplaced shadow.
 */
export const ShadowPreview = shader({
  attributes: { aPosition: 'vec3' },
  uniforms: { uMap: 'sampler2D', uRect: 'vec4' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition }, { uRect }, v) {
    v.vUv = targetUv(vec4(aPosition.x, aPosition.y, 0, 1));
    return vec4(aPosition.x * uRect.z + uRect.x, aPosition.y * uRect.w + uRect.y, 0, 1);
  },

  fragment({ uMap }, { vUv }) {
    const nearest = texture(uMap, vUv).x;
    // The map is cleared to 1, so untouched texels would wash out the whole
    // preview. Those read as the backdrop; the rest is contrast-stretched
    // across the depth range the geometry actually occupies.
    const empty = step(0.999, nearest);
    const shade = pow(1 - nearest, 0.55);
    const image = mix(vec3(shade * 0.95, shade * 0.98, shade), vec3(0.07, 0.08, 0.11), empty);
    // A thin frame on all four sides, so the inset reads as a panel rather
    // than as part of the scene behind it.
    const edge = step(0.984, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2);
    return vec4(mix(image, vec3(0.32, 0.35, 0.44), edge), 1);
  },
});
