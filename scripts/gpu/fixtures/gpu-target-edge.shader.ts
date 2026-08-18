import { shader, vec4 } from 'brometal';

/**
 * Fixture: a triangle covering half the quad, so the diagonal it leaves is a
 * hard geometric edge. Whether that edge has intermediate values after a
 * resolve is what tells multisampling apart from one sample.
 */
export const GpuTargetEdge = shader({
  attributes: { aPosition: 'vec3' },

  vertex({ aPosition }, _uniforms, _v) {
    return vec4(aPosition.x, aPosition.y, 0, 1);
  },

  fragment(_uniforms, _varyings) {
    return vec4(1, 1, 1, 1);
  },
});
