import { shader, vec2, vec3, vec4 } from 'brometal';
import { strokeAA, sdHexagon, rotate2 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = rotate2(vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5), uTime * 0.3);
    const s = strokeAA(sdHexagon(p, 0.26), 0.015, 0.005);
    return vec4(vec3(0.55, 0.9, 1).scale(s).add(vec3(0.08, 0.08, 0.12).scale(1 - s)), 1);
  },
});
