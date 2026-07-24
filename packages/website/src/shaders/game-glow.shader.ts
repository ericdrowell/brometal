import { shader, vec4 } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3' },
  instanceAttributes: { iOffset: 'vec3', iScale: 'float', iAlpha: 'float' },
  uniforms: { uViewProj: 'mat4', uColor: 'vec3' },
  varyings: { vAlpha: 'float' },

  vertex({ aPosition, iOffset, iScale, iAlpha }, { uViewProj }, v) {
    v.vAlpha = iAlpha;
    return uViewProj.mul(vec4(aPosition.scale(iScale).add(iOffset), 1));
  },

  fragment({ uColor }, { vAlpha }) {
    return vec4(uColor, vAlpha);
  },
});
