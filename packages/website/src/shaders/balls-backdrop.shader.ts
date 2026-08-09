import { shader, vec2, vec3, vec4, mix, clamp, length, pow } from 'brometal';

/** A soft studio gradient — something for the glass to pick up and reflect. */
export const BallsBackdrop = shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTop: 'vec3', uBottom: 'vec3', uGlow: 'vec3' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0.99999, 1);
  },

  fragment({ uTop, uBottom, uGlow }, { vUv }) {
    const base = mix(uBottom, uTop, pow(clamp(vUv.y, 0, 1), 0.75));
    // A pool of light behind the tank, so the glass has something to sit against.
    const falloff = 1 - clamp(length(vUv.sub(vec2(0.5, 0.46))) * 1.7, 0, 1);
    // Effectively infinite distance: never something the reflected ray should
    // treat as a surface it ran into.
    return vec4(base.add(uGlow.scale(pow(falloff, 2.4) * 0.5)), 4000);
  },
});
