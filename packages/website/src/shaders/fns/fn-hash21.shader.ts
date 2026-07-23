import { shader, vec2, vec4, floor } from 'brometal';
import { hash21 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const q = vec2(vUv.x * uAspect, vUv.y).scale(14);
    const n = hash21(vec2(floor(q.x), floor(q.y) + floor(uTime) * 31));
    return vec4(n, n, n, 1);
  },
});
