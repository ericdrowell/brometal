import { shader, vec2, vec4, texture } from 'brometal';

/**
 * Fixture: samples the target written by gpu-target-write and puts the stored uv
 * next to the uv this pass computes itself.
 *
 * Red is v as it came back out of the target, green is v as this pass knows it.
 *
 * Note the flip on the lookup. NDC +y lands on a target's *first* row while
 * texture v runs top-down, so a fullscreen quad's own uv reads the target
 * mirrored — the same asymmetry `targetUv()` exists to absorb for shadow maps.
 * Sampling at `1 - v` is the documented way to undo it, and the two channels
 * agreeing is what proves the row order is the one the docs describe.
 */
export const GpuTargetRead = shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTarget: 'sampler2D' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _uniforms, v) {
    v.vUv = aUv;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment({ uTarget }, { vUv }) {
    const stored = texture(uTarget, vec2(vUv.x, 1 - vUv.y));
    return vec4(stored.y, vUv.y, stored.z, 1);
  },
});
