import { shader, vec3, vec4 } from 'brometal';
import { lambert, hemisphereLight } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3' },
  uniforms: { uViewProj: 'mat4', uModel: 'mat4', uColor: 'vec3', uLightDir: 'vec3' },
  varyings: { vNormal: 'vec3' },

  vertex({ aPosition, aNormal }, { uViewProj, uModel }, v) {
    const world = uModel.mul(vec4(aPosition, 1));
    v.vNormal = uModel.mul(vec4(aNormal, 0)).xyz;
    return uViewProj.mul(world);
  },

  fragment({ uColor, uLightDir }, { vNormal }) {
    const diffuse = lambert(vNormal, uLightDir);
    const ambient = hemisphereLight(vNormal, vec3(0.5, 0.55, 0.7), vec3(0.3, 0.28, 0.36));
    return vec4(uColor.scale(diffuse * 0.75).add(uColor.mul(ambient).scale(0.5)), 1);
  },
});
