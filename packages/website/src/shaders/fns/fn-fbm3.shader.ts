import { shader, vec2, vec3, vec4 } from 'brometal';
import { fbm3 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = vec2(vUv.x * uAspect, vUv.y).scale(3);
    const n = fbm3(vec3(p.x, p.y, uTime * 0.35), 5);
    return vec4(n, n, n, 1);
  },
});
