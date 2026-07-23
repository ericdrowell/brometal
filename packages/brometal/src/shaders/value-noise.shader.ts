import { shader, vec2, vec3, vec4 } from 'brometal';
import { vnoise2 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const p = vec2(vUv.x * uAspect, vUv.y).scale(8);
    const drift = vec2(uTime * 0.4, uTime * 0.15);
    const n = vnoise2(p.add(drift));
    return vec4(vec3(n, n, n), 1);
  },
});
