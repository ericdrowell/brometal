import { shader, vec3, vec4, texture, normalize } from 'brometal';
import { lambert, blinnPhongSpec, hemisphereLight } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3', aUv: 'vec2' },
  uniforms: {
    uViewProj: 'mat4',
    uModel: 'mat4',
    uLightDir: 'vec3',
    uViewPos: 'vec3',
    uTex: 'sampler2D',
  },
  varyings: { vNormal: 'vec3', vUv: 'vec2', vWorldPos: 'vec3' },

  vertex({ aPosition, aNormal, aUv }, { uViewProj, uModel }, v) {
    const world = uModel.mul(vec4(aPosition, 1));
    v.vWorldPos = world.xyz;
    v.vNormal = uModel.mul(vec4(aNormal, 0)).xyz;
    v.vUv = aUv;
    return uViewProj.mul(world);
  },

  fragment({ uLightDir, uViewPos, uTex }, { vNormal, vUv, vWorldPos }) {
    const base = texture(uTex, vUv).xyz;
    const viewDir = normalize(uViewPos.sub(vWorldPos));
    const diffuse = lambert(vNormal, uLightDir);
    const specular = blinnPhongSpec(vNormal, uLightDir, viewDir, 48) * 0.35;
    const ambient = hemisphereLight(vNormal, vec3(0.55, 0.6, 0.75), vec3(0.25, 0.22, 0.3));
    const lit = base.mul(ambient.scale(0.5).add(vec3(1, 1, 1).scale(diffuse * 0.85)));
    return vec4(lit.add(vec3(1, 1, 1).scale(specular)), 1);
  },
});
