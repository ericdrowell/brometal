import { shader, vec4, vec3, distance } from 'brometal';
import { rotate3 } from 'brometal/shader-functions';

/**
 * The shadow map pass: the scene drawn from the light, recording how far the
 * nearest surface is in every direction it can see.
 *
 * What lands in the red channel is *world distance to the light*, not the
 * depth buffer's value. Depth is nonlinear and its two backends disagree about
 * the clip range, so a bias tuned against it works at one distance and either
 * leaks or detaches at another. A linear distance is uniform everywhere, which
 * means one bias constant holds across the whole scene.
 *
 * The target still needs a real depth attachment ({ depth: true }) — this pass
 * has to keep the nearest surface, and without the test that is just whichever
 * triangle happened to be drawn last.
 */
export default shader({
  attributes: { aPosition: 'vec3' },
  instanceAttributes: { iOffset: 'vec3', iScale: 'vec3', iSpin: 'float' },
  uniforms: { uLightViewProj: 'mat4', uLightPos: 'vec3', uTime: 'float', uRange: 'float' },
  varyings: { vDistance: 'float' },

  vertex({ aPosition, iOffset, iScale, iSpin }, { uLightViewProj, uLightPos, uTime, uRange }, v) {
    const world = rotate3(aPosition.mul(iScale), vec3(0, 1, 0), iSpin * uTime).add(iOffset);
    // Normalized so it fits the [0,1] the map stores; the receiver divides by
    // the same uRange, so the comparison is like-for-like.
    v.vDistance = distance(world, uLightPos) / uRange;
    return uLightViewProj.mul(vec4(world, 1));
  },

  fragment(_uniforms, { vDistance }) {
    return vec4(vDistance, 0, 0, 1);
  },
});
