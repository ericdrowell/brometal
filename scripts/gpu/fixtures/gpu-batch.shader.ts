import { shader, vec4 } from 'brometal';

/**
 * Fixture: draws a solid colour taken from a per-vertex attribute, so two
 * uploads to the same attribute in one frame produce two visibly different
 * draws — unless the second upload overwrote the first.
 */
export const GpuBatch = shader({
  attributes: { aPosition: 'vec3', aTint: 'vec3' },
  varyings: { vTint: 'vec3' },

  vertex({ aPosition, aTint }, _uniforms, v) {
    v.vTint = aTint;
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment(_uniforms, { vTint }) {
    return vec4(vTint, 1);
  },
});
