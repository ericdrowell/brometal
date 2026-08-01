import { shader, vec3, vec4, texture } from 'brometal';
import { lambert, blinnPhongSpec } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3', aUv: 'vec2' },
  uniforms: {
    uViewProj: 'mat4',
    uModel: 'mat4',
    uLightPos: 'vec3',
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

  fragment({ uLightPos, uViewPos, uTex }, { vNormal, vUv, vWorldPos }) {
    const ambient = 0.25;
    const lightDir = uLightPos.sub(vWorldPos);
    const viewDir = uViewPos.sub(vWorldPos);
    const diffuse = lambert(vNormal, lightDir);
    const specular = blinnPhongSpec(vNormal, lightDir, viewDir, 32) * 0.4;
    const base = texture(uTex, vUv).xyz;
    const lit = base.mul(ambient + diffuse).add(vec3(1, 1, 1).scale(specular));
    return vec4(lit, 1);
  },
});
