import { shader, step, vec4 } from 'brometal';

/**
 * Fixture: fills a 2x1 target with a hard step — black in the left texel, white
 * in the right one. Magnifying it shows whether the sampler interpolates.
 */
export const GpuTargetRamp = shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment(_uniforms, { vUv }) {
    const level = step(0.5, vUv.x);
    return vec4(level, level, level, 1);
  },
});
