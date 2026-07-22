import { shader, vec4 } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3', aColor: 'vec3' },
  uniforms: { uViewProj: 'mat4', uModel: 'mat4' },
  varyings: { vColor: 'vec3' },

  vertex({ aPosition, aColor }, { uViewProj, uModel }, v) {
    v.vColor = aColor;
    return uViewProj.mul(uModel.mul(vec4(aPosition, 1)));
  },

  fragment(_uniforms, { vColor }) {
    return vec4(vColor, 1);
  },
});
