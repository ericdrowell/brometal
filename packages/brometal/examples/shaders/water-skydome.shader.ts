import { shader, vec4, clamp, normalize } from 'brometal';

/** Water Bro — flat sky on a dome around the camera. Matches `water-sky`. */
export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: { uViewProj: 'mat4', uModel: 'mat4', uZenith: 'vec3', uHorizon: 'vec3' },
  varyings: { vDir: 'vec3' },

  vertex({ aPosition }, { uViewProj, uModel }, v) {
    v.vDir = normalize(aPosition);
    return uViewProj.mul(uModel.mul(vec4(aPosition, 1)));
  },

  fragment({ uZenith, uHorizon }, { vDir }) {
    const direction = normalize(vDir);
    return vec4(uHorizon.add(uZenith.sub(uHorizon).scale(clamp(direction.y, 0, 1))), 1);
  },
});
