import { shader, vec2, vec3, vec4, normalize, dot, max, mix } from 'brometal';
import { fbm2 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uViewProj: 'mat4', uModel: 'mat4', uTime: 'float', uLightDir: 'vec3', uAmp: 'float' },
  varyings: { vNormal: 'vec3', vHeight: 'float' },

  vertex({ aPosition, aUv }, { uViewProj, uModel, uTime, uAmp }, v) {
    const q = aUv.scale(5).add(vec2(uTime * 0.22, uTime * 0.09));
    const h = fbm2(q, 4);
    const e = 0.04;
    const hx = fbm2(q.add(vec2(e, 0)), 4);
    const hy = fbm2(q.add(vec2(0, e)), 4);
    const normal = normalize(vec3((h - hx) * uAmp * 20, (h - hy) * uAmp * 20, 1));
    v.vNormal = uModel.mul(vec4(normal, 0)).xyz;
    v.vHeight = h;
    const displaced = vec4(aPosition.x, aPosition.y, (h - 0.5) * uAmp, 1);
    return uViewProj.mul(uModel.mul(displaced));
  },

  fragment({ uLightDir }, { vNormal, vHeight }) {
    const diffuse = max(dot(normalize(vNormal), normalize(uLightDir)), 0);
    const low = vec3(0.1, 0.25, 0.35);
    const high = vec3(0.85, 0.8, 0.7);
    return vec4(mix(low, high, vHeight).scale(0.3 + diffuse * 0.8), 1);
  },
});
