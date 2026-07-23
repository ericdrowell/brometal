import { shader, vec2, vec4 } from 'brometal';
import { curl2 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = vec2(vUv.x * uAspect, vUv.y).scale(3).add(vec2(uTime * 0.2, 0));
    const v = curl2(p);
    return vec4(v.x * 0.04 + 0.5, v.y * 0.04 + 0.5, 0.8, 1);
  },
});
