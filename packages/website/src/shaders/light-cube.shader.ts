import { shader, vec3, vec4, normalize, dot, max, pow } from 'brometal';

export default shader({
  attributes: { aPosition: 'vec3', aNormal: 'vec3', aColor: 'vec3' },
  uniforms: { uViewProj: 'mat4', uModel: 'mat4', uLightPos: 'vec3', uViewPos: 'vec3' },
  varyings: { vNormal: 'vec3', vColor: 'vec3', vWorldPos: 'vec3' },

  vertex({ aPosition, aNormal, aColor }, { uViewProj, uModel }, v) {
    const world = uModel.mul(vec4(aPosition, 1));
    v.vWorldPos = world.xyz;
    v.vNormal = uModel.mul(vec4(aNormal, 0)).xyz;
    v.vColor = aColor;
    return uViewProj.mul(world);
  },

  fragment({ uLightPos, uViewPos }, { vNormal, vColor, vWorldPos }) {
    const ambient = 0.25;
    const n = normalize(vNormal);
    const lightDir = normalize(uLightPos.sub(vWorldPos));
    const diffuse = max(dot(n, lightDir), 0);
    const viewDir = normalize(uViewPos.sub(vWorldPos));
    const halfway = normalize(lightDir.add(viewDir));
    const specular = pow(max(dot(n, halfway), 0), 32) * 0.4;
    const lit = vColor.mul(ambient + diffuse).add(vec3(1, 1, 1).scale(specular));
    return vec4(lit, 1);
  },
});
