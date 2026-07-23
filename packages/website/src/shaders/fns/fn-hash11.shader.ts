import { shader, vec2, vec4, floor } from 'brometal';
import { hash11 } from 'brometal/shader-functions';

export default shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  uniforms: { uTime: 'float', uAspect: 'float' },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition, aUv }, _u, v) {
    v.vUv = aUv;
    return vec4(aPosition, 1);
  },

  fragment({ uTime, uAspect }, { vUv }) {
    const n = hash11(floor(vUv.x * 24) + floor(uTime) * 24);
    return vec4(n, n, n, 1);
  },
});
