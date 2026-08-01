import { shader, vec2, vec4, texture } from 'brometal';
import { shadowDepth } from 'brometal/shader-functions';

/**
 * The balls as the light sees them, written into the shadow map.
 *
 * The centres come out of the state target in the vertex shader, exactly as the
 * lit pass reads them — the same one float per ball goes up from the CPU. Two
 * passes over the same simulation, and neither one needs a position read back.
 *
 * What lands in red is world distance to the light rather than a depth value,
 * so a single bias constant holds for a ball at the top of the pile and one on
 * the floor. See shadow-depth.shader.ts for the longer version of why.
 */
export default shader({
  attributes: { aPosition: 'vec3' },
  instanceAttributes: { iIndex: 'float' },
  uniforms: {
    uLightViewProj: 'mat4',
    uState: 'sampler2D',
    uCount: 'float',
    uRadius: 'float',
    uLightPos: 'vec3',
    uRange: 'float',
  },
  varyings: { vDistance: 'float' },

  vertex({ aPosition, iIndex }, { uLightViewProj, uState, uCount, uRadius, uLightPos, uRange }, v) {
    const u = ((iIndex + 0.5) / uCount) * 0.5;
    const centre = texture(uState, vec2(u, 0.5)).xyz;
    const world = centre.add(aPosition.scale(uRadius));
    v.vDistance = shadowDepth(world, uLightPos, uRange);
    return uLightViewProj.mul(vec4(world, 1));
  },

  fragment(_uniforms, { vDistance }) {
    return vec4(vDistance, 0, 0, 1);
  },
});
