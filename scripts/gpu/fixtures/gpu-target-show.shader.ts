import { shader, vec2, vec4, texture } from 'brometal';

/**
 * Fixture: magnifies a target across the canvas so the sampler's filtering is
 * visible. Sampling the middle of the quad reads halfway between two texels.
 */
export const GpuTargetShow = shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTarget: 'sampler2D' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment({ uTarget }, { vUv }) {
    return texture(uTarget, vec2(vUv.x, 1 - vUv.y));
  },
});
