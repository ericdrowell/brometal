import { shader, vec4, clamp, mix } from 'brometal';

/**
 * Water Bro — the sky, as flat colour.
 *
 * The Preetham atmosphere and raymarched clouds that used to live here are
 * parked in git history: they were pulling attention away from the water, which
 * is what the demo is actually about. What the water needs from the sky is a
 * plausible colour to reflect, and a flat one does that honestly.
 *
 * Still rendered into the equirectangular map rather than hard-coded in the
 * water shader, so the reflection and the backdrop stay driven by one value —
 * and so re-introducing a real sky later is a change to this file alone.
 */
export const WaterSky = shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uZenith: 'vec3', uHorizon: 'vec3' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment({ uZenith, uHorizon }, { vUv }) {
    // V spans pole to pole; the horizon sits at the middle. A touch of vertical
    // falloff rather than a single flat value, because a perfectly uniform sky
    // makes the water's Fresnel look broken — every grazing angle returns the
    // identical colour and the surface loses its sense of depth.
    const up = clamp((vUv.y - 0.5) * 2, 0, 1);
    return vec4(mix(uHorizon, uZenith, up), 1);
  },
});
